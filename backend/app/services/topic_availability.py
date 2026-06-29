from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import DisciplineTopic, Question, TeacherTopicTest, TestSession


def aware_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


@dataclass(frozen=True)
class TopicAvailability:
    topic_id: int
    student_id: int
    test: TeacherTopicTest | None
    active_session_id: int | None
    actual_questions_count: int
    completed_sessions_count: int
    attempts_allowed: int
    attempts_left: int
    available: bool
    unavailable_reason: str | None
    next_attempt_available_at: datetime | None
    available_from: datetime | None = None
    available_until: datetime | None = None

    @property
    def has_active_session(self) -> bool:
        return self.active_session_id is not None

    @property
    def configured_question_count(self) -> int:
        return self.test.question_count if self.test else self.actual_questions_count

    @property
    def time_limit_minutes(self) -> int:
        return self.test.time_limit_minutes if self.test else 0


async def calculate_topic_availability(
    session: AsyncSession,
    student_id: int,
    topic: DisciplineTopic,
    *,
    now: datetime | None = None,
    test: TeacherTopicTest | None = None,
) -> TopicAvailability:
    current_time = aware_utc(now) or datetime.now(timezone.utc)
    if test is None:
        test = (await session.execute(
            select(TeacherTopicTest)
            .where(TeacherTopicTest.topic_id == topic.topic_id)
            .order_by(TeacherTopicTest.teacher_id.asc())
        )).scalars().first()

    actual_questions_count = int((await session.execute(
        select(func.count()).select_from(Question).where(
            Question.topic_id == topic.topic_id,
            Question.archived_at.is_(None),
        )
    )).scalar_one() or 0)
    active_session_id = (await session.execute(
        select(TestSession.session_id).where(
            TestSession.student_id == student_id,
            TestSession.topic_id == topic.topic_id,
            TestSession.completed_at.is_(None),
        ).limit(1)
    )).scalar_one_or_none()
    completed_sessions_count = int((await session.execute(
        select(func.count()).select_from(TestSession).where(
            TestSession.student_id == student_id,
            TestSession.topic_id == topic.topic_id,
            TestSession.completed_at.isnot(None),
        )
    )).scalar_one() or 0)

    attempts_allowed = test.attempts_allowed if test else 0
    attempts_left = max(0, attempts_allowed - completed_sessions_count)
    next_attempt_available_at = None
    last_finished = None
    if test and test.attempt_delay_minutes:
        last_finished = (await session.execute(
            select(TestSession)
            .where(
                TestSession.student_id == student_id,
                TestSession.topic_id == topic.topic_id,
                TestSession.completed_at.isnot(None),
            )
            .order_by(TestSession.completed_at.desc())
            .limit(1)
        )).scalar_one_or_none()
        if last_finished and last_finished.completed_at:
            candidate = aware_utc(last_finished.completed_at) + timedelta(minutes=test.attempt_delay_minutes)
            if candidate > current_time:
                next_attempt_available_at = candidate

    available_from = test.available_from if test else None
    available_until = test.available_until if test else None

    from app.db.models import Student, TeacherTopicTestGroupRule
    student_group_id = (await session.execute(
        select(Student.group_id).where(Student.student_id == student_id)
    )).scalar_one_or_none()

    if student_group_id is not None:
        group_rule = (await session.execute(
            select(TeacherTopicTestGroupRule).where(
                TeacherTopicTestGroupRule.topic_id == topic.topic_id,
                TeacherTopicTestGroupRule.group_id == student_group_id
            )
        )).scalars().first()
        if group_rule:
            available_from = group_rule.available_from
            available_until = group_rule.available_until

    available = True
    reason: str | None = None
    if test is None or not test.is_enabled:
        available = False
        reason = "тест не настроен"
    elif actual_questions_count <= 0:
        available = False
        reason = "нет вопросов"
    elif actual_questions_count < test.question_count:
        available = False
        reason = f"недостаточно вопросов: доступно {actual_questions_count} из {test.question_count}"
    elif aware_utc(available_from) and current_time < aware_utc(available_from):
        available = False
        reason = "окно доступности еще не началось"
    elif aware_utc(available_until) and current_time > aware_utc(available_until):
        available = False
        reason = "окно доступности закрыто"
    elif attempts_left <= 0:
        available = False
        reason = "попытки исчерпаны"
    elif next_attempt_available_at is not None:
        available = False
        mins = int((next_attempt_available_at - current_time).total_seconds() / 60) + 1
        reason = f"следующая попытка будет доступна через {mins} мин."

    return TopicAvailability(
        topic_id=topic.topic_id,
        student_id=student_id,
        test=test,
        active_session_id=active_session_id,
        actual_questions_count=actual_questions_count,
        completed_sessions_count=completed_sessions_count,
        attempts_allowed=attempts_allowed,
        attempts_left=attempts_left,
        available=available,
        unavailable_reason=reason,
        next_attempt_available_at=next_attempt_available_at,
        available_from=available_from,
        available_until=available_until,
    )


async def count_available_topic_tests(
    session: AsyncSession,
    student_id: int,
    discipline_id: int,
) -> int:
    topics = (await session.execute(
        select(DisciplineTopic).where(
            DisciplineTopic.discipline_id == discipline_id,
            DisciplineTopic.archived_at.is_(None),
        )
    )).scalars().all()
    count = 0
    for topic in topics:
        state = await calculate_topic_availability(session, student_id, topic)
        if state.available:
            count += 1
    return count
