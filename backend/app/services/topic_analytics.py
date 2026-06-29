from __future__ import annotations

from collections import defaultdict
from statistics import median
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Discipline, DisciplineTopic, Group, Student, TeacherTopicTest, TestSession
from app.schemas.v2 import (
    TopicAnalyticsBrief,
    TopicAnalyticsGroupPoint,
    TopicAnalyticsOut,
    TopicAnalyticsQuestionStat,
    TopicAnalyticsSummary,
    TopicAnalyticsTrendPoint,
    TopicScoreDistributionBucket,
)
from app.services.grading_v2 import grade_session


def _percent(score: int | None, max_score: int | None) -> float | None:
    if not max_score:
        return None
    return round(float(score or 0) * 100.0 / float(max_score), 2)


def _avg(values: list[float]) -> float | None:
    if not values:
        return None
    return round(sum(values) / len(values), 2)


def _pass_rate(values: list[float], passing_score_percent: int | None) -> float | None:
    if not values or passing_score_percent is None:
        return None
    passed = sum(1 for value in values if value >= passing_score_percent)
    return round(passed * 100.0 / len(values), 2)


def _distribution(values: list[float]) -> list[TopicScoreDistributionBucket]:
    buckets = [
        ("0-49", 0, 49),
        ("50-69", 50, 69),
        ("70-84", 70, 84),
        ("85-100", 85, 100),
    ]
    result: list[TopicScoreDistributionBucket] = []
    for label, min_percent, max_percent in buckets:
        count = sum(1 for value in values if min_percent <= value <= max_percent)
        result.append(TopicScoreDistributionBucket(
            label=label,
            min_percent=min_percent,
            max_percent=max_percent,
            count=count,
        ))
    return result


async def _teacher_topic(
    session: AsyncSession,
    *,
    teacher_id: int,
    topic_id: int,
) -> tuple[DisciplineTopic, Discipline]:
    row = (await session.execute(
        select(DisciplineTopic, Discipline)
        .join(Discipline, Discipline.discipline_id == DisciplineTopic.discipline_id)
        .join(TeacherTopicTest, TeacherTopicTest.topic_id == DisciplineTopic.topic_id)
        .where(
            TeacherTopicTest.teacher_id == teacher_id,
            DisciplineTopic.topic_id == topic_id,
        )
    )).first()
    if row is not None:
        return row[0], row[1]
    row = (await session.execute(
        select(DisciplineTopic, Discipline)
        .join(Discipline, Discipline.discipline_id == DisciplineTopic.discipline_id)
        .where(
            DisciplineTopic.topic_id == topic_id,
            Discipline.discipline_id.in_(
                select(TestSession.discipline_id).where(TestSession.teacher_id == teacher_id)
            ),
        )
    )).first()
    if row is None:
        raise ValueError("topic not found")
    return row[0], row[1]


async def list_topic_analytics_briefs(
    session: AsyncSession,
    *,
    teacher_id: int,
    discipline_id: int | None = None,
) -> list[TopicAnalyticsBrief]:
    topic_rows = (
        select(DisciplineTopic, Discipline)
        .join(Discipline, Discipline.discipline_id == DisciplineTopic.discipline_id)
        .join(TeacherTopicTest, TeacherTopicTest.topic_id == DisciplineTopic.topic_id)
        .where(TeacherTopicTest.teacher_id == teacher_id)
    )
    if discipline_id is not None:
        topic_rows = topic_rows.where(DisciplineTopic.discipline_id == discipline_id)
    topics = (await session.execute(
        topic_rows.order_by(Discipline.name.asc(), DisciplineTopic.sort_order.asc(), DisciplineTopic.name.asc())
    )).all()
    if not topics:
        return []

    result: list[TopicAnalyticsBrief] = []
    for topic, discipline in topics:
        sessions = (await session.execute(
            select(TestSession)
            .where(
                TestSession.teacher_id == teacher_id,
                TestSession.topic_id == topic.topic_id,
                TestSession.completed_at.isnot(None),
            )
        )).scalars().all()
        percents = [
            pct for pct in (_percent(item.score, item.max_score) for item in sessions)
            if pct is not None
        ]
        students = {item.student_id for item in sessions}
        last_attempt_at = max((item.completed_at for item in sessions if item.completed_at), default=None)
        result.append(TopicAnalyticsBrief(
            topic_id=topic.topic_id,
            topic_name=topic.name,
            discipline_id=discipline.discipline_id,
            discipline_name=discipline.name,
            attempts_total=len(sessions),
            students_total=len(students),
            avg_score_percent=_avg(percents),
            last_attempt_at=last_attempt_at,
        ))
    return result


async def build_topic_analytics(
    session: AsyncSession,
    *,
    teacher_id: int,
    topic_id: int,
) -> TopicAnalyticsOut:
    topic, discipline = await _teacher_topic(session, teacher_id=teacher_id, topic_id=topic_id)
    test = (await session.execute(
        select(TeacherTopicTest).where(
            TeacherTopicTest.teacher_id == teacher_id,
            TeacherTopicTest.topic_id == topic_id,
        )
    )).scalar_one_or_none()
    sessions = (await session.execute(
        select(TestSession)
        .where(
            TestSession.teacher_id == teacher_id,
            TestSession.topic_id == topic_id,
            TestSession.completed_at.isnot(None),
        )
        .order_by(TestSession.completed_at.asc(), TestSession.session_id.asc())
    )).scalars().all()
    percents_by_session = {
        item.session_id: pct
        for item in sessions
        if (pct := _percent(item.score, item.max_score)) is not None
    }
    percents = list(percents_by_session.values())
    passing_score_percent = test.passing_score_percent if test else None

    trend_values: dict[str, list[float]] = defaultdict(list)
    for item in sessions:
        pct = percents_by_session.get(item.session_id)
        if pct is None or item.completed_at is None:
            continue
        trend_values[item.completed_at.date().isoformat()].append(pct)
    trend = [
        TopicAnalyticsTrendPoint(
            date=date_key,
            attempts_count=len(values),
            avg_score_percent=_avg(values),
        )
        for date_key, values in sorted(trend_values.items())
    ]

    group_rows = (await session.execute(
        select(TestSession, Group.group_id, Group.name)
        .join(Student, Student.student_id == TestSession.student_id)
        .outerjoin(Group, Group.group_id == Student.group_id)
        .where(
            TestSession.teacher_id == teacher_id,
            TestSession.topic_id == topic_id,
            TestSession.completed_at.isnot(None),
        )
    )).all()
    grouped: dict[tuple[int | None, str], dict[str, Any]] = {}
    for sess, group_id, group_name in group_rows:
        key = (group_id, group_name or "Без группы")
        bucket = grouped.setdefault(key, {"percents": [], "students": set(), "last": None})
        pct = percents_by_session.get(sess.session_id)
        if pct is not None:
            bucket["percents"].append(pct)
        bucket["students"].add(sess.student_id)
        if sess.completed_at and (bucket["last"] is None or sess.completed_at > bucket["last"]):
            bucket["last"] = sess.completed_at
    groups = [
        TopicAnalyticsGroupPoint(
            group_id=group_id,
            group_name=group_name,
            attempts_count=len(data["percents"]),
            students_count=len(data["students"]),
            avg_score_percent=_avg(data["percents"]),
            pass_rate_percent=_pass_rate(data["percents"], passing_score_percent),
            last_attempt_at=data["last"],
        )
        for (group_id, group_name), data in grouped.items()
    ]
    groups.sort(key=lambda item: (item.avg_score_percent is None, item.avg_score_percent or 101, item.group_name.lower()))

    question_stats: dict[int, dict[str, Any]] = {}
    for sess in sessions:
        breakdown = await grade_session(session, sess)
        for item in breakdown.per_question:
            question_id = int(item["question_id"])
            stat = question_stats.setdefault(question_id, {
                "question_id": question_id,
                "question_text": item.get("question_text") or f"Вопрос #{question_id}",
                "qtype": item.get("qtype") or "single",
                "attempts": 0,
                "correct": 0,
            })
            stat["attempts"] += 1
            if item.get("is_correct"):
                stat["correct"] += 1
            if item.get("question_text"):
                stat["question_text"] = item["question_text"]
            if item.get("qtype"):
                stat["qtype"] = item["qtype"]
    difficult_questions = []
    for stat in question_stats.values():
        attempts = int(stat["attempts"])
        correct = int(stat["correct"])
        difficult_questions.append(TopicAnalyticsQuestionStat(
            question_id=int(stat["question_id"]),
            question_text=str(stat["question_text"]),
            qtype=str(stat["qtype"]),
            attempts_count=attempts,
            correct_percent=round(correct * 100.0 / attempts, 2) if attempts else None,
            wrong_count=max(0, attempts - correct),
        ))
    difficult_questions.sort(key=lambda item: (item.correct_percent is None, item.correct_percent or 101, -item.attempts_count))

    summary = TopicAnalyticsSummary(
        topic_id=topic.topic_id,
        topic_name=topic.name,
        discipline_id=discipline.discipline_id,
        discipline_name=discipline.name,
        attempts_total=len(sessions),
        students_total=len({item.student_id for item in sessions}),
        avg_score_percent=_avg(percents),
        median_score_percent=round(float(median(percents)), 2) if percents else None,
        pass_rate_percent=_pass_rate(percents, passing_score_percent),
        min_score_percent=round(min(percents), 2) if percents else None,
        max_score_percent=round(max(percents), 2) if percents else None,
        passing_score_percent=passing_score_percent,
        last_attempt_at=max((item.completed_at for item in sessions if item.completed_at), default=None),
    )
    return TopicAnalyticsOut(
        summary=summary,
        distribution=_distribution(percents),
        trend=trend,
        groups=groups,
        difficult_questions=difficult_questions[:20],
    )
