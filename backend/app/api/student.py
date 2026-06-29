from __future__ import annotations

import json
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncIterator, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, require_student, get_current_user
from app.core.rate_limit import change_password_limiter
from app.core.security import decode_token, hash_password, verify_password
from app.db.models import (
    AnswerComment,
    AnswerExtra,
    AnswerOption,
    AttemptsPolicy,
    Discipline,
    DisciplineImage,
    DisciplineTopic,
    DisciplineTopicImage,
    Question,
    QuestionClozeBlank,
    QuestionImage,
    Notification,
    Group,
    Student,
    StudentAnswer,
    TeacherDiscipline,
    TeacherTopicTest,
    TestPolicyVersion,
    TestSession,
    UserCredential,
    AnswerFileUpload,
    FileUploadGrade,
)
from app.notifications.bus import bus
from app.db.session import get_session
from app.schemas.student import (
    AnswerIn,
    AnswerSubmitBatch,
    DisciplineWithTest,
    FinishOut,
    OptionOut,
    QuestionOut,
    RecommendationTopicOut,
    ResumeOut,
    SessionHistoryOut,
    SessionListItem,
    SessionRecommendationsOut,
    StudentDashboardActiveSession,
    StudentDashboardDeadline,
    StudentDashboardHistoryItem,
    StudentDashboardOut,
    StudentDashboardStats,
    StudentDashboardStudent,
    StudentDashboardTopicProgress,
    StudentActivityOut,
    StudentComplaintIn,
    StudentTopicOut,
    StudentTopicDetailOut,
    StudentTopicHistoryItem,
    StudentTopicsOut,
    StudentDisciplinesOut,
    StudentNotificationOut,
    StudentNotificationsOut,
    StudentSessionAnswerDetailOut,
    StudentSessionDetailOut,
    StudentStudyQuestionOut,
    TestStartOut,
    TopicTestMetadata,
    TopicGradeResponse,
    SessionSummary,
    AnswerFileUploadStudentOut,
    SessionFileUploadStatusOut,
    FileQuestionStatusOut,
    FileUploadGradeStudentOut,
)
from app.services.grade_calculator import calculate_final_grade
from app.services.grading_v2 import grade_session
from app.services.audit_trail import client_ip, record_audit
from app.services.notifications_helpers import store_and_publish
from app.services.teacher_notifications import notify_teacher, notify_teacher_once
from app.services.question_images import discipline_image_url, question_image_url, topic_image_url
from app.services.randomization import OptionDTO, QuestionDTO, shuffle_options, shuffle_questions
from app.services.student_access import assigned_discipline_ids_stmt, student_can_access_discipline
from app.services.student_activity import build_student_activity, student_activity_summary
from app.services.student_test_modes import count_enabled_topic_tests, discipline_test_mode
from app.services.topic_availability import (
    calculate_topic_availability,
    count_available_topic_tests,
)
from app.services.file_storage import save_student_file, delete_student_file, FileValidationError
from app.services.versioning import (
    attach_question_versions_to_session,
    ensure_discipline_policy_version,
    ensure_topic_policy_version,
    policy_snapshot_value,
    session_question_snapshots,
    session_snapshots_to_question_ids,
    snapshot_correct_answer,
    snapshot_correct_answer_render,
    snapshot_options,
    snapshot_question_meta,
    snapshot_student_answer_render,
    snapshot_student_answer_text,
    snapshot_to_question_dto,
)

try:
    from weasyprint import HTML as _WeasyHTML  # type: ignore
    _HAS_WEASY = True
except Exception:
    _WeasyHTML = None
    _HAS_WEASY = False

router = APIRouter(prefix="/api/student", tags=["student"])


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def _time_limit_for_session(session: AsyncSession, sess: TestSession) -> int:
    if sess.policy_version_id is not None:
        policy_snapshot = (await session.execute(
            select(TestPolicyVersion.snapshot)
            .where(TestPolicyVersion.policy_version_id == sess.policy_version_id)
        )).scalar_one_or_none()
        if isinstance(policy_snapshot, dict):
            return int(policy_snapshot.get("time_limit_minutes") or 30)
    if sess.topic_id is not None:
        topic_test = (await session.execute(
            select(TeacherTopicTest).where(
                TeacherTopicTest.topic_id == sess.topic_id,
                TeacherTopicTest.teacher_id == sess.teacher_id,
            )
        )).scalar_one_or_none()
        return topic_test.time_limit_minutes if topic_test else 30
    td = (await session.execute(
        select(TeacherDiscipline).where(
            TeacherDiscipline.discipline_id == sess.discipline_id,
            TeacherDiscipline.teacher_id == sess.teacher_id,
        )
    )).scalar_one_or_none()
    return td.time_limit_minutes if td else 30


async def _answered_count(session: AsyncSession, session_id: int) -> int:
    return int((await session.execute(
        select(func.count()).select_from(StudentAnswer).where(StudentAnswer.session_id == session_id)
    )).scalar_one() or 0)


async def _question_points(session: AsyncSession, q_ids: list[int]) -> dict[int, float]:
    """tz-student-role-improvement.md §5.2 — баллы за каждый вопрос (по умолчанию 1)."""
    if not q_ids:
        return {}
    rows = (await session.execute(
        select(Question.question_id, Question.points).where(Question.question_id.in_(q_ids))
    )).all()
    return {qid: float(pts) if pts is not None else 1.0 for qid, pts in rows}


def _session_percent(sess: TestSession) -> float | None:
    if sess.completed_at is None or not sess.max_score:
        return None
    return round((sess.score or 0) * 100.0 / sess.max_score, 1)


async def _topic_metadata(
    session: AsyncSession,
    sess: TestSession,
    test: TeacherTopicTest | None,
) -> TopicTestMetadata | None:
    """Собрать метаданные теста для шапки TestRunner / окна старта."""
    if sess.topic_id is None:
        return None
    discipline_title = (await session.execute(
        select(Discipline.name).where(Discipline.discipline_id == sess.discipline_id)
    )).scalar_one_or_none() or "Дисциплина"
    topic_title = (await session.execute(
        select(DisciplineTopic.name).where(DisciplineTopic.topic_id == sess.topic_id)
    )).scalar_one_or_none() or "Тема"
    policy_snapshot = None
    if sess.policy_version_id is not None:
        policy_snapshot = (await session.execute(
            select(TestPolicyVersion.snapshot)
            .where(TestPolicyVersion.policy_version_id == sess.policy_version_id)
        )).scalar_one_or_none()
    return TopicTestMetadata(
        discipline_title=discipline_title,
        topic_title=topic_title,
        max_attempts=policy_snapshot_value(policy_snapshot, "attempts_allowed", test.attempts_allowed if test else 0),
        current_attempt=sess.attempt_no,
        time_limit_minutes=policy_snapshot_value(policy_snapshot, "time_limit_minutes", test.time_limit_minutes if test else None),
        passing_score_percent=policy_snapshot_value(policy_snapshot, "passing_score_percent", test.passing_score_percent if test else None),
        show_question_points=bool(policy_snapshot_value(policy_snapshot, "show_question_points", bool(test.show_question_points) if test else True)),
        grading_method=policy_snapshot_value(policy_snapshot, "grading_method", test.grading_method if test else "best"),
        shuffle_questions=bool(policy_snapshot_value(policy_snapshot, "shuffle_seed", bool(test.shuffle_seed) if test else False)),
        grade_scale=policy_snapshot_value(policy_snapshot, "grade_scale", test.grade_scale if test else "5_point"),
    )


async def _show_correctness_for_session(session: AsyncSession, sess: TestSession) -> bool:
    if sess.completed_at is None:
        return False
    if sess.policy_version_id is not None:
        policy_snapshot = (await session.execute(
            select(TestPolicyVersion.snapshot)
            .where(TestPolicyVersion.policy_version_id == sess.policy_version_id)
        )).scalar_one_or_none()
        if isinstance(policy_snapshot, dict):
            return bool(policy_snapshot.get("show_correct_after_finish", True))
    if sess.topic_id is not None:
        policy = (await session.execute(
            select(TeacherTopicTest).where(
                TeacherTopicTest.topic_id == sess.topic_id,
                TeacherTopicTest.teacher_id == sess.teacher_id,
            )
        )).scalar_one_or_none()
        return bool(policy.show_correct_after_finish) if policy else True
    policy = (await session.execute(
        select(AttemptsPolicy).where(
            AttemptsPolicy.teacher_id == sess.teacher_id,
            AttemptsPolicy.discipline_id == sess.discipline_id,
        )
    )).scalar_one_or_none()
    return bool(policy.show_correct_after_finish) if policy else True


def _answer_text_from_extra(qtype: str, extra: AnswerExtra | None) -> Optional[str]:
    if extra is None:
        return None
    if qtype == "match" and extra.match_pairs:
        return "; ".join(f"{p.get('left')} -> {p.get('right')}" for p in extra.match_pairs if isinstance(p, dict))
    if qtype == "multi" and extra.match_pairs:
        return ", ".join(str(x) for x in extra.match_pairs)
    return extra.short_answer_raw


def _answer_render_from_extra(
    qtype: str,
    extra: AnswerExtra | None,
    selected_option: AnswerOption | None,
    options_by_id: dict[int, AnswerOption],
) -> dict | None:
    if extra is None and selected_option is None:
        return None
    if qtype == "multi":
        ids = [int(x) for x in (extra.match_pairs or []) if str(x).isdigit()] if extra else []
        return {
            "kind": "multi",
            "option_ids": ids,
            "option_texts": [options_by_id[oid].text for oid in ids if oid in options_by_id],
        }
    if qtype == "match":
        return {"kind": "match", "pairs": extra.match_pairs or []} if extra else None
    if qtype == "order":
        ids: list[int] = []
        if extra and extra.short_answer_raw:
            ids = [int(x) for x in extra.short_answer_raw.split(",") if x.strip().isdigit()]
        return {
            "kind": "order",
            "option_ids": ids,
            "option_texts": [options_by_id[oid].text for oid in ids if oid in options_by_id],
        }
    if qtype == "bool":
        value = None
        if extra and extra.short_answer_raw in ("true", "false"):
            value = extra.short_answer_raw == "true"
        return {"kind": "bool", "value": value}
    if qtype == "cloze":
        values: Any = {}
        if extra and extra.short_answer_raw:
            try:
                values = json.loads(extra.short_answer_raw)
            except (TypeError, ValueError):
                values = {}
        return {"kind": "cloze", "values": values}
    return {
        "kind": qtype,
        "selected_option_text": selected_option.text if selected_option else None,
        "selected_option_id": selected_option.option_id if selected_option else None,
        "value": _answer_text_from_extra(qtype, extra) or (selected_option.text if selected_option else None),
    }


async def _correct_answer_render_for_question(
    session: AsyncSession,
    q: Question,
    options: list[AnswerOption],
) -> dict | None:
    if q.qtype in ("single", "short", "numeric"):
        correct = [o for o in options if o.is_correct]
        return {
            "kind": q.qtype,
            "option_ids": [o.option_id for o in correct],
            "option_texts": [o.text for o in correct],
            "value": ", ".join(o.text for o in correct) if correct else None,
        }
    if q.qtype == "multi":
        correct = [o for o in options if o.is_correct]
        return {
            "kind": "multi",
            "option_ids": [o.option_id for o in correct],
            "option_texts": [o.text for o in correct],
        }
    if q.qtype == "bool":
        return {"kind": "bool", "value": bool(q.correct_bool)}
    if q.qtype == "match":
        return {"kind": "match", "pairs": q.match_pairs or []}
    if q.qtype == "order":
        ordered = sorted([o for o in options if o.correct_position is not None], key=lambda o: o.correct_position or 0)
        return {
            "kind": "order",
            "option_ids": [o.option_id for o in ordered],
            "option_texts": [o.text for o in ordered],
        }
    if q.qtype == "text":
        rows = (await session.execute(
            text("SELECT answer FROM question_acceptable_answers WHERE question_id = :qid ORDER BY ord").bindparams(qid=q.question_id)
        )).all()
        return {"kind": "text", "values": [r[0] for r in rows]}
    if q.qtype == "cloze":
        rows = (await session.execute(
            select(QuestionClozeBlank).where(QuestionClozeBlank.question_id == q.question_id).order_by(QuestionClozeBlank.blank_index)
        )).scalars().all()
        blanks: list[dict] = []
        for b in rows:
            value = None
            if b.kind == "select" and b.options and b.correct_index is not None and 0 <= b.correct_index < len(b.options):
                value = b.options[b.correct_index]
            elif b.acceptable_answers:
                value = b.acceptable_answers
            blanks.append({"index": b.blank_index, "kind": b.kind, "value": value})
        return {"kind": "cloze", "blanks": blanks}
    return None


async def _correct_answer_for_question(session: AsyncSession, q: Question, options: list[AnswerOption]) -> Optional[str]:
    if q.qtype in ("single", "multi", "short", "numeric"):
        correct = [o.text for o in options if o.is_correct]
        return ", ".join(correct) if correct else None
    if q.qtype == "bool":
        return "Верно" if q.correct_bool else "Неверно"
    if q.qtype == "match" and q.match_pairs:
        return "; ".join(f"{p.get('left')} -> {p.get('right')}" for p in q.match_pairs if isinstance(p, dict))
    if q.qtype == "order":
        ordered = sorted([o for o in options if o.correct_position is not None], key=lambda o: o.correct_position or 0)
        return " -> ".join(o.text for o in ordered)
    if q.qtype == "text":
        rows = (await session.execute(
            text("SELECT answer FROM question_acceptable_answers WHERE question_id = :qid ORDER BY ord").bindparams(qid=q.question_id)
        )).all()
        return ", ".join(r[0] for r in rows) if rows else None
    if q.qtype == "cloze":
        rows = (await session.execute(
            select(QuestionClozeBlank).where(QuestionClozeBlank.question_id == q.question_id).order_by(QuestionClozeBlank.blank_index)
        )).scalars().all()
        parts: list[str] = []
        for b in rows:
            if b.kind == "select" and b.options and b.correct_index is not None and 0 <= b.correct_index < len(b.options):
                parts.append(f"{b.blank_index}: {b.options[b.correct_index]}")
            elif b.acceptable_answers:
                parts.append(f"{b.blank_index}: {', '.join(str(x) for x in b.acceptable_answers)}")
        return "; ".join(parts) if parts else None
    return None


async def _questions_for_session_detail(session: AsyncSession, sess: TestSession) -> list[Question]:
    answered_ids = (await session.execute(
        select(StudentAnswer.question_id).where(StudentAnswer.session_id == sess.session_id)
    )).scalars().all()

    if sess.topic_id is not None:
        test = (await session.execute(
            select(TeacherTopicTest).where(
                TeacherTopicTest.topic_id == sess.topic_id,
                TeacherTopicTest.teacher_id == sess.teacher_id,
            )
        )).scalar_one_or_none()
        q_rows = (await session.execute(
            select(Question.question_id, Question.text, Question.qtype)
            .where(
                Question.topic_id == sess.topic_id,
                Question.archived_at.is_(None),
            )
            .order_by(Question.question_id)
            .limit(max((test.question_count if test else sess.max_score) or 1, 1) * 4)
        )).all()
        import random as _r
        pool = [(qid, t, qt) for qid, t, qt in q_rows]
        rng = _r.Random(sess.topic_id * 1000 + sess.student_id)
        rng.shuffle(pool)
        picked_ids = [qid for qid, _t, _qt in pool[:sess.max_score]]
        question_dtos = [QuestionDTO(question_id=qid, text=t, options=[]) for qid, t, _qt in pool if qid in picked_ids]
        seed = sess.student_id * 1000 + sess.topic_id if test and test.shuffle_seed else sess.topic_id
        ordered_ids = [q.question_id for q in shuffle_questions(question_dtos, seed=seed)]
    else:
        policy = (await session.execute(
            select(AttemptsPolicy).where(
                AttemptsPolicy.teacher_id == sess.teacher_id,
                AttemptsPolicy.discipline_id == sess.discipline_id,
            )
        )).scalar_one_or_none()
        td = (await session.execute(
            select(TeacherDiscipline).where(
                TeacherDiscipline.teacher_id == sess.teacher_id,
                TeacherDiscipline.discipline_id == sess.discipline_id,
            )
        )).scalar_one_or_none()
        question_count = td.question_count if td else sess.max_score
        q_rows = (await session.execute(
            select(Question.question_id, Question.text, Question.qtype)
            .where(
                Question.discipline_id == sess.discipline_id,
                Question.archived_at.is_(None),
            )
            .order_by(Question.question_id)
            .limit(max(question_count or sess.max_score or 1, 1) * 4)
        )).all()
        import random as _r
        pool = [(qid, t, qt) for qid, t, qt in q_rows]
        rng = _r.Random(sess.discipline_id * 1000 + sess.student_id)
        rng.shuffle(pool)
        picked_ids = [qid for qid, _t, _qt in pool[:sess.max_score]]
        question_dtos = [QuestionDTO(question_id=qid, text=t, options=[]) for qid, t, _qt in pool if qid in picked_ids]
        seed = sess.discipline_id if policy and not policy.shuffle_seed else sess.student_id * 1000 + sess.discipline_id
        ordered_ids = [q.question_id for q in shuffle_questions(question_dtos, seed=seed)]

    for qid in answered_ids:
        if qid not in ordered_ids:
            ordered_ids.append(qid)
    if not ordered_ids:
        return []
    questions_by_id = {
        q.question_id: q
        for q in (await session.execute(
            select(Question)
            .where(Question.question_id.in_(ordered_ids))
            .options(selectinload(Question.image))
        )).scalars().all()
    }
    return [questions_by_id[qid] for qid in ordered_ids if qid in questions_by_id]


def _notification_view(n: Notification) -> StudentNotificationOut:
    payload = n.payload or {}
    title = payload.get("title") or {
        "test_graded": "Тест оценён",
        "student_attempt_finished": "Тест завершён",
        "comment_added": "Новый комментарий",
        "test_available": "Доступен тест",
        "deadline_approaching": "Приближается дедлайн",
    }.get(n.event_type, "Уведомление")
    body = payload.get("body")
    if body is None and n.event_type == "test_graded":
        body = payload.get("summary")
    return StudentNotificationOut(
        notification_id=int(n.notification_id),
        type=n.event_type,
        title=title,
        body=body,
        is_read=n.read_at is not None,
        created_at=n.created_at,
        link=payload.get("link"),
        meta=payload.get("meta") or payload,
    )


async def _notification_exists(
    session: AsyncSession,
    user_id: int,
    event_type: str,
    meta_key: str,
) -> bool:
    rows = (await session.execute(
        select(Notification).where(
            Notification.user_role == "student",
            Notification.user_id == user_id,
            Notification.event_type == event_type,
        )
    )).scalars().all()
    for row in rows:
        payload = row.payload or {}
        meta = payload.get("meta") or {}
        if meta.get("key") == meta_key:
            return True
    return False


async def _ensure_student_availability_notifications(
    session: AsyncSession,
    student_id: int,
) -> None:
    now = _now_utc()
    deadline_until = now + timedelta(days=3)
    rows = (await session.execute(
        select(TeacherTopicTest, DisciplineTopic, Discipline.name)
        .join(DisciplineTopic, DisciplineTopic.topic_id == TeacherTopicTest.topic_id)
        .join(Discipline, Discipline.discipline_id == DisciplineTopic.discipline_id)
        .where(
            TeacherTopicTest.is_enabled.is_(True),
            DisciplineTopic.archived_at.is_(None),
            Discipline.discipline_id.in_(assigned_discipline_ids_stmt(student_id)),
        )
        .order_by(TeacherTopicTest.available_until.asc().nullslast(), Discipline.name.asc(), DisciplineTopic.sort_order.asc())
        .limit(80)
    )).all()
    created = 0
    for test, topic, discipline_name in rows:
        availability = await calculate_topic_availability(session, student_id, topic, test=test)
        if not availability.available:
            continue
        if availability.available_from is None:
            available_key = f"topic:{topic.topic_id}:available:always"
        else:
            available_key = f"topic:{topic.topic_id}:available:{_aware(availability.available_from).isoformat()}"
        if not await _notification_exists(session, student_id, "test_available", available_key):
            await store_and_publish(
                session,
                "student",
                student_id,
                "test_available",
                {
                    "title": "Доступен тест",
                    "body": f"{discipline_name} — {topic.name}",
                    "link": f"/student/topics/{topic.topic_id}",
                    "meta": {
                        "key": available_key,
                        "discipline_id": topic.discipline_id,
                        "discipline_name": discipline_name,
                        "topic_id": topic.topic_id,
                        "topic_name": topic.name,
                    },
                },
            )
            created += 1
        if availability.available_until is not None:
            until = _aware(availability.available_until)
            if until and now <= until <= deadline_until:
                deadline_key = f"topic:{topic.topic_id}:deadline:{until.date().isoformat()}"
                if not await _notification_exists(session, student_id, "deadline_approaching", deadline_key):
                    await store_and_publish(
                        session,
                        "student",
                        student_id,
                        "deadline_approaching",
                        {
                            "title": "Приближается дедлайн",
                            "body": f"{discipline_name} — {topic.name}: до {until.strftime('%d.%m.%Y %H:%M')}",
                            "link": f"/student/topics/{topic.topic_id}",
                            "meta": {
                                "key": deadline_key,
                                "discipline_id": topic.discipline_id,
                                "discipline_name": discipline_name,
                                "topic_id": topic.topic_id,
                                "topic_name": topic.name,
                                "available_until": until.isoformat(),
                            },
                        },
                        severity=1,
                    )
                    created += 1
        if created >= 20:
            break


def _sse(data: str, event: str | None = None) -> bytes:
    parts = []
    if event:
        parts.append(f"event: {event}")
    parts.append(f"data: {data}")
    parts.append("")
    parts.append("")
    return "\n".join(parts).encode("utf-8")


def _html_escape(value: object) -> str:
    import html
    return html.escape("" if value is None else str(value))


@router.get("/dashboard", response_model=StudentDashboardOut)
async def student_dashboard(
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
) -> StudentDashboardOut:
    student_row = (await session.execute(
        select(Student, Group.name)
        .outerjoin(Group, Group.group_id == Student.group_id)
        .where(Student.student_id == user.id)
    )).first()
    group_name = student_row[1] if student_row else None

    disciplines_count = int((await session.execute(
        select(func.count()).select_from(assigned_discipline_ids_stmt(user.id).subquery())
    )).scalar_one() or 0)
    completed_sessions_count = int((await session.execute(
        select(func.count()).select_from(TestSession).where(
            TestSession.student_id == user.id,
            TestSession.completed_at.isnot(None),
        )
    )).scalar_one() or 0)
    active_sessions_count = int((await session.execute(
        select(func.count()).select_from(TestSession).where(
            TestSession.student_id == user.id,
            TestSession.completed_at.is_(None),
        )
    )).scalar_one() or 0)
    avg_score = (await session.execute(
        select(func.avg((TestSession.score * 100.0) / func.nullif(TestSession.max_score, 0))).where(
            TestSession.student_id == user.id,
            TestSession.completed_at.isnot(None),
            TestSession.max_score > 0,
        )
    )).scalar_one()

    active_rows = (await session.execute(
        select(TestSession, Discipline.name, DisciplineTopic.name)
        .join(Discipline, Discipline.discipline_id == TestSession.discipline_id)
        .outerjoin(DisciplineTopic, DisciplineTopic.topic_id == TestSession.topic_id)
        .where(TestSession.student_id == user.id, TestSession.completed_at.is_(None))
        .order_by(TestSession.started_at.desc())
        .limit(6)
    )).all()
    active_sessions: list[StudentDashboardActiveSession] = []
    for sess, dname, tname in active_rows:
        limit = await _time_limit_for_session(session, sess)
        started = _aware(sess.started_at) or _now_utc()
        active_sessions.append(StudentDashboardActiveSession(
            session_id=sess.session_id,
            discipline_name=dname,
            topic_name=tname,
            started_at=started,
            expires_at=started + timedelta(minutes=limit),
            answered_count=await _answered_count(session, sess.session_id),
            total_count=sess.max_score,
        ))

    deadline_rows = (await session.execute(
        select(TeacherTopicTest, DisciplineTopic, Discipline.name)
        .join(DisciplineTopic, DisciplineTopic.topic_id == TeacherTopicTest.topic_id)
        .join(Discipline, Discipline.discipline_id == DisciplineTopic.discipline_id)
        .where(
            TeacherTopicTest.is_enabled.is_(True),
            Discipline.discipline_id.in_(assigned_discipline_ids_stmt(user.id)),
            DisciplineTopic.archived_at.is_(None),
        )
    )).all()
    upcoming_deadlines: list[StudentDashboardDeadline] = []
    for test, topic, dname in deadline_rows:
        availability = await calculate_topic_availability(session, user.id, topic, test=test)
        if availability.available and availability.available_until is not None and availability.available_until >= _now_utc():
            upcoming_deadlines.append(StudentDashboardDeadline(
                topic_id=topic.topic_id,
                topic_name=topic.name,
                discipline_name=dname,
                available_until=availability.available_until,
                attempts_left=availability.attempts_left,
            ))
    upcoming_deadlines.sort(key=lambda x: x.available_until)
    upcoming_deadlines = upcoming_deadlines[:5]

    recent_rows = (await session.execute(
        select(TestSession, Discipline.name, DisciplineTopic.name)
        .join(Discipline, Discipline.discipline_id == TestSession.discipline_id)
        .outerjoin(DisciplineTopic, DisciplineTopic.topic_id == TestSession.topic_id)
        .where(TestSession.student_id == user.id, TestSession.completed_at.isnot(None))
        .order_by(TestSession.completed_at.desc())
        .limit(5)
    )).all()
    recent_history = [
        StudentDashboardHistoryItem(
            session_id=sess.session_id,
            discipline_name=dname,
            topic_name=tname,
            score=sess.score,
            max_score=sess.max_score,
            completed_at=sess.completed_at,
            status="completed",
        )
        for sess, dname, tname in recent_rows
    ]
    unread_notifications_count = int((await session.execute(
        select(func.count()).select_from(Notification).where(
            Notification.user_role == "student",
            Notification.user_id == user.id,
            Notification.read_at.is_(None),
        )
    )).scalar_one() or 0)

    discipline_rows = (await session.execute(
        select(Discipline.discipline_id, Discipline.name)
        .where(Discipline.discipline_id.in_(assigned_discipline_ids_stmt(user.id)))
        .order_by(Discipline.name.asc())
    )).all()
    topic_progress: list[StudentDashboardTopicProgress] = []
    for discipline_id, discipline_name in discipline_rows:
        topics = (await session.execute(
            select(DisciplineTopic)
            .where(
                DisciplineTopic.discipline_id == discipline_id,
                DisciplineTopic.archived_at.is_(None),
            )
            .order_by(DisciplineTopic.sort_order.asc(), DisciplineTopic.name.asc())
        )).scalars().all()
        completed_topic_ids = {
            int(topic_id)
            for topic_id in (await session.execute(
                select(func.distinct(TestSession.topic_id)).where(
                    TestSession.student_id == user.id,
                    TestSession.discipline_id == discipline_id,
                    TestSession.topic_id.isnot(None),
                    TestSession.completed_at.isnot(None),
                )
            )).scalars().all()
            if topic_id is not None
        }
        active_topic_ids = {int(topic.topic_id) for topic in topics}
        completed_topics_count = len(completed_topic_ids & active_topic_ids)
        discipline_avg_score = (await session.execute(
            select(func.avg((TestSession.score * 100.0) / func.nullif(TestSession.max_score, 0))).where(
                TestSession.student_id == user.id,
                TestSession.discipline_id == discipline_id,
                TestSession.completed_at.isnot(None),
                TestSession.max_score > 0,
            )
        )).scalar_one()
        available_topic_tests_count = 0
        first_available_topic: DisciplineTopic | None = None
        first_uncompleted_topic: DisciplineTopic | None = None
        first_available_attempts_left: int | None = None
        first_uncompleted_attempts_left: int | None = None
        for topic in topics:
            availability = await calculate_topic_availability(session, user.id, topic)
            if not availability.available:
                continue
            available_topic_tests_count += 1
            if first_available_topic is None:
                first_available_topic = topic
                first_available_attempts_left = availability.attempts_left
            if first_uncompleted_topic is None and int(topic.topic_id) not in completed_topic_ids:
                first_uncompleted_topic = topic
                first_uncompleted_attempts_left = availability.attempts_left
        next_topic = first_uncompleted_topic or first_available_topic
        next_attempts_left = first_uncompleted_attempts_left if first_uncompleted_topic else first_available_attempts_left

        topic_progress.append(StudentDashboardTopicProgress(
            discipline_id=discipline_id,
            discipline_name=discipline_name,
            topics_total=len(topics),
            topics_completed=completed_topics_count,
            available_topic_tests_count=available_topic_tests_count,
            average_score_percent=round(float(discipline_avg_score), 1) if discipline_avg_score is not None else None,
            next_topic_id=next_topic.topic_id if next_topic else None,
            next_topic_name=next_topic.name if next_topic else None,
            next_topic_attempts_left=next_attempts_left,
            test_mode=await discipline_test_mode(session, discipline_id),
        ))
    topic_progress.sort(key=lambda item: (
        item.next_topic_id is None,
        item.topics_total <= 0,
        item.topics_completed >= item.topics_total if item.topics_total > 0 else True,
        item.discipline_name.lower(),
    ))

    return StudentDashboardOut(
        student=StudentDashboardStudent(
            student_id=user.id,
            full_name=user.full_name,
            group_name=group_name,
        ),
        stats=StudentDashboardStats(
            disciplines_count=disciplines_count,
            completed_sessions_count=completed_sessions_count,
            active_sessions_count=active_sessions_count,
            average_score_percent=round(float(avg_score), 1) if avg_score is not None else None,
        ),
        active_sessions=active_sessions,
        upcoming_deadlines=upcoming_deadlines,
        topic_progress=topic_progress[:8],
        recent_history=recent_history,
        unread_notifications_count=unread_notifications_count,
    )


@router.get("/disciplines", response_model=StudentDisciplinesOut)
async def my_disciplines(
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
) -> StudentDisciplinesOut:
    td_rows = (await session.execute(
        select(
            TeacherDiscipline.discipline_id,
            TeacherDiscipline.time_limit_minutes,
            TeacherDiscipline.question_count,
            Discipline.name,
            Discipline.description,
            DisciplineImage.image_id,
        )
        .join(Discipline, Discipline.discipline_id == TeacherDiscipline.discipline_id)
        .outerjoin(DisciplineImage, DisciplineImage.discipline_id == Discipline.discipline_id)
        .where(TeacherDiscipline.discipline_id.in_(assigned_discipline_ids_stmt(user.id)))
        .order_by(TeacherDiscipline.discipline_id, TeacherDiscipline.assigned_at.asc())
    )).all()
    by_id: dict[int, DisciplineWithTest] = {}
    for d_id, tl, qc, name, desc, image_id in td_rows:
        if d_id in by_id:
            continue
        topics_count = (await session.execute(
            select(func.count()).select_from(DisciplineTopic).where(
                DisciplineTopic.discipline_id == d_id,
                DisciplineTopic.archived_at.is_(None),
            )
        )).scalar_one() or 0
        enabled_topic_tests_count = await count_enabled_topic_tests(session, d_id)
        test_mode = "topic" if enabled_topic_tests_count > 0 else "discipline"
        topic_tests_count = await count_available_topic_tests(session, user.id, d_id)
        completed_topic_tests_count = (await session.execute(
            select(func.count(func.distinct(TestSession.topic_id))).where(
                TestSession.student_id == user.id,
                TestSession.discipline_id == d_id,
                TestSession.topic_id.isnot(None),
                TestSession.completed_at.isnot(None),
            )
        )).scalar_one() or 0
        avg_score = (await session.execute(
            select(func.avg((TestSession.score * 100.0) / func.nullif(TestSession.max_score, 0))).where(
                TestSession.student_id == user.id,
                TestSession.discipline_id == d_id,
                TestSession.completed_at.isnot(None),
                TestSession.max_score > 0,
            )
        )).scalar_one()
        any_teacher = (await session.execute(
            select(TeacherDiscipline.teacher_id)
            .where(TeacherDiscipline.discipline_id == d_id)
            .order_by(TeacherDiscipline.assigned_at.asc())
            .limit(1)
        )).scalar_one_or_none()
        policy = None
        if any_teacher is not None:
            policy = (await session.execute(
                select(AttemptsPolicy).where(
                    AttemptsPolicy.teacher_id == any_teacher,
                    AttemptsPolicy.discipline_id == d_id,
                )
            )).scalar_one_or_none()
        completed_general = (await session.execute(
            select(func.count()).select_from(TestSession).where(
                TestSession.student_id == user.id,
                TestSession.discipline_id == d_id,
                TestSession.topic_id.is_(None),
                TestSession.completed_at.isnot(None),
            )
        )).scalar_one() or 0
        attempts_left = max(0, policy.attempts_allowed - int(completed_general)) if policy else None
        by_id[d_id] = DisciplineWithTest(
            discipline_id=d_id,
            discipline_name=name,
            description=desc,
            image_url=discipline_image_url(image_id) if image_id else None,
            test_mode=test_mode,
            time_limit_minutes=tl,
            question_count=qc,
            topics_count=int(topics_count),
            available_topic_tests_count=int(topic_tests_count),
            enabled_topic_tests_count=int(enabled_topic_tests_count),
            completed_topic_tests_count=int(completed_topic_tests_count),
            average_score_percent=round(float(avg_score), 1) if avg_score is not None else None,
            attempts_left=attempts_left,
            general_test_available=test_mode == "discipline" and (attempts_left is None or attempts_left > 0),
            available_from=policy.available_from if policy else None,
            available_until=policy.available_until if policy else None,
        )

    in_progress = (await session.execute(
        select(TestSession.discipline_id, TestSession.session_id, TestSession.attempt_no)
        .where(TestSession.student_id == user.id, TestSession.completed_at.is_(None))
    )).all()
    in_progress_map = {d_id: s_id for d_id, s_id, _ in in_progress}

    items = sorted(by_id.values(), key=lambda x: x.discipline_name)
    for it in items:
        if it.discipline_id in in_progress_map:
            it.has_active_session = True
            it.active_session_id = in_progress_map[it.discipline_id]
    return StudentDisciplinesOut(disciplines=items)


async def _student_topic_out(
    session: AsyncSession,
    student_id: int,
    topic: DisciplineTopic,
) -> StudentTopicOut:
    image = (await session.execute(
        select(DisciplineTopicImage).where(DisciplineTopicImage.topic_id == topic.topic_id)
    )).scalar_one_or_none()
    availability = await calculate_topic_availability(session, student_id, topic)
    test = availability.test
    last_session = (await session.execute(
        select(TestSession)
        .where(
            TestSession.student_id == student_id,
            TestSession.topic_id == topic.topic_id,
            TestSession.completed_at.isnot(None),
        )
        .order_by(TestSession.completed_at.desc())
        .limit(1)
    )).scalar_one_or_none()
    best_score = (await session.execute(
        select(func.max(TestSession.score)).where(
            TestSession.student_id == student_id,
            TestSession.topic_id == topic.topic_id,
            TestSession.completed_at.isnot(None),
        )
    )).scalar_one()

    return StudentTopicOut(
        topic_id=topic.topic_id,
        discipline_id=topic.discipline_id,
        name=topic.name,
        description=topic.description,
        image_url=topic_image_url(image.image_id) if image else None,
        question_count=availability.configured_question_count,
        time_limit_minutes=availability.time_limit_minutes,
        has_active_session=availability.has_active_session,
        active_session_id=availability.active_session_id,
        attempts_left=availability.attempts_left,
        available=availability.available,
        unavailable_reason=availability.unavailable_reason,
        available_from=availability.available_from,
        available_until=availability.available_until,
        attempts_allowed=availability.attempts_allowed,
        last_score=last_session.score if last_session else None,
        best_score=int(best_score) if best_score is not None else None,
        completed_sessions_count=availability.completed_sessions_count,
    )


@router.get("/disciplines/{discipline_id}/topics", response_model=StudentTopicsOut)
async def discipline_topics(
    discipline_id: int,
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
) -> StudentTopicsOut:
    if not await student_can_access_discipline(session, user.id, discipline_id):
        raise HTTPException(status_code=404, detail="discipline not found")
    topics = (await session.execute(
        select(DisciplineTopic).where(
            DisciplineTopic.discipline_id == discipline_id,
            DisciplineTopic.archived_at.is_(None),
        ).order_by(DisciplineTopic.sort_order.asc(), DisciplineTopic.name.asc())
    )).scalars().all()
    return StudentTopicsOut(
        topics=[await _student_topic_out(session, user.id, topic) for topic in topics]
    )


@router.get("/topic-policy")
async def topic_policy(
    topic_id: int,
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
):
    topic = (await session.execute(
        select(DisciplineTopic).where(DisciplineTopic.topic_id == topic_id)
    )).scalar_one_or_none()
    if topic is None or not await student_can_access_discipline(session, user.id, topic.discipline_id):
        raise HTTPException(status_code=404, detail="topic not found")
    return await _student_topic_out(session, user.id, topic)


@router.get("/topics/{topic_id}", response_model=StudentTopicDetailOut)
async def topic_detail(
    topic_id: int,
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
) -> StudentTopicDetailOut:
    topic = (await session.execute(
        select(DisciplineTopic).where(
            DisciplineTopic.topic_id == topic_id,
            DisciplineTopic.archived_at.is_(None),
        )
    )).scalar_one_or_none()
    if topic is None or not await student_can_access_discipline(session, user.id, topic.discipline_id):
        raise HTTPException(status_code=404, detail="topic not found")

    availability = await calculate_topic_availability(session, user.id, topic)
    test = availability.test
    image = (await session.execute(
        select(DisciplineTopicImage).where(DisciplineTopicImage.topic_id == topic.topic_id)
    )).scalar_one_or_none()
    question_rows = (await session.execute(
        select(Question)
        .where(
            Question.topic_id == topic.topic_id,
            Question.archived_at.is_(None),
        )
        .order_by(Question.question_id.asc())
        .options(selectinload(Question.image))
    )).scalars().all()
    allow_study = test.allow_study if test else True
    study_questions: list[StudentStudyQuestionOut] = []
    if allow_study:
        for q in question_rows[:30]:
            opts = (await session.execute(
                select(AnswerOption).where(AnswerOption.question_id == q.question_id).order_by(AnswerOption.option_number.asc())
            )).scalars().all()
            qrow = StudentStudyQuestionOut(
                question_id=q.question_id,
                question_text=q.text,
                qtype=q.qtype,
                image_url=question_image_url(q.image.image_id) if q.image else None,
                options=[OptionOut(option_id=o.option_id, option_number=o.option_number, option_text=o.text) for o in opts],
                qmeta=_censor_qmeta({
                    "qtype": q.qtype,
                    "short_pattern": q.short_pattern,
                    "numeric_tolerance": float(q.numeric_tolerance) if q.numeric_tolerance is not None else None,
                    "match_pairs": q.match_pairs or [],
                    "correct_bool": q.correct_bool,
                    "explanation": q.explanation,
                    "case_sensitive": q.case_sensitive,
                    "trim_whitespace": q.trim_whitespace,
                    "normalize_universal": q.normalize_universal,
                    "text_mode": q.text_mode,
                    "allow_partial": q.allow_partial,
                }),
            )
            study_questions.append(qrow)
    history_rows = (await session.execute(
        select(TestSession)
        .where(
            TestSession.student_id == user.id,
            TestSession.topic_id == topic.topic_id,
        )
        .order_by(TestSession.started_at.desc())
    )).scalars().all()
    finished_sessions = [s for s in history_rows if s.completed_at is not None]
    completed_sessions_count = len(finished_sessions)
    # tz §8.3 — сводная статистика и итоговая оценка.
    percents = [p for p in (_session_percent(s) for s in finished_sessions) if p is not None]
    best_percent = max(percents) if percents else None
    last_session = max(finished_sessions, key=lambda s: s.attempt_no, default=None)
    last_percent = _session_percent(last_session) if last_session else None
    average_percent = round(sum(percents) / len(percents), 1) if percents else None
    grading_method = test.grading_method if test else "best"
    _, final_percent = calculate_final_grade(finished_sessions, grading_method)
    best_session = max(finished_sessions, key=lambda s: (_session_percent(s) or 0), default=None)
    best_session_id = best_session.session_id if best_session else None
    is_passed: bool | None = None
    if test and test.passing_score_percent is not None and final_percent is not None:
        is_passed = final_percent >= test.passing_score_percent
    return StudentTopicDetailOut(
        topic_id=topic.topic_id,
        discipline_id=topic.discipline_id,
        discipline_name=(await session.execute(
            select(Discipline.name).where(Discipline.discipline_id == topic.discipline_id)
        )).scalar_one(),
        name=topic.name,
        description=topic.description,
        image_url=topic_image_url(image.image_id) if image else None,
        question_count=availability.configured_question_count,
        actual_questions_count=availability.actual_questions_count,
        time_limit_minutes=availability.time_limit_minutes,
        attempts_allowed=availability.attempts_allowed,
        attempts_left=availability.attempts_left,
        available=availability.available,
        unavailable_reason=availability.unavailable_reason,
        available_from=availability.available_from,
        available_until=availability.available_until,
        has_active_session=availability.has_active_session,
        active_session_id=availability.active_session_id,
        study_questions=study_questions,
        allow_study=allow_study,
        history=[
            StudentTopicHistoryItem(
                session_id=s.session_id,
                score=s.score,
                max_score=s.max_score,
                completed_at=s.completed_at,
                status="completed" if s.completed_at else "in_progress",
                attempt_number=s.attempt_no,
                started_at=s.started_at,
                percent=_session_percent(s),
                duration_seconds=(
                    max(0, int((s.completed_at - s.started_at).total_seconds()))
                    if s.completed_at and s.started_at else None
                ),
                is_best=(s.session_id == best_session_id),
            )
            for s in history_rows
        ],
        passing_score_percent=test.passing_score_percent if test else None,
        grading_method=grading_method,
        show_question_points=bool(test.show_question_points) if test else True,
        show_correct_after_finish=bool(test.show_correct_after_finish) if test else True,
        attempt_delay_minutes=test.attempt_delay_minutes if test else None,
        next_attempt_available_at=availability.next_attempt_available_at,
        shuffle_questions=bool(test.shuffle_seed) if test else False,
        best_percent=best_percent,
        last_percent=last_percent,
        average_percent=average_percent,
        is_passed=is_passed,
        grade_scale=test.grade_scale if test else "5_point",
    )


@router.get("/topics/{topic_id}/grade", response_model=TopicGradeResponse)
async def topic_grade(
    topic_id: int,
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
) -> TopicGradeResponse:
    """tz-student-role-improvement.md §8.6 — итоговая оценка за тест по теме."""
    topic = (await session.execute(
        select(DisciplineTopic).where(DisciplineTopic.topic_id == topic_id)
    )).scalar_one_or_none()
    if topic is None or not await student_can_access_discipline(session, user.id, topic.discipline_id):
        raise HTTPException(status_code=404, detail="topic not found")

    test = (await session.execute(
        select(TeacherTopicTest)
        .where(TeacherTopicTest.topic_id == topic_id)
        .order_by(TeacherTopicTest.teacher_id.asc())
    )).scalars().first()
    discipline_title = (await session.execute(
        select(Discipline.name).where(Discipline.discipline_id == topic.discipline_id)
    )).scalar_one_or_none() or "Дисциплина"

    all_sessions = (await session.execute(
        select(TestSession)
        .where(
            TestSession.student_id == user.id,
            TestSession.topic_id == topic_id,
        )
        .order_by(TestSession.attempt_no.asc())
    )).scalars().all()
    finished = [s for s in all_sessions if s.completed_at is not None]

    grading_method = test.grading_method if test else "best"
    max_attempts = test.attempts_allowed if test else 0
    passing = test.passing_score_percent if test else None

    final_score, final_percent = calculate_final_grade(finished, grading_method)
    max_score = float(finished[0].max_score) if finished and finished[0].max_score else (
        float(test.question_count) if test else None
    )
    is_passed = None
    if passing is not None and final_percent is not None:
        is_passed = final_percent >= passing

    best_id = None
    if finished:
        best_id = max(finished, key=lambda s: (_session_percent(s) or 0)).session_id

    attempts_used = len(finished)
    attempts_remaining = max(0, max_attempts - attempts_used) if max_attempts > 0 else None

    # Задержка между попытками.
    next_attempt_available_at = None
    if test and test.attempt_delay_minutes and finished:
        last_finished = max(finished, key=lambda s: s.attempt_no)
        if last_finished.completed_at:
            candidate = _aware(last_finished.completed_at) + timedelta(minutes=test.attempt_delay_minutes)
            if candidate > _now_utc():
                next_attempt_available_at = candidate

    summaries: list[SessionSummary] = []
    for s in all_sessions:
        duration = None
        if s.completed_at and s.started_at:
            duration = max(0, int((s.completed_at - s.started_at).total_seconds()))
        summaries.append(SessionSummary(
            id=s.session_id,
            attempt_number=s.attempt_no,
            started_at=s.started_at,
            finished_at=s.completed_at,
            score=float(s.score) if s.score is not None else None,
            max_score=float(s.max_score) if s.max_score is not None else None,
            percent=_session_percent(s),
            status="completed" if s.completed_at else "in_progress",
            duration_seconds=duration,
            is_best=(s.session_id == best_id),
        ))

    return TopicGradeResponse(
        topic_id=topic_id,
        topic_title=topic.name,
        discipline_title=discipline_title,
        grading_method=grading_method,
        final_grade_percent=final_percent,
        final_grade_score=final_score,
        max_score=max_score,
        is_passed=is_passed,
        passing_score_percent=passing,
        attempts_used=attempts_used,
        max_attempts=max_attempts,
        attempts_remaining=attempts_remaining,
        next_attempt_available_at=next_attempt_available_at,
        sessions=summaries,
        grade_scale=test.grade_scale if test else "5_point",
    )


@router.get("/disciplines/{discipline_id}/policy")
async def discipline_policy(
    discipline_id: int,
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
):
    if not await student_can_access_discipline(session, user.id, discipline_id):
        raise HTTPException(status_code=404, detail="discipline not found")

    completed_count = (await session.execute(
        select(func.count()).select_from(TestSession).where(
            TestSession.student_id == user.id,
            TestSession.discipline_id == discipline_id,
            TestSession.topic_id.is_(None),
            TestSession.completed_at.isnot(None),
        )
    )).scalar_one()
    test_mode = await discipline_test_mode(session, discipline_id)
    any_teacher = (await session.execute(
        select(TeacherDiscipline.teacher_id)
        .where(TeacherDiscipline.discipline_id == discipline_id)
        .order_by(TeacherDiscipline.assigned_at.asc()).limit(1)
    )).first()
    policy = None
    if any_teacher:
        policy = (await session.execute(
            select(AttemptsPolicy).where(
                AttemptsPolicy.teacher_id == any_teacher[0],
                AttemptsPolicy.discipline_id == discipline_id,
            )
        )).scalar_one_or_none()
    return {
        "discipline_id": discipline_id,
        "test_mode": test_mode,
        "general_test_available": test_mode == "discipline",
        "completed_attempts": completed_count,
        "attempts_allowed": policy.attempts_allowed if policy else 1,
        "available_from": policy.available_from.isoformat() if policy and policy.available_from else None,
        "available_until": policy.available_until.isoformat() if policy and policy.available_until else None,
        "now": _now_utc().isoformat(),
    }


def _censor_qmeta(meta: dict | None) -> dict | None:
    if not meta:
        return None
    import copy
    censored = copy.deepcopy(meta)
    censored.pop("correct_bool", None)
    censored.pop("explanation", None)
    censored.pop("acceptable_answers", None)
    censored.pop("short_pattern", None)
    if "cloze_blanks" in censored:
        for b in censored["cloze_blanks"]:
            b.pop("correct_index", None)
            b.pop("acceptable_answers", None)
    if "options_meta" in censored:
        for o in censored["options_meta"]:
            o.pop("is_correct", None)
            o.pop("correct_position", None)
    return censored


async def _discipline_name(session: AsyncSession, discipline_id: int) -> str:
    return (await session.execute(
        select(Discipline.name).where(Discipline.discipline_id == discipline_id)
    )).scalar_one_or_none() or f"Дисциплина #{discipline_id}"


async def _student_problem_meta(
    session: AsyncSession,
    user: CurrentUser,
    *,
    discipline_id: int,
    topic_id: int | None = None,
    reason: str | None = None,
    session_id: int | None = None,
) -> dict[str, Any]:
    topic_name = None
    if topic_id is not None:
        topic_name = (await session.execute(
            select(DisciplineTopic.name).where(DisciplineTopic.topic_id == topic_id)
        )).scalar_one_or_none()
    meta: dict[str, Any] = {
        "student_id": user.id,
        "student_name": user.full_name,
        "discipline_id": discipline_id,
        "discipline_name": await _discipline_name(session, discipline_id),
        "topic_id": topic_id,
        "topic_name": topic_name,
    }
    if reason:
        meta["reason"] = reason
    if session_id is not None:
        meta["session_id"] = session_id
    return meta


async def _notify_attempts_exhausted(
    session: AsyncSession,
    *,
    teacher_id: int | None,
    user: CurrentUser,
    discipline_id: int,
    topic_id: int | None = None,
    reason: str = "попытки исчерпаны",
) -> None:
    if not teacher_id:
        return
    meta = await _student_problem_meta(
        session,
        user,
        discipline_id=discipline_id,
        topic_id=topic_id,
        reason=reason,
    )
    dedupe_key = f"attempts_exhausted:{user.id}:{discipline_id}:{topic_id or 0}"
    scope = str(meta["discipline_name"])
    if meta.get("topic_name"):
        scope = f"{scope} — {meta['topic_name']}"
    await notify_teacher_once(
        session,
        teacher_id,
        "attempts_exhausted",
        title="У студента исчерпаны попытки",
        body=f"{user.full_name}: {scope}",
        link=f"/teacher/reference/students/{user.id}",
        meta=meta,
        severity=1,
        dedupe_key=dedupe_key,
    )


async def _notify_start_problem(
    session: AsyncSession,
    *,
    teacher_id: int | None,
    user: CurrentUser,
    discipline_id: int,
    topic_id: int | None = None,
    reason: str,
) -> None:
    if not teacher_id:
        return
    meta = await _student_problem_meta(
        session,
        user,
        discipline_id=discipline_id,
        topic_id=topic_id,
        reason=reason,
    )
    dedupe_key = f"start_problem:{user.id}:{discipline_id}:{topic_id or 0}:{reason}"
    await notify_teacher_once(
        session,
        teacher_id,
        "student_start_problem",
        title="Проблема старта теста",
        body=f"{user.full_name}: {reason}",
        link=f"/teacher/reference/students/{user.id}",
        meta=meta,
        severity=1,
        dedupe_key=dedupe_key,
    )


@router.post("/tests/{discipline_id}/start", response_model=TestStartOut, status_code=201)
async def start_test(
    discipline_id: int,
    request: Request,
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
) -> TestStartOut:
    if user.role != "student":
        raise HTTPException(status_code=403, detail="students only")
    if not await student_can_access_discipline(session, user.id, discipline_id):
        raise HTTPException(status_code=404, detail="discipline not found")

    if await discipline_test_mode(session, discipline_id) == "topic":
        raise HTTPException(
            status_code=409,
            detail="Для этой дисциплины используются тесты по темам. Выберите тему и начните тест по теме.",
        )

    existing = (await session.execute(
        select(TestSession).where(
            TestSession.student_id == user.id,
            TestSession.discipline_id == discipline_id,
            TestSession.topic_id.is_(None),
            TestSession.completed_at.is_(None),
        )
    )).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="active session exists")

    td = (await session.execute(
        select(TeacherDiscipline).where(TeacherDiscipline.discipline_id == discipline_id)
        .order_by(TeacherDiscipline.assigned_at.asc())
    )).scalars().first()
    time_limit_minutes = td.time_limit_minutes if td else 30
    question_count = td.question_count if td else 10
    teacher_id = td.teacher_id if td else None

    policy = None
    if teacher_id is not None:
        policy = (await session.execute(
            select(AttemptsPolicy).where(
                AttemptsPolicy.teacher_id == teacher_id,
                AttemptsPolicy.discipline_id == discipline_id,
            )
        )).scalar_one_or_none()
    now = _now_utc()
    if policy:
        if policy.available_from and now < policy.available_from.replace(tzinfo=timezone.utc):
            await _notify_start_problem(
                session,
                teacher_id=teacher_id,
                user=user,
                discipline_id=discipline_id,
                reason="not yet available",
            )
            await session.commit()
            raise HTTPException(status_code=403, detail="not yet available")
        if policy.available_until and now > policy.available_until.replace(tzinfo=timezone.utc):
            await _notify_start_problem(
                session,
                teacher_id=teacher_id,
                user=user,
                discipline_id=discipline_id,
                reason="window closed",
            )
            await session.commit()
            raise HTTPException(status_code=403, detail="window closed")
        if policy.attempts_allowed >= 0:
            completed_n = (await session.execute(
                select(func.count()).select_from(TestSession).where(
                    TestSession.student_id == user.id,
                    TestSession.discipline_id == discipline_id,
                    TestSession.topic_id.is_(None),
                    TestSession.completed_at.isnot(None),
                )
            )).scalar_one() or 0
            if completed_n >= policy.attempts_allowed:
                await _notify_attempts_exhausted(
                    session,
                    teacher_id=teacher_id,
                    user=user,
                    discipline_id=discipline_id,
                    reason="attempts limit reached",
                )
                await session.commit()
                raise HTTPException(status_code=409, detail="attempts limit reached")

    q_rows = (await session.execute(
        select(
            Question.question_id, Question.text, Question.qtype,
            Question.short_pattern, Question.numeric_tolerance, Question.match_pairs,
            Question.correct_bool, Question.explanation,
            Question.case_sensitive, Question.trim_whitespace,
            Question.normalize_universal, Question.text_mode, Question.allow_partial,
        )
        .where(
            Question.discipline_id == discipline_id,
            Question.archived_at.is_(None),
        )
        .order_by(Question.question_id)
        .limit(question_count * 4)
    )).all()
    pool = [(r.question_id, r.text, r.qtype) for r in q_rows]
    import random as _r
    rng = _r.Random(discipline_id * 1000 + user.id)
    rng.shuffle(pool)
    picked = pool[:question_count]
    q_ids = [qid for qid, _t, _qt in picked]
    q_text_map = {qid: (t, qt) for qid, t, qt in picked}
    if not q_ids:
        await _notify_start_problem(
            session,
            teacher_id=teacher_id,
            user=user,
            discipline_id=discipline_id,
            reason="no questions in this discipline",
        )
        await session.commit()
        raise HTTPException(status_code=400, detail="no questions in this discipline")

    o_rows = (await session.execute(
        select(AnswerOption).where(AnswerOption.question_id.in_(q_ids))
    )).scalars().all()
    grouped: dict[int, list[AnswerOption]] = {}
    for o in o_rows:
        grouped.setdefault(o.question_id, []).append(o)

    questions: list[QuestionDTO] = []
    for qid in q_ids:
        opts = grouped.get(qid, [])
        questions.append(QuestionDTO(
            question_id=qid,
            text=q_text_map[qid][0],
            options=[OptionDTO(option_id=o.option_id, option_number=o.option_number, text=o.text, is_correct=o.is_correct) for o in opts],
        ))
    seed = (sess.session_id if False else user.id * 1000) + discipline_id
    if policy and not policy.shuffle_seed:
        questions = shuffle_questions(questions, seed=discipline_id)
    else:
        questions = shuffle_questions(questions, seed=seed)
    questions = [shuffle_options(q, seed=user.id) for q in questions]

    if teacher_id is None:
        await _notify_start_problem(
            session,
            teacher_id=teacher_id,
            user=user,
            discipline_id=discipline_id,
            reason="no teacher for this discipline",
        )
        await session.commit()
        raise HTTPException(status_code=400, detail="no teacher for this discipline")
    policy_version = await ensure_discipline_policy_version(
        session,
        teacher_id=teacher_id,
        discipline_id=discipline_id,
        created_by_teacher_id=teacher_id,
    )

    attempt_no_n = (await session.execute(
        select(func.count()).select_from(TestSession).where(
            TestSession.student_id == user.id,
            TestSession.discipline_id == discipline_id,
            TestSession.topic_id.is_(None),
        )
    )).scalar_one() or 0

    db_session = TestSession(
        student_id=user.id,
        discipline_id=discipline_id,
        teacher_id=teacher_id,
        score=0,
        max_score=len(q_ids),
        attempt_no=attempt_no_n + 1,
        policy_version_id=policy_version.policy_version_id,
    )
    session.add(db_session)
    await session.flush()
    ordered_question_ids = [q.question_id for q in questions]
    await attach_question_versions_to_session(
        session,
        test_session=db_session,
        question_ids_in_order=ordered_question_ids,
        created_by_teacher_id=teacher_id,
    )
    await session.commit()
    await session.refresh(db_session)

    await record_audit(
        session,
        actor_role="student",
        actor_id=user.id,
        action="student_attempt_started",
        target_type="session",
        target_id=db_session.session_id,
        ip_addr=client_ip(request),
        after={
            "session_id": db_session.session_id,
            "student_id": user.id,
            "discipline_id": discipline_id,
            "teacher_id": teacher_id,
            "topic_id": None,
            "attempt_no": db_session.attempt_no,
            "max_score": db_session.max_score,
        },
        metadata={"mode": "discipline"},
        mirror_teacher_id=teacher_id,
    )
    await store_and_publish(
        session, "teacher", teacher_id, "student_attempt_started",
        {"session_id": db_session.session_id, "discipline_id": discipline_id,
         "student": f"{user.full_name}"},
    )
    await session.commit()

    started_at = db_session.started_at if db_session.started_at else _now_utc()
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    expires_at = started_at + timedelta(minutes=time_limit_minutes)
    extra_meta: dict[int, dict] = {}
    image_urls: dict[int, str] = {}
    image_rows = (await session.execute(
        select(QuestionImage.image_id, QuestionImage.question_id)
        .where(QuestionImage.question_id.in_(q_ids))
    )).all()
    for image_id, qid in image_rows:
        image_urls[qid] = question_image_url(image_id)
    for qid in q_ids:
        qt = q_text_map[qid][1]
        if qt in ("short", "numeric", "match", "text", "order", "bool", "cloze", "file_upload"):
            qrow = (await session.execute(
                select(Question).where(Question.question_id == qid)
            )).scalar_one()
            extra_meta[qid] = {
                "qtype": qt,
                "short_pattern": qrow.short_pattern,
                "numeric_tolerance": float(qrow.numeric_tolerance) if qrow.numeric_tolerance is not None else None,
                "match_pairs": qrow.match_pairs or [],
                "correct_bool": qrow.correct_bool,
                "explanation": qrow.explanation,
                "case_sensitive": qrow.case_sensitive,
                "trim_whitespace": qrow.trim_whitespace,
                "normalize_universal": qrow.normalize_universal,
                "text_mode": qrow.text_mode or "string",
                "allow_partial": qrow.allow_partial,
                "acceptable_answers": [],
                "cloze_blanks": [],
                "options_meta": [],
                "file_allowed_types": json.loads(qrow.file_allowed_types) if qrow.file_allowed_types else None,
                "file_max_size_bytes": qrow.file_max_size_bytes,
                "file_max_count": qrow.file_max_count,
            }
            if qt == "text":
                aa = (await session.execute(
                    text("SELECT answer FROM question_acceptable_answers WHERE question_id = :qid ORDER BY ord").bindparams(qid=qid)
                )).all()
                extra_meta[qid]["acceptable_answers"] = [r[0] for r in aa]
            elif qt == "order":
                opts_meta = []
                for o in grouped.get(qid, []):
                    opts_meta.append({
                        "option_id": o.option_id,
                        "text": o.text,
                        "is_correct": o.is_correct,
                        "match_left": o.match_left,
                        "match_right": o.match_right,
                        "correct_position": o.correct_position,
                    })
                extra_meta[qid]["options_meta"] = opts_meta
            elif qt == "cloze":
                cloze_rows = (await session.execute(
                    text(
                        "SELECT blank_index, kind, options, correct_index, acceptable_answers, case_sensitive, trim_whitespace, normalize_universal "
                        "FROM question_cloze_blanks WHERE question_id = :qid ORDER BY blank_index"
                    ).bindparams(qid=qid)
                )).all()
                blanks = []
                for row in cloze_rows:
                    blanks.append({
                        "index": row[0],
                        "kind": row[1],
                        "options": row[2],
                        "correct_index": row[3],
                        "acceptable_answers": row[4],
                        "case_sensitive": row[5],
                        "trim_whitespace": row[6],
                        "normalize_universal": row[7],
                    })
                extra_meta[qid]["cloze_blanks"] = blanks
    snapshots = await session_question_snapshots(session, db_session.session_id)
    if snapshots:
        q_ids = session_snapshots_to_question_ids(snapshots)
        questions = [snapshot_to_question_dto(item.snapshot) for item in snapshots]
        extra_meta = {item.question_id: snapshot_question_meta(item.snapshot) for item in snapshots}
        image_urls = {
            item.question_id: question_image_url(item.snapshot["image_id"])
            for item in snapshots
            if item.snapshot.get("image_id")
        }
    return TestStartOut(
        session_id=db_session.session_id,
        started_at=started_at,
        time_limit_minutes=time_limit_minutes,
        expires_at=expires_at,
        questions=[
            QuestionOut(
                question_id=q.question_id,
                question_text=q.text,
                options=[OptionOut(option_id=o.option_id, option_number=o.option_number, option_text=o.text) for o in q.options],
                qtype=extra_meta[q.question_id]["qtype"],
                qmeta=_censor_qmeta(extra_meta.get(q.question_id)),
                image_url=image_urls.get(q.question_id),
            ) for q in questions
        ],
        saved_answers={},
        saved_extras={},
    )


@router.post("/topics/{topic_id}/tests/start", response_model=TestStartOut, status_code=201)
async def start_topic_test(
    topic_id: int,
    request: Request,
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
) -> TestStartOut:
    topic = (await session.execute(
        select(DisciplineTopic).where(
            DisciplineTopic.topic_id == topic_id,
            DisciplineTopic.archived_at.is_(None),
        )
    )).scalar_one_or_none()
    if topic is None or not await student_can_access_discipline(session, user.id, topic.discipline_id):
        raise HTTPException(status_code=404, detail="topic not found")

    availability = await calculate_topic_availability(session, user.id, topic)
    if availability.active_session_id is not None:
        raise HTTPException(status_code=409, detail="active session exists")

    test = availability.test
    if test is None or not availability.available:
        detail = availability.unavailable_reason or "topic test is not available"
        status_code = 409 if detail == "попытки исчерпаны" else 403
        if availability.next_attempt_available_at is not None:
            status_code = 429
        teacher_id = test.teacher_id if test is not None else None
        if detail == "попытки исчерпаны":
            await _notify_attempts_exhausted(
                session,
                teacher_id=teacher_id,
                user=user,
                discipline_id=topic.discipline_id,
                topic_id=topic_id,
                reason=detail,
            )
        else:
            await _notify_start_problem(
                session,
                teacher_id=teacher_id,
                user=user,
                discipline_id=topic.discipline_id,
                topic_id=topic_id,
                reason=detail,
            )
        await session.commit()
        raise HTTPException(status_code=status_code, detail=detail)

    q_rows = (await session.execute(
        select(Question.question_id, Question.text, Question.qtype)
        .where(
            Question.topic_id == topic_id,
            Question.archived_at.is_(None),
        )
        .order_by(Question.question_id)
        .limit(test.question_count * 4)
    )).all()
    pool = [(qid, t, qt) for qid, t, qt in q_rows]
    import random as _r
    rng = _r.Random(topic_id * 1000 + user.id)
    rng.shuffle(pool)
    picked = pool[:test.question_count]
    q_ids = [qid for qid, _t, _qt in picked]
    q_text_map = {qid: (t, qt) for qid, t, qt in picked}
    if not q_ids:
        await _notify_start_problem(
            session,
            teacher_id=test.teacher_id,
            user=user,
            discipline_id=topic.discipline_id,
            topic_id=topic_id,
            reason="no questions in this topic",
        )
        await session.commit()
        raise HTTPException(status_code=400, detail="no questions in this topic")

    o_rows = (await session.execute(
        select(AnswerOption).where(AnswerOption.question_id.in_(q_ids))
    )).scalars().all()
    grouped: dict[int, list[AnswerOption]] = {}
    for o in o_rows:
        grouped.setdefault(o.question_id, []).append(o)

    questions: list[QuestionDTO] = []
    for qid in q_ids:
        opts = grouped.get(qid, [])
        questions.append(QuestionDTO(
            question_id=qid,
            text=q_text_map[qid][0],
            options=[OptionDTO(option_id=o.option_id, option_number=o.option_number, text=o.text, is_correct=o.is_correct) for o in opts],
        ))
    seed = user.id * 1000 + topic_id
    if not test.shuffle_seed:
        questions = shuffle_questions(questions, seed=topic_id)
    else:
        questions = shuffle_questions(questions, seed=seed)
    questions = [shuffle_options(q, seed=user.id) for q in questions]
    policy_version = await ensure_topic_policy_version(
        session,
        test,
        created_by_teacher_id=test.teacher_id,
    )

    db_session = TestSession(
        student_id=user.id,
        discipline_id=topic.discipline_id,
        topic_id=topic_id,
        teacher_id=test.teacher_id,
        score=0,
        max_score=len(q_ids),
        attempt_no=availability.completed_sessions_count + 1,
        policy_version_id=policy_version.policy_version_id,
    )
    session.add(db_session)
    await session.flush()
    ordered_question_ids = [q.question_id for q in questions]
    await attach_question_versions_to_session(
        session,
        test_session=db_session,
        question_ids_in_order=ordered_question_ids,
        created_by_teacher_id=test.teacher_id,
    )
    await session.commit()
    await session.refresh(db_session)

    await record_audit(
        session,
        actor_role="student",
        actor_id=user.id,
        action="student_topic_attempt_started",
        target_type="session",
        target_id=db_session.session_id,
        ip_addr=client_ip(request),
        after={
            "session_id": db_session.session_id,
            "student_id": user.id,
            "discipline_id": topic.discipline_id,
            "topic_id": topic_id,
            "teacher_id": test.teacher_id,
            "attempt_no": db_session.attempt_no,
            "max_score": db_session.max_score,
        },
        metadata={"mode": "topic"},
        mirror_teacher_id=test.teacher_id,
    )
    await store_and_publish(
        session, "teacher", test.teacher_id, "student_topic_attempt_started",
        {"session_id": db_session.session_id, "discipline_id": topic.discipline_id,
         "topic_id": topic_id, "student": f"{user.full_name}"},
    )
    await session.commit()

    started_at = db_session.started_at if db_session.started_at else _now_utc()
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    expires_at = started_at + timedelta(minutes=test.time_limit_minutes)
    extra_meta: dict[int, dict] = {}
    image_urls: dict[int, str] = {}
    image_rows = (await session.execute(
        select(QuestionImage.image_id, QuestionImage.question_id)
        .where(QuestionImage.question_id.in_(q_ids))
    )).all()
    for image_id, qid in image_rows:
        image_urls[qid] = question_image_url(image_id)
    for qid in q_ids:
        qt = q_text_map[qid][1]
        if qt in ("short", "numeric", "match", "text", "order", "bool", "cloze", "file_upload"):
            qrow = (await session.execute(
                select(Question).where(Question.question_id == qid)
            )).scalar_one()
            extra_meta[qid] = {
                "qtype": qt,
                "short_pattern": qrow.short_pattern,
                "numeric_tolerance": float(qrow.numeric_tolerance) if qrow.numeric_tolerance is not None else None,
                "match_pairs": qrow.match_pairs or [],
                "correct_bool": qrow.correct_bool,
                "explanation": qrow.explanation,
                "case_sensitive": qrow.case_sensitive,
                "trim_whitespace": qrow.trim_whitespace,
                "normalize_universal": qrow.normalize_universal,
                "text_mode": qrow.text_mode or "string",
                "allow_partial": qrow.allow_partial,
                "acceptable_answers": [],
                "cloze_blanks": [],
                "options_meta": [],
                "file_allowed_types": json.loads(qrow.file_allowed_types) if qrow.file_allowed_types else None,
                "file_max_size_bytes": qrow.file_max_size_bytes,
                "file_max_count": qrow.file_max_count,
            }
            if qt == "text":
                aa = (await session.execute(
                    text("SELECT answer FROM question_acceptable_answers WHERE question_id = :qid ORDER BY ord").bindparams(qid=qid)
                )).all()
                extra_meta[qid]["acceptable_answers"] = [r[0] for r in aa]
            elif qt == "order":
                opts_meta = []
                for o in grouped.get(qid, []):
                    opts_meta.append({
                        "option_id": o.option_id,
                        "text": o.text,
                        "is_correct": o.is_correct,
                        "match_left": o.match_left,
                        "match_right": o.match_right,
                        "correct_position": o.correct_position,
                    })
                extra_meta[qid]["options_meta"] = opts_meta
            elif qt == "cloze":
                cloze_rows = (await session.execute(
                    text(
                        "SELECT blank_index, kind, options, correct_index, acceptable_answers, case_sensitive, trim_whitespace, normalize_universal "
                        "FROM question_cloze_blanks WHERE question_id = :qid ORDER BY blank_index"
                    ).bindparams(qid=qid)
                )).all()
                blanks = []
                for row in cloze_rows:
                    blanks.append({
                        "index": row[0],
                        "kind": row[1],
                        "options": row[2],
                        "correct_index": row[3],
                        "acceptable_answers": row[4],
                        "case_sensitive": row[5],
                        "trim_whitespace": row[6],
                        "normalize_universal": row[7],
                    })
                extra_meta[qid]["cloze_blanks"] = blanks
    snapshots = await session_question_snapshots(session, db_session.session_id)
    if snapshots:
        q_ids = session_snapshots_to_question_ids(snapshots)
        questions = [snapshot_to_question_dto(item.snapshot) for item in snapshots]
        extra_meta = {item.question_id: snapshot_question_meta(item.snapshot) for item in snapshots}
        image_urls = {
            item.question_id: question_image_url(item.snapshot["image_id"])
            for item in snapshots
            if item.snapshot.get("image_id")
        }
    points_map = await _question_points(session, q_ids)
    topic_metadata = await _topic_metadata(session, db_session, test)
    return TestStartOut(
        session_id=db_session.session_id,
        started_at=started_at,
        time_limit_minutes=test.time_limit_minutes,
        expires_at=expires_at,
        questions=[
            QuestionOut(
                question_id=q.question_id,
                question_text=q.text,
                options=[OptionOut(option_id=o.option_id, option_number=o.option_number, option_text=o.text) for o in q.options],
                qtype=q_text_map[q.question_id][1],
                qmeta=_censor_qmeta(extra_meta.get(q.question_id)),
                image_url=image_urls.get(q.question_id),
                points=points_map.get(q.question_id, 1.0),
            ) for q in questions
        ],
        topic_metadata=topic_metadata,
    )


@router.post("/sessions/{session_id}/answers")
async def submit_answers(
    session_id: int,
    payload: AnswerSubmitBatch,
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
):
    sess = (await session.execute(
        select(TestSession).where(TestSession.session_id == session_id)
    )).scalar_one_or_none()
    if sess is None or sess.student_id != user.id:
        raise HTTPException(status_code=403, detail="session not yours")
    if sess.completed_at is not None:
        raise HTTPException(status_code=409, detail="session already completed")

    snapshots = await session_question_snapshots(session, sess.session_id)
    if snapshots:
        allowed_ids = set(session_snapshots_to_question_ids(snapshots))
    else:
        allowed_stmt = select(Question.question_id)
        if sess.topic_id is not None:
            allowed_stmt = allowed_stmt.where(Question.topic_id == sess.topic_id)
        else:
            allowed_stmt = allowed_stmt.where(Question.discipline_id == sess.discipline_id)
        allowed_ids = set((await session.execute(allowed_stmt)).scalars().all())
    incoming_ids = {ans.question_id for ans in payload.answers}
    if unknown_ids := (incoming_ids - allowed_ids):
        raise HTTPException(
            status_code=400,
            detail=f"question does not belong to this session: {min(unknown_ids)}",
        )

    existing_rows = (await session.execute(
        select(StudentAnswer).where(StudentAnswer.session_id == session_id)
    )).scalars().all()
    existing_by_question = {row.question_id: row for row in existing_rows}
    ids_to_remove = set(existing_by_question) - incoming_ids
    if ids_to_remove:
        await session.execute(
            delete(StudentAnswer).where(
                StudentAnswer.session_id == session_id,
                StudentAnswer.question_id.in_(ids_to_remove),
            )
        )

    for ans in payload.answers:
        opt_id = ans.chosen_option_id
        if opt_id is not None:
            if snapshots:
                snapshot = next((item.snapshot for item in snapshots if item.question_id == ans.question_id), None)
                option_ok = any(
                    int(option.get("option_id")) == opt_id
                    for option in snapshot_options(snapshot or {})
                )
            else:
                option_ok = (await session.execute(
                    select(AnswerOption.option_id).where(
                        AnswerOption.option_id == opt_id,
                        AnswerOption.question_id == ans.question_id,
                    )
                )).scalar_one_or_none() is not None
            if not option_ok:
                raise HTTPException(status_code=400, detail="option does not belong to question")
        elif (
            ans.short_answer is not None
            or ans.numeric_answer is not None
            or ans.match_answer is not None
            or ans.text_answer is not None
            or ans.order_answer is not None
            or ans.bool_answer is not None
            or ans.cloze_answer is not None
        ):
            if snapshots:
                snapshot = next((item.snapshot for item in snapshots if item.question_id == ans.question_id), None)
                first_option = snapshot_options(snapshot or {})
                opt_id = int(first_option[0]["option_id"]) if first_option else None
            else:
                opt_id = (await session.execute(
                    select(AnswerOption.option_id)
                    .where(AnswerOption.question_id == ans.question_id)
                    .order_by(AnswerOption.option_number)
                    .limit(1)
                )).scalar_one_or_none()

        existing = existing_by_question.get(ans.question_id)
        if existing is not None:
            existing.selected_option_id = opt_id
        else:
            existing = StudentAnswer(
                session_id=session_id,
                question_id=ans.question_id,
                selected_option_id=opt_id,
            )
            session.add(existing)
            await session.flush()

        value = None
        if ans.short_answer is not None:
            value = ans.short_answer
        elif ans.text_answer is not None:
            value = ans.text_answer
        elif ans.numeric_answer is not None:
            value = str(ans.numeric_answer)
        elif isinstance(ans.bool_answer, bool):
            value = "true" if ans.bool_answer else "false"
        elif ans.order_answer is not None:
            value = ",".join(str(x) for x in ans.order_answer)
        elif ans.cloze_answer is not None:
            value = json.dumps(ans.cloze_answer, ensure_ascii=False)

        match_payload = ans.match_answer
        if value is None and match_payload is None:
            await session.execute(delete(AnswerExtra).where(AnswerExtra.answer_id == existing.answer_id))
            continue

        extra = (await session.execute(
            select(AnswerExtra).where(AnswerExtra.answer_id == existing.answer_id)
        )).scalar_one_or_none()
        if extra is None:
            session.add(AnswerExtra(
                answer_id=existing.answer_id,
                short_answer_raw=value,
                short_answer_ok=None,
                match_pairs=match_payload,
            ))
        else:
            extra.short_answer_raw = value
            extra.match_pairs = match_payload
    await session.commit()
    return {"ok": True, "saved": len(payload.answers)}


@router.post("/sessions/{session_id}/questions/{question_id}/files")
async def upload_answer_file(
    session_id: int,
    question_id: int,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
):
    sess = (await session.execute(
        select(TestSession).where(TestSession.session_id == session_id)
    )).scalar_one_or_none()
    if not sess or sess.student_id != user.id:
        raise HTTPException(status_code=403, detail="Session not yours")
    if sess.completed_at is not None:
        raise HTTPException(status_code=403, detail="Session already completed")

    # Check if question belongs to session
    from app.db.models import TestSessionQuestion
    in_session = (await session.execute(
        select(TestSessionQuestion)
        .where(
            TestSessionQuestion.session_id == session_id,
            TestSessionQuestion.question_id == question_id
        )
    )).scalar_one_or_none()
    if not in_session:
        raise HTTPException(status_code=404, detail="Question not found in session")

    question = (await session.execute(
        select(Question).where(Question.question_id == question_id)
    )).scalar_one_or_none()
    if not question or question.qtype != "file_upload":
        raise HTTPException(status_code=400, detail="Not a file upload question")

    # Get StudentAnswer for this session and question
    ans = (await session.execute(
        select(StudentAnswer)
        .where(StudentAnswer.session_id == session_id, StudentAnswer.question_id == question_id)
    )).scalar_one_or_none()

    if ans:
        uploaded_count = (await session.execute(
            select(func.count()).select_from(AnswerFileUpload).where(AnswerFileUpload.answer_id == ans.answer_id)
        )).scalar_one() or 0
        max_count = question.file_max_count or 1
        if uploaded_count >= max_count:
            raise HTTPException(status_code=409, detail="Maximum file upload count reached")

    content = await file.read()
    allowed_types = None
    if question.file_allowed_types:
        try:
            allowed_types = json.loads(question.file_allowed_types)
        except Exception:
            allowed_types = None

    try:
        stored = save_student_file(
            session_id=session_id,
            question_id=question_id,
            data=content,
            original_name=file.filename or "upload.bin",
            declared_content_type=file.content_type or "application/octet-stream",
            allowed_types=allowed_types,
            max_size=question.file_max_size_bytes or 10485760
        )
    except FileValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not ans:
        ans = StudentAnswer(
            session_id=session_id,
            question_id=question_id,
            selected_option_id=None
        )
        session.add(ans)
        await session.flush()

    upload_db = AnswerFileUpload(
        answer_id=ans.answer_id,
        storage_key=stored.storage_key,
        original_name=stored.original_name,
        content_type=stored.content_type,
        size_bytes=stored.size_bytes,
        sha256_hex=stored.sha256_hex
    )
    session.add(upload_db)
    await session.commit()
    await session.refresh(upload_db)
    return {
        "upload_id": upload_db.upload_id,
        "original_name": upload_db.original_name,
        "content_type": upload_db.content_type,
        "size_bytes": upload_db.size_bytes,
        "uploaded_at": upload_db.uploaded_at
    }


@router.delete("/sessions/{session_id}/questions/{question_id}/files/{upload_id}", status_code=204)
async def delete_answer_file(
    session_id: int,
    question_id: int,
    upload_id: int,
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
):
    sess = (await session.execute(
        select(TestSession).where(TestSession.session_id == session_id)
    )).scalar_one_or_none()
    if not sess or sess.student_id != user.id:
        raise HTTPException(status_code=403, detail="Session not yours")
    if sess.completed_at is not None:
        raise HTTPException(status_code=403, detail="Session already completed")

    ans = (await session.execute(
        select(StudentAnswer)
        .where(StudentAnswer.session_id == session_id, StudentAnswer.question_id == question_id)
    )).scalar_one_or_none()
    if not ans:
        raise HTTPException(status_code=404, detail="Answer not found")

    upload = (await session.execute(
        select(AnswerFileUpload)
        .where(AnswerFileUpload.upload_id == upload_id, AnswerFileUpload.answer_id == ans.answer_id)
    )).scalar_one_or_none()
    if not upload:
        raise HTTPException(status_code=404, detail="File upload not found")

    delete_student_file(upload.storage_key)
    await session.delete(upload)

    # Check if there are other uploads
    remaining = (await session.execute(
        select(func.count()).select_from(AnswerFileUpload).where(AnswerFileUpload.answer_id == ans.answer_id)
    )).scalar_one() or 0
    if remaining == 0:
        await session.delete(ans)

    await session.commit()
    return None


@router.get("/sessions/{session_id}/file-upload-status", response_model=SessionFileUploadStatusOut)
async def get_file_upload_status(
    session_id: int,
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
) -> SessionFileUploadStatusOut:
    sess = (await session.execute(
        select(TestSession).where(TestSession.session_id == session_id)
    )).scalar_one_or_none()
    if not sess or sess.student_id != user.id:
        raise HTTPException(status_code=403, detail="Session not yours")

    # Load session questions snapshots
    snapshots = await session_question_snapshots(session, session_id)
    file_questions = []

    # Get answers for this session
    answers = (await session.execute(
        select(StudentAnswer).where(StudentAnswer.session_id == session_id)
    )).scalars().all()
    answer_by_q = {ans.question_id: ans for ans in answers}

    all_graded = True

    if snapshots:
        for sq in snapshots:
            if sq.snapshot.get("qtype") == "file_upload":
                ans = answer_by_q.get(sq.question_id)
                uploads_out = []
                grade_out = None

                if ans:
                    uploads = (await session.execute(
                        select(AnswerFileUpload).where(AnswerFileUpload.answer_id == ans.answer_id)
                    )).scalars().all()
                    uploads_out = [
                        AnswerFileUploadStudentOut(
                            upload_id=up.upload_id,
                            original_name=up.original_name,
                            size_bytes=up.size_bytes,
                            uploaded_at=up.uploaded_at
                        ) for up in uploads
                    ]

                    # Check grade
                    grade = (await session.execute(
                        select(FileUploadGrade).where(FileUploadGrade.answer_id == ans.answer_id)
                    )).scalar_one_or_none()
                    if grade:
                        grade_out = FileUploadGradeStudentOut(
                            points_earned=float(grade.points_earned),
                            max_points=float(sq.snapshot.get("points") or 1.0),
                            comment=grade.comment,
                            graded_at=grade.graded_at
                        )
                    else:
                        all_graded = False
                else:
                    all_graded = False

                file_questions.append(
                    FileQuestionStatusOut(
                        question_id=sq.question_id,
                        question_text=sq.snapshot.get("text") or "",
                        max_points=float(sq.snapshot.get("points") or 1.0),
                        uploads=uploads_out,
                        grade=grade_out
                    )
                )
    else:
        # Fallback if no snapshots
        if sess.topic_id is not None:
            q_stmt = select(Question).where(
                Question.topic_id == sess.topic_id,
                Question.qtype == "file_upload",
                Question.archived_at.is_(None)
            )
        else:
            q_stmt = select(Question).where(
                Question.discipline_id == sess.discipline_id,
                Question.qtype == "file_upload",
                Question.archived_at.is_(None)
            )
        questions = (await session.execute(q_stmt)).scalars().all()
        for q in questions:
            ans = answer_by_q.get(q.question_id)
            uploads_out = []
            grade_out = None
            if ans:
                uploads = (await session.execute(
                    select(AnswerFileUpload).where(AnswerFileUpload.answer_id == ans.answer_id)
                )).scalars().all()
                uploads_out = [
                    AnswerFileUploadStudentOut(
                        upload_id=up.upload_id,
                        original_name=up.original_name,
                        size_bytes=up.size_bytes,
                        uploaded_at=up.uploaded_at
                    ) for up in uploads
                ]
                grade = (await session.execute(
                    select(FileUploadGrade).where(FileUploadGrade.answer_id == ans.answer_id)
                )).scalar_one_or_none()
                if grade:
                    grade_out = FileUploadGradeStudentOut(
                        points_earned=float(grade.points_earned),
                        max_points=float(q.points),
                        comment=grade.comment,
                        graded_at=grade.graded_at
                    )
                else:
                    all_graded = False
            else:
                all_graded = False

            file_questions.append(
                FileQuestionStatusOut(
                    question_id=q.question_id,
                    question_text=q.text,
                    max_points=float(q.points),
                    uploads=uploads_out,
                    grade=grade_out
                )
            )

    if not file_questions:
        all_graded = True

    return SessionFileUploadStatusOut(
        session_id=session_id,
        file_questions=file_questions,
        all_graded=all_graded
    )


@router.post("/sessions/{session_id}/finish", response_model=FinishOut)
async def finish_session(
    session_id: int,
    request: Request,
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
) -> FinishOut:
    sess = (await session.execute(
        select(TestSession).where(TestSession.session_id == session_id)
    )).scalar_one_or_none()
    if sess is None or sess.student_id != user.id:
        raise HTTPException(status_code=403, detail="session not yours")
    if sess.completed_at is not None:
        raise HTTPException(status_code=409, detail="already finished")

    before_finish = {
        "session_id": session_id,
        "completed_at": sess.completed_at,
        "score": sess.score,
        "max_score": sess.max_score,
    }
    snapshots = await session_question_snapshots(session, sess.session_id)
    has_file_upload = False
    if snapshots:
        has_file_upload = any(
            item.snapshot.get("qtype") == "file_upload" for item in snapshots
        )
    else:
        if sess.topic_id is not None:
            has_file_upload_stmt = select(func.count()).select_from(Question).where(
                Question.topic_id == sess.topic_id,
                Question.qtype == "file_upload",
                Question.archived_at.is_(None)
            )
        else:
            has_file_upload_stmt = select(func.count()).select_from(Question).where(
                Question.discipline_id == sess.discipline_id,
                Question.qtype == "file_upload",
                Question.archived_at.is_(None)
            )
        count_file_q = (await session.execute(has_file_upload_stmt)).scalar_one() or 0
        has_file_upload = count_file_q > 0

    breakdown = await grade_session(session, sess)
    override = (await session.execute(
        text("SELECT score FROM test_sessions_grade_override WHERE session_id = :sid")
        .bindparams(sid=session_id)
    )).first()
    final_score = override[0] if override else breakdown.score
    sess.score = final_score
    sess.max_score = breakdown.max_score
    sess.completed_at = _now_utc()
    if has_file_upload:
        sess.status = "pending_file_grading"
    else:
        sess.status = "completed"

    await record_audit(
        session,
        actor_role="student",
        actor_id=user.id,
        action="student_attempt_finished",
        target_type="session",
        target_id=session_id,
        ip_addr=client_ip(request),
        before=before_finish,
        after={
            "session_id": session_id,
            "student_id": user.id,
            "discipline_id": sess.discipline_id,
            "topic_id": sess.topic_id,
            "teacher_id": sess.teacher_id,
            "attempt_no": sess.attempt_no,
            "completed_at": sess.completed_at,
            "score": final_score,
            "max_score": breakdown.max_score,
            "status": sess.status,
        },
        metadata={"mode": "topic" if sess.topic_id is not None else "discipline"},
        mirror_teacher_id=sess.teacher_id,
    )
    await store_and_publish(
        session, "teacher", sess.teacher_id, "student_attempt_finished",
        {"session_id": session_id, "discipline_id": sess.discipline_id,
         "student": user.full_name, "score": final_score, "max": breakdown.max_score},
    )
    discipline_name = (await session.execute(
        select(Discipline.name).where(Discipline.discipline_id == sess.discipline_id)
    )).scalar_one_or_none() or "Тест"
    topic_name = None
    if sess.topic_id is not None:
        topic_name = (await session.execute(
            select(DisciplineTopic.name).where(DisciplineTopic.topic_id == sess.topic_id)
        )).scalar_one_or_none()

    from app.services.grade_calculator import format_grade_py
    from app.db.models import TestPolicyVersion

    grade_scale = "5_point"
    if sess.policy_version_id is not None:
        policy_snapshot = (await session.execute(
            select(TestPolicyVersion.snapshot).where(TestPolicyVersion.policy_version_id == sess.policy_version_id)
        )).scalar_one_or_none()
        if isinstance(policy_snapshot, dict):
            grade_scale = policy_snapshot.get("grade_scale") or "5_point"

    grade_str = format_grade_py(final_score, breakdown.max_score, grade_scale)

    await store_and_publish(
        session,
        "student",
        user.id,
        "test_graded",
        {
            "title": "Тест завершен" if has_file_upload else "Тест оценён",
            "body": f"{discipline_name} — {topic_name or 'общий тест'} отправлен преподавателю на проверку" if has_file_upload else f"{discipline_name} — {topic_name or 'общий тест'}: оценка {grade_str}",
            "summary": "ожидает проверки" if has_file_upload else f"оценка {grade_str}",
            "link": f"/student/results/{session_id}",
            "meta": {
                "session_id": session_id,
                "discipline_name": discipline_name,
                "topic_name": topic_name,
            },
        },
    )

    # TZ tz-teacher-production-ready.md § 8.2: уведомление преподавателю.
    if sess.teacher_id and sess.teacher_id > 0:
        if has_file_upload:
            await notify_teacher(
                session,
                sess.teacher_id,
                "file_upload_pending_review",
                title="Файловый ответ ожидает проверки",
                body=f"{user.full_name} — {discipline_name}{f' — {topic_name}' if topic_name else ''}: требует ручной проверки файлов",
                link=f"/teacher/sessions/{session_id}/file-review",
                meta={
                    "session_id": session_id,
                    "student_id": user.id,
                    "student_name": user.full_name,
                    "discipline_name": discipline_name,
                    "topic_name": topic_name,
                    "file_upload_count": sum(1 for item in snapshots if item.snapshot.get("qtype") == "file_upload") if snapshots else 1,
                },
                severity=1,
            )
        else:
            await notify_teacher(
                session,
                sess.teacher_id,
                "student_attempt_finished",
                title=f"Сессия #{session_id} завершена",
                body=f"{user.full_name} — {discipline_name}{f' — {topic_name}' if topic_name else ''}: {final_score} из {breakdown.max_score}",
                link=f"/teacher/students/{user.id}",
                meta={
                    "session_id": session_id,
                    "student_id": user.id,
                    "student_name": user.full_name,
                    "discipline_name": discipline_name,
                    "topic_name": topic_name,
                    "score": final_score,
                    "max_score": breakdown.max_score,
                },
            )
    await session.commit()
    await session.refresh(sess)
    return FinishOut(
        session_id=sess.session_id,
        score=sess.score,
        max_score=sess.max_score,
        started_at=sess.started_at,
        completed_at=sess.completed_at,
        status=sess.status,
    )


@router.get("/sessions", response_model=SessionHistoryOut)
async def my_sessions(
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
) -> SessionHistoryOut:
    rows = (await session.execute(
        select(TestSession, Discipline.name, DisciplineTopic.name)
        .join(Discipline, Discipline.discipline_id == TestSession.discipline_id)
        .outerjoin(DisciplineTopic, DisciplineTopic.topic_id == TestSession.topic_id)
        .where(TestSession.student_id == user.id)
        .order_by(TestSession.started_at.desc())
    )).all()
    items: list[SessionListItem] = []
    for s, dname, tname in rows:
        items.append(SessionListItem(
            session_id=s.session_id,
            discipline_id=s.discipline_id,
            discipline_name=dname,
            started_at=s.started_at,
            completed_at=s.completed_at,
            score=s.score,
            max_score=s.max_score,
            status="completed" if s.completed_at else "in_progress",
            topic_id=s.topic_id,
            topic_name=tname,
        ))
    return SessionHistoryOut(sessions=items)


@router.get("/sessions/{session_id}/resume", response_model=ResumeOut)
async def resume_session(
    session_id: int,
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
) -> ResumeOut:
    sess = (await session.execute(
        select(TestSession).where(TestSession.session_id == session_id)
    )).scalar_one_or_none()
    if sess is None or sess.student_id != user.id:
        raise HTTPException(status_code=403, detail="session not yours")
    if sess.completed_at is not None:
        raise HTTPException(status_code=409, detail="already completed")

    topic_test = None
    if sess.topic_id is not None:
        topic_test = (await session.execute(
            select(TeacherTopicTest).where(
                TeacherTopicTest.topic_id == sess.topic_id,
                TeacherTopicTest.teacher_id == sess.teacher_id,
            )
        )).scalar_one_or_none()
        time_limit_minutes = topic_test.time_limit_minutes if topic_test else 30
    else:
        td = (await session.execute(
            select(TeacherDiscipline).where(
                TeacherDiscipline.discipline_id == sess.discipline_id,
                TeacherDiscipline.teacher_id == sess.teacher_id,
            )
        )).scalar_one_or_none()
        time_limit_minutes = td.time_limit_minutes if td else 30

    snapshots = await session_question_snapshots(session, sess.session_id)
    if snapshots:
        q_ids = session_snapshots_to_question_ids(snapshots)
        questions = [snapshot_to_question_dto(item.snapshot) for item in snapshots]
        extra_meta = {item.question_id: snapshot_question_meta(item.snapshot) for item in snapshots}
        saved_rows = (await session.execute(
            select(StudentAnswer.question_id, StudentAnswer.selected_option_id, StudentAnswer.answer_id)
            .where(StudentAnswer.session_id == session_id)
        )).all()
        saved_answers: dict[int, int] = {}
        extra_by_answer = {}
        if saved_rows:
            extras = (await session.execute(
                select(AnswerExtra).where(
                    AnswerExtra.answer_id.in_([r[2] for r in saved_rows])
                )
            )).scalars().all()
            for e in extras:
                extra_by_answer[e.answer_id] = e
        for qid, oid, aid in saved_rows:
            if oid is not None:
                saved_answers[qid] = oid
        saved_extras: dict[int, dict] = {}
        for qid, oid, aid in saved_rows:
            e = extra_by_answer.get(aid)
            if e:
                saved_extras[qid] = {
                    "short": e.short_answer_raw,
                    "match": e.match_pairs,
                    "numeric": e.short_answer_raw,
                }
        image_urls = {
            item.question_id: question_image_url(item.snapshot["image_id"])
            for item in snapshots
            if item.snapshot.get("image_id")
        }
        policy_snapshot = None
        if sess.policy_version_id is not None:
            policy_snapshot = (await session.execute(
                select(TestPolicyVersion.snapshot)
                .where(TestPolicyVersion.policy_version_id == sess.policy_version_id)
            )).scalar_one_or_none()
        if isinstance(policy_snapshot, dict):
            time_limit_minutes = int(policy_snapshot.get("time_limit_minutes") or time_limit_minutes)
        proctor_min_level = int(policy_snapshot_value(policy_snapshot, "proctor_min_level", 0))
        started_at = sess.started_at if sess.started_at else _now_utc()
        if started_at.tzinfo is None:
            started_at = started_at.replace(tzinfo=timezone.utc)
        expires_at = started_at + timedelta(minutes=time_limit_minutes)
        topic_metadata = await _topic_metadata(session, sess, topic_test)
        return ResumeOut(
            session_id=sess.session_id,
            started_at=started_at,
            time_limit_minutes=time_limit_minutes,
            expires_at=expires_at,
            questions=[
                QuestionOut(
                    question_id=q.question_id,
                    question_text=q.text,
                    options=[
                        OptionOut(
                            option_id=o.option_id,
                            option_number=o.option_number,
                            option_text=o.text,
                        )
                        for o in q.options
                    ],
                    qtype=extra_meta[q.question_id]["qtype"],
                    qmeta=_censor_qmeta(extra_meta.get(q.question_id)),
                    image_url=image_urls.get(q.question_id),
                    points=float(next(
                        item.snapshot.get("points", 1.0)
                        for item in snapshots
                        if item.question_id == q.question_id
                    )),
                )
                for q in questions
            ],
            saved_answers=saved_answers,
            saved_extras=saved_extras,
            proctor_min_level=proctor_min_level,
            topic_metadata=topic_metadata,
        )

    max_count = sess.max_score or 10
    candidate_stmt = (
        select(Question.question_id, Question.text, Question.qtype,
               Question.short_pattern, Question.numeric_tolerance, Question.match_pairs,
               Question.correct_bool, Question.explanation,
               Question.case_sensitive, Question.trim_whitespace,
               Question.normalize_universal, Question.text_mode, Question.allow_partial)
        .order_by(Question.question_id)
        .limit(max_count * 4)
    )
    if sess.topic_id is not None:
        candidate_stmt = candidate_stmt.where(Question.topic_id == sess.topic_id)
    else:
        candidate_stmt = candidate_stmt.where(Question.discipline_id == sess.discipline_id)
    candidate_rows = (await session.execute(candidate_stmt)).all()
    import random as _r
    scope_id = sess.topic_id if sess.topic_id is not None else sess.discipline_id
    rng = _r.Random(scope_id * 1000 + sess.student_id)
    pool = list(candidate_rows)
    rng.shuffle(pool)
    picked = pool[:max_count]
    q_meta: dict[int, tuple] = {row[0]: tuple(row[1:]) for row in picked}
    q_ids = [qid for qid in q_meta]
    if not q_ids:
        raise HTTPException(status_code=400, detail="no questions")

    o_rows = (await session.execute(
        select(AnswerOption).where(AnswerOption.question_id.in_(q_ids))
    )).scalars().all()
    grouped: dict[int, list[AnswerOption]] = {}
    for o in o_rows:
        grouped.setdefault(o.question_id, []).append(o)

    acceptable_by_q: dict[int, list[str]] = {qid: [] for qid in q_ids}
    aa_rows = (await session.execute(
        text("SELECT question_id, answer FROM question_acceptable_answers WHERE question_id = ANY(:ids) ORDER BY question_id, ord")
        .bindparams(ids=q_ids)
    )).all()
    for qid, ans in aa_rows:
        acceptable_by_q.setdefault(qid, []).append(ans)

    cloze_by_q: dict[int, list[dict]] = {qid: [] for qid in q_ids}
    cloze_rows = (await session.execute(
        select(QuestionClozeBlank).where(QuestionClozeBlank.question_id.in_(q_ids))
    )).scalars().all()
    for b in cloze_rows:
        cloze_by_q.setdefault(b.question_id, []).append({
            "index": b.blank_index,
            "kind": b.kind,
            "options": b.options,
            "correct_index": b.correct_index,
            "acceptable_answers": b.acceptable_answers,
        })

    extra_meta: dict[int, dict] = {}
    for qid in q_ids:
        meta = q_meta[qid]
        opts = grouped.get(qid, [])
        # meta order: text, qtype, short_pattern, numeric_tolerance, match_pairs,
        #             correct_bool, explanation, case_sensitive, trim_whitespace,
        #             normalize_universal, text_mode, allow_partial
        extra_meta[qid] = {
            "qtype": meta[1],
            "short_pattern": meta[2],
            "numeric_tolerance": float(meta[3]) if meta[3] is not None else None,
            "match_pairs": meta[4] or [],
            "acceptable_answers": acceptable_by_q.get(qid, []),
            "correct_bool": meta[5],
            "explanation": meta[6],
            "case_sensitive": bool(meta[7]),
            "trim_whitespace": bool(meta[8]),
            "normalize_universal": bool(meta[9]),
            "text_mode": meta[10] or "string",
            "allow_partial": bool(meta[11]),
            "cloze_blanks": cloze_by_q.get(qid, []),
            "options_meta": [
                {
                    "option_id": o.option_id,
                    "text": o.text,
                    "is_correct": o.is_correct,
                    "match_left": o.match_left,
                    "match_right": o.match_right,
                    "correct_position": o.correct_position,
                }
                for o in opts
            ],
        }

    questions: list[QuestionDTO] = []
    for qid in q_ids:
        opts = grouped.get(qid, [])
        questions.append(QuestionDTO(
            question_id=qid,
            text=q_meta[qid][0],
            options=[OptionDTO(option_id=o.option_id, option_number=o.option_number, text=o.text, is_correct=o.is_correct) for o in opts],
        ))
    questions = shuffle_questions(questions, seed=sess.session_id * 37)
    questions = [shuffle_options(q, seed=sess.session_id) for q in questions]

    saved_rows = (await session.execute(
        select(StudentAnswer.question_id, StudentAnswer.selected_option_id, StudentAnswer.answer_id)
        .where(StudentAnswer.session_id == session_id)
    )).all()
    saved_answers: dict[int, int] = {}
    extra_by_answer = {}
    if saved_rows:
        extras = (await session.execute(
            select(AnswerExtra).where(
                AnswerExtra.answer_id.in_([r[2] for r in saved_rows])
            )
        )).scalars().all()
        for e in extras:
            extra_by_answer[e.answer_id] = e
    for qid, oid, aid in saved_rows:
        if oid is not None:
            saved_answers[qid] = oid
    saved_extras: dict[int, dict] = {}
    for qid, oid, aid in saved_rows:
        e = extra_by_answer.get(aid)
        if e:
            saved_extras[qid] = {
                "short": e.short_answer_raw,
                "match": e.match_pairs,
                "numeric": e.short_answer_raw,
            }
        else:
            uploads = (await session.execute(
                select(AnswerFileUpload).where(AnswerFileUpload.answer_id == aid)
            )).scalars().all()
            if uploads:
                saved_extras[qid] = {
                    "files": [
                        {
                            "upload_id": up.upload_id,
                            "original_name": up.original_name,
                            "size_bytes": up.size_bytes,
                            "uploaded_at": up.uploaded_at.isoformat() if up.uploaded_at else None,
                        } for up in uploads
                    ]
                }

    image_urls: dict[int, str] = {}
    image_rows = (await session.execute(
        select(QuestionImage.image_id, QuestionImage.question_id)
        .where(QuestionImage.question_id.in_(q_ids))
    )).all()
    for image_id, qid in image_rows:
        image_urls[qid] = question_image_url(image_id)

    policy = (await session.execute(
        select(AttemptsPolicy).where(
            AttemptsPolicy.teacher_id == sess.teacher_id,
            AttemptsPolicy.discipline_id == sess.discipline_id,
        )
    )).scalar_one_or_none()
    proctor_min_level = policy.proctor_min_level if policy else 0

    started_at = sess.started_at if sess.started_at else _now_utc()
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    expires_at = started_at + timedelta(minutes=time_limit_minutes)
    points_map = await _question_points(session, q_ids)
    topic_metadata = await _topic_metadata(session, sess, topic_test)
    return ResumeOut(
        session_id=sess.session_id,
        started_at=started_at,
        time_limit_minutes=time_limit_minutes,
        expires_at=expires_at,
        questions=[
            QuestionOut(
                question_id=q.question_id,
                question_text=q.text,
                options=[OptionOut(option_id=o.option_id, option_number=o.option_number, option_text=o.text) for o in q.options],
                qtype=extra_meta[q.question_id]["qtype"],
                qmeta=_censor_qmeta(extra_meta.get(q.question_id)),
                image_url=image_urls.get(q.question_id),
                points=points_map.get(q.question_id, 1.0),
            ) for q in questions
        ],
        saved_answers=saved_answers,
        saved_extras=saved_extras,
        proctor_min_level=proctor_min_level,
        topic_metadata=topic_metadata,
    )



@router.get("/sessions/{session_id}/detail", response_model=StudentSessionDetailOut)
async def student_session_detail(
    session_id: int,
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
) -> StudentSessionDetailOut:
    sess = (await session.execute(
        select(TestSession).where(TestSession.session_id == session_id)
    )).scalar_one_or_none()
    if sess is None or sess.student_id != user.id:
        raise HTTPException(status_code=403, detail="session not yours")

    discipline_name = (await session.execute(
        select(Discipline.name).where(Discipline.discipline_id == sess.discipline_id)
    )).scalar_one_or_none() or "Дисциплина"
    topic_name = None
    grade_scale = "5_point"
    passing_score_percent = None
    if sess.topic_id is not None:
        topic_name = (await session.execute(
            select(DisciplineTopic.name).where(DisciplineTopic.topic_id == sess.topic_id)
        )).scalar_one_or_none()
        test_settings = (await session.execute(
            select(TeacherTopicTest).where(
                TeacherTopicTest.topic_id == sess.topic_id,
                TeacherTopicTest.teacher_id == sess.teacher_id,
            )
        )).scalar_one_or_none()
        if test_settings:
            grade_scale = test_settings.grade_scale
            passing_score_percent = test_settings.passing_score_percent
    else:
        policy = (await session.execute(
            select(AttemptsPolicy).where(
                AttemptsPolicy.teacher_id == sess.teacher_id,
                AttemptsPolicy.discipline_id == sess.discipline_id,
            )
        )).scalar_one_or_none()
        if policy:
            passing_score_percent = None
    if sess.policy_version_id is not None:
        policy_snapshot = (await session.execute(
            select(TestPolicyVersion.snapshot)
            .where(TestPolicyVersion.policy_version_id == sess.policy_version_id)
        )).scalar_one_or_none()
        if isinstance(policy_snapshot, dict):
            grade_scale = policy_snapshot.get("grade_scale") or grade_scale
            passing_score_percent = policy_snapshot.get("passing_score_percent", passing_score_percent)

    answer_rows = (await session.execute(
        select(StudentAnswer)
        .where(StudentAnswer.session_id == session_id)
    )).scalars().all()
    answer_by_q = {a.question_id: a for a in answer_rows}
    extras = {}
    if answer_rows:
        extras = {
            e.answer_id: e
            for e in (await session.execute(
                select(AnswerExtra).where(AnswerExtra.answer_id.in_([a.answer_id for a in answer_rows]))
            )).scalars().all()
        }

    questions = await _questions_for_session_detail(session, sess)

    breakdown = await grade_session(session, sess)
    breakdown_by_q = {b["question_id"]: b for b in breakdown.per_question}
    show_correctness = await _show_correctness_for_session(session, sess)
    snapshots = await session_question_snapshots(session, sess.session_id)
    if snapshots:
        comments = (await session.execute(
            select(AnswerComment.question_id, AnswerComment.body).where(AnswerComment.session_id == session_id)
        )).all()
        comment_by_q = {qid: body for qid, body in comments}
        detail_answers: list[StudentSessionAnswerDetailOut] = []
        for item in snapshots:
            snapshot = item.snapshot
            answer = answer_by_q.get(item.question_id)
            extra = extras.get(answer.answer_id) if answer else None
            score_info = breakdown_by_q.get(item.question_id)
            is_correct = bool(score_info["is_correct"]) if score_info and show_correctness else None
            earned = int(round(float(score_info["points_earned"]))) if score_info else 0
            qtype = str(snapshot.get("qtype") or "single")
            max_pts = int(round(float(snapshot.get("points") or 1.0)))
            if qtype == "file_upload":
                uploads_count = 0
                if answer:
                    uploads_count = (await session.execute(
                        select(func.count()).select_from(AnswerFileUpload).where(AnswerFileUpload.answer_id == answer.answer_id)
                    )).scalar_one() or 0
                std_ans = f"Загружено файлов: {uploads_count}" if uploads_count else "Файлы не загружены"
                std_ans_render = {"kind": "text", "value": std_ans}
                corr_ans = "Проверяется преподавателем" if show_correctness else None
                corr_ans_render = {"kind": "text", "value": "Проверяется преподавателем"} if show_correctness else None
            else:
                std_ans = snapshot_student_answer_text(
                    snapshot=snapshot,
                    selected_option_id=answer.selected_option_id if answer else None,
                    short_answer_raw=extra.short_answer_raw if extra else None,
                    match_pairs=extra.match_pairs if extra else None,
                )
                std_ans_render = snapshot_student_answer_render(
                    snapshot=snapshot,
                    selected_option_id=answer.selected_option_id if answer else None,
                    short_answer_raw=extra.short_answer_raw if extra else None,
                    match_pairs=extra.match_pairs if extra else None,
                )
                corr_ans = snapshot_correct_answer(snapshot) if show_correctness else None
                corr_ans_render = snapshot_correct_answer_render(snapshot) if show_correctness else None

            detail_answers.append(StudentSessionAnswerDetailOut(
                question_id=item.question_id,
                question_text=str(snapshot.get("text") or ""),
                question_type=qtype,
                question_image_url=question_image_url(snapshot["image_id"]) if snapshot.get("image_id") else None,
                student_answer=std_ans,
                student_answer_render=std_ans_render,
                correct_answer=corr_ans,
                correct_answer_render=corr_ans_render,
                is_correct=is_correct,
                explanation=snapshot.get("explanation") if show_correctness else None,
                comment=comment_by_q.get(item.question_id),
                score=earned,
                max_score=max_pts,
            ))

        duration_seconds = None
        if sess.completed_at is not None and sess.started_at is not None:
            duration_seconds = max(0, int((sess.completed_at - sess.started_at).total_seconds()))
        percent = _session_percent(sess)
        is_passed = None
        if passing_score_percent is not None and percent is not None:
            is_passed = percent >= passing_score_percent

        return StudentSessionDetailOut(
            session_id=sess.session_id,
            discipline_id=sess.discipline_id,
            discipline_name=discipline_name,
            topic_id=sess.topic_id,
            topic_name=topic_name,
            started_at=sess.started_at,
            completed_at=sess.completed_at,
            score=sess.score,
            max_score=sess.max_score,
            percent=percent,
            attempt_number=sess.attempt_no,
            status=sess.status,
            show_correctness=show_correctness,
            passing_score_percent=passing_score_percent,
            is_passed=is_passed,
            duration_seconds=duration_seconds,
            answers=detail_answers,
            grade_scale=grade_scale,
            comment=sess.comment,
        )
    image_rows = (await session.execute(
        select(QuestionImage.image_id, QuestionImage.question_id)
        .where(QuestionImage.question_id.in_([q.question_id for q in questions] or [-1]))
    )).all()
    image_by_q = {qid: question_image_url(image_id) for image_id, qid in image_rows}
    comments = (await session.execute(
        select(AnswerComment.question_id, AnswerComment.body).where(AnswerComment.session_id == session_id)
    )).all()
    comment_by_q = {qid: body for qid, body in comments}

    detail_answers: list[StudentSessionAnswerDetailOut] = []
    for q in questions:
        answer = answer_by_q.get(q.question_id)
        extra = extras.get(answer.answer_id) if answer else None
        selected_option = None
        options = (await session.execute(
            select(AnswerOption).where(AnswerOption.question_id == q.question_id).order_by(AnswerOption.option_number.asc())
        )).scalars().all()
        options_by_id = {o.option_id: o for o in options}
        if answer and answer.selected_option_id is not None:
            selected_option = next((o for o in options if o.option_id == answer.selected_option_id), None)
        max_pts = int(round(float(q.points or 1.0)))
        if q.qtype == "file_upload":
            uploads_count = 0
            if answer:
                uploads_count = (await session.execute(
                    select(func.count()).select_from(AnswerFileUpload).where(AnswerFileUpload.answer_id == answer.answer_id)
                )).scalar_one() or 0
            student_answer = f"Загружено файлов: {uploads_count}" if uploads_count else "Файлы не загружены"
            student_answer_render = {"kind": "text", "value": student_answer}
            correct_answer = "Проверяется преподавателем" if show_correctness else None
            correct_answer_render = {"kind": "text", "value": "Проверяется преподавателем"} if show_correctness else None
        else:
            if q.qtype == "single" and selected_option:
                student_answer = selected_option.text
            elif q.qtype == "bool" and extra and extra.short_answer_raw in ("true", "false"):
                student_answer = "Верно" if extra.short_answer_raw == "true" else "Неверно"
            else:
                student_answer = _answer_text_from_extra(q.qtype, extra)
            student_answer_render = _answer_render_from_extra(q.qtype, extra, selected_option, options_by_id)
            correct_answer = await _correct_answer_for_question(session, q, options) if show_correctness else None
            correct_answer_render = await _correct_answer_render_for_question(session, q, options) if show_correctness else None

        score_info = breakdown_by_q.get(q.question_id)
        is_correct = bool(score_info["is_correct"]) if score_info and show_correctness else None
        earned = int(round(float(score_info["points_earned"]))) if score_info else 0
        detail_answers.append(StudentSessionAnswerDetailOut(
            question_id=q.question_id,
            question_text=q.text,
            question_type=q.qtype,
            question_image_url=image_by_q.get(q.question_id),
            student_answer=student_answer,
            student_answer_render=student_answer_render,
            correct_answer=correct_answer,
            correct_answer_render=correct_answer_render,
            is_correct=is_correct,
            explanation=q.explanation if show_correctness else None,
            comment=comment_by_q.get(q.question_id),
            score=earned,
            max_score=max_pts,
        ))

    duration_seconds = None
    if sess.completed_at is not None and sess.started_at is not None:
        duration_seconds = max(0, int((sess.completed_at - sess.started_at).total_seconds()))
    percent = _session_percent(sess)
    is_passed = None
    if passing_score_percent is not None and percent is not None:
        is_passed = percent >= passing_score_percent

    return StudentSessionDetailOut(
        session_id=sess.session_id,
        discipline_id=sess.discipline_id,
        discipline_name=discipline_name,
        topic_id=sess.topic_id,
        topic_name=topic_name,
        started_at=sess.started_at,
        completed_at=sess.completed_at,
        score=sess.score,
        max_score=sess.max_score,
        percent=percent,
        attempt_number=sess.attempt_no,
        status=sess.status,
        show_correctness=show_correctness,
        passing_score_percent=passing_score_percent,
        is_passed=is_passed,
        duration_seconds=duration_seconds,
        answers=detail_answers,
        grade_scale=grade_scale,
        comment=sess.comment,
    )


@router.get("/sessions/{session_id}/recommendations", response_model=SessionRecommendationsOut)
async def student_session_recommendations(
    session_id: int,
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
) -> SessionRecommendationsOut:
    """R-30 — рекомендации студенту после теста: темы для повторения."""
    sess = (await session.execute(
        select(TestSession).where(TestSession.session_id == session_id)
    )).scalar_one_or_none()
    if sess is None or sess.student_id != user.id:
        raise HTTPException(status_code=403, detail="session not yours")

    discipline_name = (await session.execute(
        select(Discipline.name).where(Discipline.discipline_id == sess.discipline_id)
    )).scalar_one_or_none() or "Дисциплина"

    percent = _session_percent(sess)

    # Определяем passing_score_percent для is_passed
    passing_score_percent: Optional[int] = None
    grade_scale = "5_point"
    if sess.topic_id is not None:
        test_settings = (await session.execute(
            select(TeacherTopicTest).where(
                TeacherTopicTest.topic_id == sess.topic_id,
                TeacherTopicTest.teacher_id == sess.teacher_id,
            )
        )).scalar_one_or_none()
        if test_settings:
            passing_score_percent = test_settings.passing_score_percent
            grade_scale = test_settings.grade_scale
    if sess.policy_version_id is not None:
        policy_snapshot = (await session.execute(
            select(TestPolicyVersion.snapshot)
            .where(TestPolicyVersion.policy_version_id == sess.policy_version_id)
        )).scalar_one_or_none()
        if isinstance(policy_snapshot, dict):
            passing_score_percent = policy_snapshot.get("passing_score_percent", passing_score_percent)

    is_passed: Optional[bool] = None
    if passing_score_percent is not None and percent is not None:
        is_passed = percent >= passing_score_percent

    # Получаем ответы студента
    answer_rows = (await session.execute(
        select(StudentAnswer).where(StudentAnswer.session_id == session_id)
    )).scalars().all()

    # Получаем детализацию оценки
    breakdown = await grade_session(session, sess)
    breakdown_by_q = {b["question_id"]: b for b in breakdown.per_question}

    # Идентифицируем вопросы, на которые ответили неверно
    wrong_question_ids: list[int] = [
        qid for qid, info in breakdown_by_q.items()
        if not info.get("is_correct", True)
    ]

    # Получаем темы для неверных вопросов
    weak_topics: list[RecommendationTopicOut] = []
    if wrong_question_ids:
        # Загружаем topic_id и question_id для неверных вопросов
        wrong_q_topic_rows = (await session.execute(
            select(Question.question_id, Question.topic_id)
            .where(Question.question_id.in_(wrong_question_ids))
        )).all()

        # topic_id -> list of wrong question_ids
        wrong_by_topic: dict[int, list[int]] = {}
        for qid, tid in wrong_q_topic_rows:
            if tid is not None:
                wrong_by_topic.setdefault(tid, []).append(qid)

        if wrong_by_topic:
            topic_ids = list(wrong_by_topic.keys())
            # Загружаем информацию о темах
            topic_rows = (await session.execute(
                select(DisciplineTopic).where(DisciplineTopic.topic_id.in_(topic_ids))
            )).scalars().all()

            # Загружаем общее количество вопросов по каждой теме в сессии
            all_session_q_ids = list(breakdown_by_q.keys())
            all_q_topic_rows = (await session.execute(
                select(Question.question_id, Question.topic_id)
                .where(Question.question_id.in_(all_session_q_ids or [-1]))
            )).all()
            total_by_topic: dict[int, int] = {}
            for qid, tid in all_q_topic_rows:
                if tid is not None:
                    total_by_topic[tid] = total_by_topic.get(tid, 0) + 1

            # Загружаем изображения тем
            topic_images = (await session.execute(
                select(DisciplineTopicImage.topic_id, DisciplineTopicImage.image_id)
                .where(DisciplineTopicImage.topic_id.in_(topic_ids))
            )).all()
            image_by_topic = {tid: topic_image_url(iid) for tid, iid in topic_images}

            # Проверяем, есть ли активный тест для темы
            topic_tests = (await session.execute(
                select(TeacherTopicTest.topic_id)
                .where(
                    TeacherTopicTest.topic_id.in_(topic_ids),
                    TeacherTopicTest.teacher_id == sess.teacher_id,
                    TeacherTopicTest.is_enabled == True,
                )
            )).scalars().all()
            active_test_topic_ids = set(topic_tests)

            for topic in topic_rows:
                wcount = len(wrong_by_topic.get(topic.topic_id, []))
                tcount = total_by_topic.get(topic.topic_id, wcount)
                wrong_pct = round(wcount * 100.0 / tcount, 1) if tcount > 0 else 100.0
                weak_topics.append(RecommendationTopicOut(
                    topic_id=topic.topic_id,
                    topic_name=topic.name,
                    description=topic.description,
                    image_url=image_by_topic.get(topic.topic_id),
                    wrong_questions_count=wcount,
                    total_questions_count=tcount,
                    wrong_percent=wrong_pct,
                    reason="weak_topic",
                    has_active_test=topic.topic_id in active_test_topic_ids,
                    topic_link=f"/student/topics/{topic.topic_id}",
                ))
            weak_topics.sort(key=lambda t: t.wrong_percent, reverse=True)

    # Связанные темы — активные темы в той же дисциплине, которые студент ещё не проходил
    related_topics: list[RecommendationTopicOut] = []
    all_discipline_topics = (await session.execute(
        select(DisciplineTopic)
        .where(
            DisciplineTopic.discipline_id == sess.discipline_id,
            DisciplineTopic.archived_at == None,  # noqa: E711
        )
        .order_by(DisciplineTopic.sort_order.asc(), DisciplineTopic.topic_id.asc())
    )).scalars().all()

    if all_discipline_topics:
        all_topic_ids = [t.topic_id for t in all_discipline_topics]
        weak_topic_ids = {t.topic_id for t in weak_topics}

        # Темы, которые студент уже начинал в этой дисциплине
        started_topic_ids_rows = (await session.execute(
            select(TestSession.topic_id).where(
                TestSession.student_id == user.id,
                TestSession.discipline_id == sess.discipline_id,
                TestSession.topic_id.in_(all_topic_ids),
            )
        )).scalars().all()
        started_topic_ids = {tid for tid in started_topic_ids_rows if tid is not None}

        # Темы с активными тестами
        all_active_tests = (await session.execute(
            select(TeacherTopicTest.topic_id)
            .where(
                TeacherTopicTest.topic_id.in_(all_topic_ids),
                TeacherTopicTest.teacher_id == sess.teacher_id,
                TeacherTopicTest.is_enabled == True,
            )
        )).scalars().all()
        all_active_test_ids = set(all_active_tests)

        # Изображения для всех тем
        all_topic_images = (await session.execute(
            select(DisciplineTopicImage.topic_id, DisciplineTopicImage.image_id)
            .where(DisciplineTopicImage.topic_id.in_(all_topic_ids))
        )).all()
        all_image_by_topic = {tid: topic_image_url(iid) for tid, iid in all_topic_images}

        for topic in all_discipline_topics:
            # Пропускаем текущую тему и слабые темы (уже выше)
            if topic.topic_id == sess.topic_id or topic.topic_id in weak_topic_ids:
                continue
            # Только темы с активными тестами
            if topic.topic_id not in all_active_test_ids:
                continue
            reason = "not_started" if topic.topic_id not in started_topic_ids else "related_topic"
            related_topics.append(RecommendationTopicOut(
                topic_id=topic.topic_id,
                topic_name=topic.name,
                description=topic.description,
                image_url=all_image_by_topic.get(topic.topic_id),
                wrong_questions_count=0,
                total_questions_count=0,
                wrong_percent=0.0,
                reason=reason,
                has_active_test=True,
                topic_link=f"/student/topics/{topic.topic_id}",
            ))
        # Сначала не начатые, потом начатые
        related_topics.sort(key=lambda t: (0 if t.reason == "not_started" else 1, t.topic_name))
        related_topics = related_topics[:5]  # максимум 5

    # Формируем подсказки для повторения (review_hints) на основе текстов вопросов
    review_hints: list[str] = []
    if wrong_question_ids:
        snapshots = await session_question_snapshots(session, sess.session_id)
        if snapshots:
            for item in snapshots:
                if item.question_id in wrong_question_ids:
                    # Берём первые слова текста вопроса как подсказку
                    text = str(item.snapshot.get("text") or "")
                    if text and len(text) > 10:
                        hint = text[:80].strip()
                        if len(text) > 80:
                            hint += "…"
                        review_hints.append(hint)
        else:
            # Fallback — грузим напрямую из Question
            q_texts = (await session.execute(
                select(Question.question_id, Question.text)
                .where(Question.question_id.in_(wrong_question_ids))
            )).all()
            for qid, text in q_texts:
                if text and len(text) > 10:
                    hint = text[:80].strip()
                    if len(text) > 80:
                        hint += "…"
                    review_hints.append(hint)
        review_hints = review_hints[:5]

    # Генерируем итоговое сообщение
    wrong_count = len(wrong_question_ids)
    total_count = len(breakdown_by_q)
    if wrong_count == 0:
        summary_message = "Отличная работа! Вы ответили правильно на все вопросы. Попробуйте другие темы для закрепления материала."
    elif percent is not None and percent >= 80:
        summary_message = f"Хороший результат! Вы допустили {wrong_count} из {total_count} ошибок. Повторите указанные темы для закрепления."
    elif percent is not None and percent >= 50:
        summary_message = f"Удовлетворительный результат. Обратите внимание на {wrong_count} вопрос{'а' if wrong_count in (2,3,4) else 'ов' if wrong_count > 4 else ''}, в которых были ошибки, и повторите соответствующие темы."
    else:
        summary_message = f"Результат ниже ожиданий ({wrong_count} ошибок из {total_count} вопросов). Рекомендуем тщательно проработать указанные темы и повторить попытку."

    return SessionRecommendationsOut(
        session_id=sess.session_id,
        discipline_id=sess.discipline_id,
        discipline_name=discipline_name,
        topic_id=sess.topic_id,
        score_percent=percent,
        is_passed=is_passed,
        weak_topics=weak_topics,
        related_topics=related_topics,
        review_hints=review_hints,
        summary_message=summary_message,
    )


@router.get("/reports/sessions/{session_id}.pdf")
async def student_session_pdf(
    session_id: int,
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
):
    detail = await student_session_detail(session_id, user, session)
    rows = "".join(
        "<tr>"
        f"<td>{_html_escape(a.question_text)}</td>"
        f"<td>{_html_escape(a.student_answer or '—')}</td>"
        f"<td>{_html_escape(a.correct_answer or ('скрыто' if not detail.show_correctness else '—'))}</td>"
        f"<td>{_html_escape('верно' if a.is_correct else 'неверно' if a.is_correct is False else '—')}</td>"
        f"<td>{_html_escape(a.comment or '')}</td>"
        "</tr>"
        for a in detail.answers
    )
    html = f"""
    <html><head><meta charset="utf-8">
    <style>
      body {{ font-family: sans-serif; color: #111827; }}
      h1 {{ font-size: 22px; margin-bottom: 4px; }}
      .muted {{ color: #6b7280; font-size: 12px; }}
      table {{ width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 11px; }}
      th, td {{ border: 1px solid #d1d5db; padding: 6px; vertical-align: top; }}
      th {{ background: #f3f4f6; text-align: left; }}
    </style></head><body>
      <h1>{_html_escape(detail.discipline_name)}{(' — ' + _html_escape(detail.topic_name)) if detail.topic_name else ''}</h1>
      <div class="muted">Студент: {_html_escape(user.full_name)}</div>
      <div class="muted">Сессия #{detail.session_id}; результат: {detail.score} из {detail.max_score}</div>
      <table>
        <thead><tr><th>Вопрос</th><th>Ваш ответ</th><th>Правильный ответ</th><th>Статус</th><th>Комментарий</th></tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </body></html>
    """
    if _HAS_WEASY:
        pdf_bytes = _WeasyHTML(string=html, base_url=".").write_pdf()
        return StreamingResponse(
            iter([pdf_bytes]),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="student-session-{session_id}.pdf"'},
        )
    return StreamingResponse(
        iter([html.encode("utf-8")]),
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="student-session-{session_id}.html"'},
    )


@router.post("/complaints")
async def student_complaint(
    payload: StudentComplaintIn,
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
):
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=422, detail="body is required")

    teacher_id: int | None = None
    discipline_id: int | None = None
    topic_id: int | None = payload.topic_id
    session_id: int | None = payload.session_id

    if session_id is not None:
        sess = (await session.execute(
            select(TestSession).where(TestSession.session_id == session_id)
        )).scalar_one_or_none()
        if sess is None or sess.student_id != user.id:
            raise HTTPException(status_code=403, detail="session not yours")
        teacher_id = sess.teacher_id
        discipline_id = sess.discipline_id
        topic_id = sess.topic_id
    elif topic_id is not None:
        topic = (await session.execute(
            select(DisciplineTopic).where(
                DisciplineTopic.topic_id == topic_id,
                DisciplineTopic.archived_at.is_(None),
            )
        )).scalar_one_or_none()
        if topic is None or not await student_can_access_discipline(session, user.id, topic.discipline_id):
            raise HTTPException(status_code=404, detail="topic not found")
        discipline_id = topic.discipline_id
        topic_test = (await session.execute(
            select(TeacherTopicTest)
            .where(TeacherTopicTest.topic_id == topic_id)
            .order_by(TeacherTopicTest.teacher_id.asc())
        )).scalars().first()
        teacher_id = topic_test.teacher_id if topic_test else None
    else:
        raise HTTPException(status_code=400, detail="session_id or topic_id is required")

    if teacher_id is None or discipline_id is None:
        raise HTTPException(status_code=409, detail="teacher not found")

    meta = await _student_problem_meta(
        session,
        user,
        discipline_id=discipline_id,
        topic_id=topic_id,
        reason="student complaint",
        session_id=session_id,
    )
    meta["complaint_body"] = body
    await notify_teacher(
        session,
        teacher_id,
        "student_complaint",
        title="Жалоба студента",
        body=f"{user.full_name}: {body}",
        link=f"/teacher/reference/students/{user.id}",
        meta=meta,
        severity=1,
    )
    await session.commit()
    return {"ok": True}


@router.get("/notifications", response_model=StudentNotificationsOut)
async def student_notifications(
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    type: Optional[str] = Query(default=None),
    is_read: Optional[bool] = Query(default=None),
) -> StudentNotificationsOut:
    await _ensure_student_availability_notifications(session, user.id)
    await session.commit()
    base = select(Notification).where(
        Notification.user_role == "student",
        Notification.user_id == user.id,
    )
    cnt_stmt = select(func.count()).select_from(Notification).where(
        Notification.user_role == "student",
        Notification.user_id == user.id,
    )
    if type:
        base = base.where(Notification.event_type == type)
        cnt_stmt = cnt_stmt.where(Notification.event_type == type)
    if is_read is not None:
        if is_read:
            base = base.where(Notification.read_at.isnot(None))
            cnt_stmt = cnt_stmt.where(Notification.read_at.isnot(None))
        else:
            base = base.where(Notification.read_at.is_(None))
            cnt_stmt = cnt_stmt.where(Notification.read_at.is_(None))
    total = int((await session.execute(
        cnt_stmt
    )).scalar_one() or 0)
    unread = int((await session.execute(
        select(func.count()).select_from(Notification).where(
            Notification.user_role == "student",
            Notification.user_id == user.id,
            Notification.read_at.is_(None),
        )
    )).scalar_one() or 0)
    rows = (await session.execute(
        base.order_by(Notification.created_at.desc()).offset(offset).limit(limit)
    )).scalars().all()
    return StudentNotificationsOut(
        items=[_notification_view(n) for n in rows],
        total=total,
        unread_count=unread,
    )


@router.get("/notifications/stream")
async def student_notifications_stream(
    request: Request,
    token: Optional[str] = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    raw_token = token
    if raw_token is None:
        auth = request.headers.get("authorization")
        if auth and auth.lower().startswith("bearer "):
            raw_token = auth.split(" ", 1)[1]
    if raw_token:
        try:
            payload = decode_token(raw_token)
            if payload.get("role") != "student":
                raise ValueError("role")
            s = (await session.execute(
                select(Student).where(Student.student_id == int(payload["sub"]))
            )).scalar_one_or_none()
            if s is None:
                raise ValueError("student")
            user = CurrentUser(
                id=s.student_id,
                email=s.email,
                role="student",
                full_name=f"{s.last_name} {s.first_name} {s.middle_name or ''}".strip(),
                group_id=s.group_id,
                login=s.login,
            )
        except Exception as e:
            raise HTTPException(status_code=401, detail="missing or invalid auth") from e
    else:
        raise HTTPException(status_code=401, detail="missing or invalid auth")
    if user.role != "student":
        raise HTTPException(status_code=403, detail="students only")
    q = bus.subscribe("student", user.id)

    async def gen() -> AsyncIterator[bytes]:
        try:
            yield _sse('{"hello":"connected"}', event="hello")
            while True:
                try:
                    evt = await asyncio.wait_for(q.get(), timeout=20)
                    yield _sse(json.dumps(evt, ensure_ascii=False), event=evt.get("event_type", "message"))
                except asyncio.TimeoutError:
                    yield _sse('{"keep":"alive"}', event="ping")
                if await request.is_disconnected():
                    break
        finally:
            bus.unsubscribe("student", user.id, q)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/notifications/{notification_id}/read")
async def student_notification_read(
    notification_id: int,
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
):
    n = (await session.execute(
        select(Notification).where(Notification.notification_id == notification_id)
    )).scalar_one_or_none()
    if n is None or n.user_role != "student" or n.user_id != user.id:
        return {"ok": True}
    if n.read_at is None:
        n.read_at = _now_utc()
        await session.commit()
    return {"ok": True}


@router.post("/notifications/read-all")
async def student_notifications_read_all(
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
):
    rows = (await session.execute(
        select(Notification).where(
            Notification.user_role == "student",
            Notification.user_id == user.id,
            Notification.read_at.is_(None),
        )
    )).scalars().all()
    now = _now_utc()
    for n in rows:
        n.read_at = now
    await session.commit()
    return {"ok": True, "read": len(rows)}


@router.get("/activity", response_model=StudentActivityOut)
async def student_activity(
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    source: Optional[str] = Query(default=None, pattern="^(audit|notification|session)$"),
) -> StudentActivityOut:
    items, total = await build_student_activity(
        session,
        student_id=user.id,
        limit=limit,
        offset=offset,
        source=source,  # type: ignore[arg-type]
    )
    summary = await student_activity_summary(session, student_id=user.id)
    return StudentActivityOut(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        **summary,
    )


@router.post("/change-password", dependencies=[Depends(change_password_limiter)])
async def student_change_password(
    payload: dict,
    request: Request,
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
):
    current_password = str(payload.get("current_password") or "")
    new_password = str(payload.get("new_password") or "")
    if len(new_password) < 8 or not any(c.isupper() for c in new_password) or not any(c.isdigit() for c in new_password):
        raise HTTPException(status_code=422, detail="new password must contain 8 chars, uppercase and digit")
    cred = (await session.execute(
        select(UserCredential).where(UserCredential.role == "student", UserCredential.user_id == user.id)
    )).scalar_one_or_none()
    if cred is None or not verify_password(current_password, cred.password_hash):
        raise HTTPException(status_code=403, detail="invalid current password")
    cred.password_hash = hash_password(new_password)
    await record_audit(
        session,
        actor_role="student",
        actor_id=user.id,
        action="student_password_changed",
        target_type="student",
        target_id=user.id,
        ip_addr=client_ip(request),
    )
    await session.commit()
    return {"success": True, "message": "Пароль изменён"}


@router.get("/sessions/{session_id}")
async def session_detail(
    session_id: int,
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
):
    sess = (await session.execute(
        select(TestSession).where(TestSession.session_id == session_id)
    )).scalar_one_or_none()
    if sess is None or sess.student_id != user.id:
        raise HTTPException(status_code=403, detail="session not yours")

    rows = (await session.execute(
        select(Question.text, AnswerOption.text, AnswerOption.is_correct, AnswerOption.option_number, Question.qtype)
        .select_from(StudentAnswer)
        .join(Question, Question.question_id == StudentAnswer.question_id)
        .join(AnswerOption, AnswerOption.option_id == StudentAnswer.selected_option_id)
        .where(StudentAnswer.session_id == session_id)
    )).all()
    return {
        "session_id": sess.session_id,
        "discipline_id": sess.discipline_id,
        "started_at": sess.started_at,
        "completed_at": sess.completed_at,
        "score": sess.score,
        "max_score": sess.max_score,
        "status": "completed" if sess.completed_at else "in_progress",
        "answers": [
            {"question_text": qt, "chosen_option_text": ot,
             "is_answer_correct": bool(ic), "chosen_option_number": on,
             "qtype": qt2}
            for qt, ot, ic, on, qt2 in rows
        ],
        "show_correctness": bool(sess.completed_at),
    }
