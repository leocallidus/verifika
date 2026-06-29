"""TZ tz-teacher-production-ready.md — endpoints преподавателя: профиль,
изменение пароля, центр уведомлений, дашборд, поиск, аудит.

Все эндпоинты привязаны к роли `teacher` через `require_teacher`."""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone
from typing import AsyncIterator, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import case, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, require_teacher
from app.core.rate_limit import change_password_limiter
from app.core.security import decode_token, hash_password, verify_password
from app.db.models import (
    AnswerComment,
    AttemptsPolicy,
    AuditLog,
    Discipline,
    DisciplineTopic,
    Group,
    Notification,
    Question,
    Student,
    Teacher,
    TeacherAuditLog,
    TeacherDiscipline,
    TeacherGroup,
    TeacherTopicTest,
    TestSession,
    UserCredential,
)
from app.db.session import get_session
from app.notifications.bus import bus
from app.schemas.teacher import (
    TeacherActiveSessionToday,
    TeacherAuditItemOut,
    TeacherAuditOut,
    TeacherChangePasswordIn,
    TeacherDashboardOut,
    TeacherDashboardStats,
    TeacherDeadlineToday,
    TeacherNewCommentToday,
    TeacherNotificationOut,
    TeacherNotificationsOut,
    TeacherProfileOut,
    TeacherProfileStats,
    TeacherProfileTeacher,
    TeacherSearchItemOut,
    TeacherSearchOut,
    TeacherTodayOut,
)
from app.services import teacher_audit

router = APIRouter(prefix="/api/teacher", tags=["teacher-features"])


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _sse(data: str, event: str | None = None) -> bytes:
    parts: list[str] = []
    if event:
        parts.append(f"event: {event}")
    parts.append(f"data: {data}")
    parts.append("")
    parts.append("")
    return "\n".join(parts).encode("utf-8")


def _teacher_discipline_ids_subq(teacher_id: int):
    return select(TeacherDiscipline.discipline_id).where(
        TeacherDiscipline.teacher_id == teacher_id
    )


async def _audit_row_as_view(row: TeacherAuditLog) -> TeacherAuditItemOut:
    return TeacherAuditItemOut(
        audit_id=row.audit_id,
        action=row.action,
        target_type=row.target_type,
        target_id=row.target_id,
        before=row.before,
        after=row.after,
        created_at=row.created_at,
    )


async def _notification_view_teacher(n: Notification) -> TeacherNotificationOut:
    payload = n.payload or {}
    title = payload.get("title") or {
        "student_attempt_finished": "Сессия студента завершена",
        "student_attempt_started": "Студент начал тест",
        "student_topic_attempt_started": "Студент начал тематический тест",
        "grading_override": "Оценка изменена",
        "comment_added": "Новый комментарий",
        "discipline_assigned": "Назначение на дисциплину",
        "discipline_revoked": "Отзыв с дисциплины",
        "student_start_problem": "Проблема старта теста",
        "attempts_exhausted": "У студента исчерпаны попытки",
        "student_complaint": "Жалоба студента",
        "ai_generation_failed": "Сбой генерации ИИ",
        "proctor_violation": "Нарушение прокторинга",
    }.get(n.event_type, "Событие")
    body = payload.get("body") or payload.get("summary")
    return TeacherNotificationOut(
        notification_id=int(n.notification_id),
        type=n.event_type,
        title=title,
        body=body,
        is_read=n.read_at is not None,
        created_at=n.created_at,
        link=payload.get("link"),
        meta=payload.get("meta") or payload or {},
    )


# ============================================================================
#  § 3.1 Профиль преподавателя
# ============================================================================
@router.get("/profile", response_model=TeacherProfileOut)
async def teacher_profile(
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> TeacherProfileOut:
    teacher = (await session.execute(
        select(Teacher).where(Teacher.teacher_id == user.id)
    )).scalar_one_or_none()
    if teacher is None:
        raise HTTPException(status_code=404, detail="teacher not found")

    full_name = " ".join(
        [teacher.last_name or "", teacher.first_name or "", teacher.middle_name or ""]
    ).strip()

    discipline_ids = [
        int(d_id) for d_id in (await session.execute(
            _teacher_discipline_ids_subq(user.id)
        )).scalars().all()
    ]

    group_pairs = (await session.execute(
        select(TeacherGroup.group_id, Group.name)
        .join(Group, Group.group_id == TeacherGroup.group_id)
        .where(TeacherGroup.teacher_id == user.id)
    )).all()
    group_ids = [int(g) for g, _ in group_pairs]
    group_names = [name for _, name in group_pairs]

    # Students count: студенты в группах преподавателя + все студенты его дисциплин (legacy: без явной M-N).
    students_count = 0
    if group_ids:
        students_count = int((await session.execute(
            select(func.count()).select_from(Student).where(Student.group_id.in_(group_ids))
        )).scalar_one() or 0)

    questions_count = 0
    if discipline_ids:
        questions_count = int((await session.execute(
            select(func.count()).select_from(Question).where(
                Question.discipline_id.in_(discipline_ids),
                Question.discipline_id.isnot(None),
            )
        )).scalar_one() or 0)

    completed_last_30d = 0
    active_now = 0
    if discipline_ids:
        d_subq = select(TestSession.discipline_id).where(
            TestSession.discipline_id.in_(discipline_ids)
        )
        completed_last_30d = int((await session.execute(
            select(func.count()).select_from(TestSession).where(
                TestSession.discipline_id.in_(discipline_ids),
                TestSession.completed_at.isnot(None),
                TestSession.completed_at >= _now_utc() - timedelta(days=30),
            )
        )).scalar_one() or 0)
        active_now = int((await session.execute(
            select(func.count()).select_from(TestSession).where(
                TestSession.discipline_id.in_(discipline_ids),
                TestSession.completed_at.is_(None),
            )
        )).scalar_one() or 0)

    return TeacherProfileOut(
        teacher=TeacherProfileTeacher(
            teacher_id=teacher.teacher_id,
            full_name=full_name,
            email=teacher.email,
            login=teacher.login,
            department=teacher.department,
            group_ids=group_ids,
            group_names=group_names,
            discipline_ids=discipline_ids,
        ),
        stats=TeacherProfileStats(
            disciplines_count=len(discipline_ids),
            students_count=students_count,
            questions_count=questions_count,
            completed_sessions_last_30d=completed_last_30d,
            active_sessions_now=active_now,
        ),
    )


# ============================================================================
#  § 3.3 / 5.1.7 — Смена пароля преподавателя
# ============================================================================
@router.post("/change-password", dependencies=[Depends(change_password_limiter)])
async def teacher_change_password(
    payload: TeacherChangePasswordIn,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    new_password = payload.new_password
    if (
        len(new_password) < 8
        or not any(c.isupper() for c in new_password)
        or not any(c.isdigit() for c in new_password)
    ):
        raise HTTPException(
            status_code=422,
            detail="Пароль должен быть не короче 8 символов, содержать заглавную букву и цифру",
        )
    cred = (await session.execute(
        select(UserCredential).where(
            UserCredential.role == "teacher",
            UserCredential.user_id == user.id,
        )
    )).scalar_one_or_none()
    if cred is None or not verify_password(payload.current_password, cred.password_hash):
        raise HTTPException(status_code=403, detail="Неверный текущий пароль")
    cred.password_hash = hash_password(new_password)
    await teacher_audit.audit(
        session,
        teacher_id=user.id,
        action="teacher_password_changed",
        target_type="teacher",
        target_id=user.id,
    )
    await session.commit()
    return {"success": True, "message": "Пароль изменён"}


# ============================================================================
#  § 3.3 / 5.1.3 — Центр уведомлений преподавателя
# ============================================================================
@router.get("/notifications", response_model=TeacherNotificationsOut)
async def teacher_notifications(
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    is_read: Optional[bool] = None,
    type: Optional[str] = None,
) -> TeacherNotificationsOut:
    base = select(Notification).where(
        Notification.user_role == "teacher",
        Notification.user_id == user.id,
    )
    cnt = select(func.count()).select_from(Notification).where(
        Notification.user_role == "teacher",
        Notification.user_id == user.id,
    )
    if is_read is not None:
        if is_read:
            base = base.where(Notification.read_at.isnot(None))
            cnt = cnt.where(Notification.read_at.isnot(None))
        else:
            base = base.where(Notification.read_at.is_(None))
            cnt = cnt.where(Notification.read_at.is_(None))
    if type:
        base = base.where(Notification.event_type == type)
        cnt = cnt.where(Notification.event_type == type)
    rows = (await session.execute(
        base.order_by(Notification.created_at.desc()).offset(offset).limit(limit)
    )).scalars().all()
    total = int((await session.execute(cnt)).scalar_one() or 0)
    unread = int((await session.execute(
        select(func.count()).select_from(Notification).where(
            Notification.user_role == "teacher",
            Notification.user_id == user.id,
            Notification.read_at.is_(None),
        )
    )).scalar_one() or 0)
    return TeacherNotificationsOut(
        items=[await _notification_view_teacher(n) for n in rows],
        total=total,
        unread_count=unread,
    )


@router.post("/notifications/{notification_id}/read")
async def teacher_notification_read(
    notification_id: int,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    n = (await session.execute(
        select(Notification).where(Notification.notification_id == notification_id)
    )).scalar_one_or_none()
    if n is None or n.user_role != "teacher" or n.user_id != user.id:
        return {"ok": True}
    if n.read_at is None:
        n.read_at = _now_utc()
        await session.commit()
    return {"ok": True}


@router.post("/notifications/read-all")
async def teacher_notifications_read_all(
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    rows = (await session.execute(
        select(Notification).where(
            Notification.user_role == "teacher",
            Notification.user_id == user.id,
            Notification.read_at.is_(None),
        )
    )).scalars().all()
    now = _now_utc()
    for n in rows:
        n.read_at = now
    await session.commit()
    return {"ok": True, "read": len(rows)}


@router.get("/notifications/stream")
async def teacher_notifications_stream(
    request: Request,
    token: Optional[str] = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    raw_token = token
    if raw_token is None:
        auth = request.headers.get("authorization")
        if auth and auth.lower().startswith("bearer "):
            raw_token = auth.split(" ", 1)[1]
    if not raw_token:
        raise HTTPException(status_code=401, detail="missing auth")
    try:
        payload = decode_token(raw_token)
        if payload.get("role") != "teacher":
            raise ValueError("role")
        teacher_row = (await session.execute(
            select(Teacher).where(Teacher.teacher_id == int(payload["sub"]))
        )).scalar_one_or_none()
        if teacher_row is None:
            raise ValueError("teacher")
        user = CurrentUser(
            id=teacher_row.teacher_id,
            email=teacher_row.email,
            role="teacher",
            full_name=" ".join(
                [teacher_row.last_name or "", teacher_row.first_name or ""]
            ).strip(),
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail="invalid auth") from e

    q = bus.subscribe("teacher", user.id)

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
            bus.unsubscribe("teacher", user.id, q)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ============================================================================
#  § 3.2 / 5.1.4 — Дашборд преподавателя
# ============================================================================
_RANGE_DAYS = {"7d": 7, "30d": 30, "90d": 90, "all": 365 * 5}


async def _build_today(
    session: AsyncSession,
    teacher_id: int,
    discipline_ids: list[int],
) -> TeacherTodayOut:
    """Считает виджеты «Сегодня»: активные сессии, дедлайны, новые комментарии."""
    if not discipline_ids:
        return TeacherTodayOut()

    # Активные сессии (в данный момент проходят студенты преподавателя).
    active_rows = (await session.execute(
        select(TestSession, Student, Discipline.name, DisciplineTopic.name)
        .join(Student, Student.student_id == TestSession.student_id)
        .join(Discipline, Discipline.discipline_id == TestSession.discipline_id)
        .outerjoin(DisciplineTopic, DisciplineTopic.topic_id == TestSession.topic_id)
        .where(
            TestSession.discipline_id.in_(discipline_ids),
            TestSession.completed_at.is_(None),
        )
        .order_by(TestSession.started_at.desc())
        .limit(20)
    )).all()

    active_today: list = []
    for sess, stud, dname, tname in active_rows:
        answered = int((await session.execute(
            select(func.count()).select_from(text("student_answers")).where(
                text("student_answers.session_id = :sid").bindparams(sid=sess.session_id)
            )
        )).scalar_one() or 0)
        started = _aware(sess.started_at) or _now_utc()
        # Лимит берём по теме или дисциплине.
        if sess.topic_id is not None:
            ttest = (await session.execute(
                select(TeacherTopicTest).where(
                    TeacherTopicTest.topic_id == sess.topic_id,
                    TeacherTopicTest.teacher_id == teacher_id,
                )
            )).scalar_one_or_none()
            ttl = ttest.time_limit_minutes if ttest else 30
        else:
            ttd = (await session.execute(
                select(TeacherDiscipline).where(
                    TeacherDiscipline.discipline_id == sess.discipline_id,
                    TeacherDiscipline.teacher_id == teacher_id,
                )
            )).scalar_one_or_none()
            ttl = ttd.time_limit_minutes if ttd else 30
        expires_at = started + timedelta(minutes=ttl)
        active_today.append(
            _build_active(sess, stud, dname, tname, answered, started, expires_at)
        )

    # Дедлайны: темы в ближайшие 48 ч с available_until + overdue.
    now = _now_utc()
    horizon = now + timedelta(hours=48)
    deadline_rows = (await session.execute(
        select(TeacherTopicTest, DisciplineTopic, Discipline.name)
        .join(DisciplineTopic, DisciplineTopic.topic_id == TeacherTopicTest.topic_id)
        .join(Discipline, Discipline.discipline_id == DisciplineTopic.discipline_id)
        .where(
            TeacherTopicTest.teacher_id == teacher_id,
            TeacherTopicTest.is_enabled.is_(True),
            TeacherTopicTest.available_until.isnot(None),
            DisciplineTopic.archived_at.is_(None),
            or_(
                TeacherTopicTest.available_until >= now,
                TeacherTopicTest.available_until < now,
            ),
        )
        .order_by(TeacherTopicTest.available_until.asc())
        .limit(12)
    )).all()
    deadlines: list = []
    for test, topic, dname in deadline_rows:
        try:
            attempts_overdue = int((await session.execute(
                select(func.count(func.distinct(TestSession.student_id))).where(
                    TestSession.topic_id == topic.topic_id,
                    TestSession.completed_at.isnot(None),
                )
            )).scalar_one() or 0)
        except Exception:
            attempts_overdue = 0
        if test and test.available_until:
            deadlines.append(
                TeacherDeadlineToday(
                    topic_id=topic.topic_id,
                    topic_name=topic.name,
                    discipline_name=dname,
                    available_until=_aware(test.available_until),
                    attempts_overdue_for=attempts_overdue,
                    attempts_left=max(0, test.attempts_allowed - attempts_overdue),
                )
            )
        if len(deadlines) >= 5:
            break

    # Новые комментарии преподавателя к сессиям его дисциплин за 24 ч.
    cid = list(discipline_ids)
    new_comments: list = []
    if cid:
        c_rows = (await session.execute(
            select(AnswerComment, Question.text, TestSession, Student)
            .join(TestSession, TestSession.session_id == AnswerComment.session_id)
            .join(Question, Question.question_id == AnswerComment.question_id)
            .join(Student, Student.student_id == TestSession.student_id)
            .where(
                TestSession.discipline_id.in_(cid),
                AnswerComment.created_at >= now - timedelta(hours=24),
            )
            .order_by(AnswerComment.created_at.desc())
            .limit(8)
        )).all()
        for c, qtext, sess, stud in c_rows:
            new_comments.append(
                TeacherNewCommentToday(
                    session_id=sess.session_id,
                    student_id=stud.student_id,
                    student_name=" ".join(
                        [stud.last_name or "", stud.first_name or ""]
                    ).strip(),
                    question_id=qtext and c.question_id or c.question_id,
                    question_text=str(qtext or "")[:200],
                    comment=c.body,
                    created_at=c.created_at,
                )
            )

    return TeacherTodayOut(
        active_sessions=active_today,
        deadlines=deadlines,
        new_comments=new_comments,
    )


def _build_active(sess, stud, dname, tname, answered, started, expires_at) -> TeacherActiveSessionToday:
    student_name = " ".join(
        [stud.last_name or "", stud.first_name or "", stud.middle_name or ""]
    ).strip()
    return TeacherActiveSessionToday(
        session_id=sess.session_id,
        student_id=stud.student_id,
        student_name=student_name,
        discipline_name=dname,
        topic_name=tname,
        started_at=started,
        expires_at=expires_at,
        answered_count=answered,
        total_count=sess.max_score or 0,
    )


@router.get("/dashboard", response_model=TeacherDashboardOut)
async def teacher_dashboard(
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
    range: str = Query(default="30d"),
    discipline_id: Optional[int] = None,
) -> TeacherDashboardOut:
    if range not in _RANGE_DAYS:
        raise HTTPException(status_code=400, detail="invalid range")

    if discipline_id is not None:
        # Преподаватель должен быть связан с этой дисциплиной.
        is_mine = (await session.execute(
            select(func.count()).select_from(TeacherDiscipline).where(
                TeacherDiscipline.teacher_id == user.id,
                TeacherDiscipline.discipline_id == discipline_id,
            )
        )).scalar_one() or 0
        if not is_mine:
            raise HTTPException(status_code=403, detail="discipline not assigned")
        discipline_ids = [discipline_id]
    else:
        discipline_ids = [int(d) for d in (await session.execute(
            _teacher_discipline_ids_subq(user.id)
        )).scalars().all()]

    today = await _build_today(session, user.id, discipline_ids)
    range_days = _RANGE_DAYS[range]
    from_dt = _now_utc() - timedelta(days=range_days)

    completed = 0
    avg = None
    active_now = 0
    if discipline_ids:
        completed = int((await session.execute(
            select(func.count()).select_from(TestSession).where(
                TestSession.discipline_id.in_(discipline_ids),
                TestSession.completed_at.isnot(None),
                TestSession.completed_at >= from_dt,
                TestSession.max_score > 0,
            )
        )).scalar_one() or 0)
        avg_row = (await session.execute(
            select(func.avg((TestSession.score * 100.0) / func.nullif(TestSession.max_score, 0))).where(
                TestSession.discipline_id.in_(discipline_ids),
                TestSession.completed_at.isnot(None),
                TestSession.completed_at >= from_dt,
                TestSession.max_score > 0,
            )
        )).scalar_one()
        avg = round(float(avg_row), 1) if avg_row is not None else None
        active_now = len(today.active_sessions)

    questions_count = 0
    if discipline_ids:
        questions_count = int((await session.execute(
            select(func.count()).select_from(Question).where(
                Question.discipline_id.in_(discipline_ids),
            )
        )).scalar_one() or 0)

    teacher = (await session.execute(
        select(Teacher).where(Teacher.teacher_id == user.id)
    )).scalar_one()
    full_name = " ".join(
        [teacher.last_name or "", teacher.first_name or "", teacher.middle_name or ""]
    ).strip()
    unread = int((await session.execute(
        select(func.count()).select_from(Notification).where(
            Notification.user_role == "teacher",
            Notification.user_id == user.id,
            Notification.read_at.is_(None),
        )
    )).scalar_one() or 0)

    return TeacherDashboardOut(
        teacher_id=user.id,
        full_name=full_name,
        range=range,
        discipline_id=discipline_id,
        stats=TeacherDashboardStats(
            disciplines_count=len(discipline_ids),
            students_count=0,  # опционально, см. profile
            questions_count=questions_count,
            active_sessions_now=active_now,
            completed_sessions_last_30d=completed,
            avg_overall_percent=avg,
        ),
        today=today,
        unread_notifications_count=unread,
    )


# ============================================================================
#  § 3.4 / 5.1.5 — Глобальный поиск
# ============================================================================
@router.get("/search", response_model=TeacherSearchOut)
async def teacher_search(
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
    q: str = Query(default="", min_length=0, max_length=200),
    kinds: str = Query(default="disciplines,groups,students,questions,topics"),
    limit: int = Query(default=20, ge=1, le=50),
) -> TeacherSearchOut:
    """Глобальный поиск преподавателя по сущностям (только по своим)."""
    needle = (q or "").strip()
    items: list[TeacherSearchItemOut] = []
    selected = {k.strip() for k in kinds.split(",") if k.strip()}

    discipline_ids = [int(d) for d in (await session.execute(
        _teacher_discipline_ids_subq(user.id)
    )).scalars().all()]
    group_ids = [int(g) for g in (await session.execute(
        select(TeacherGroup.group_id).where(TeacherGroup.teacher_id == user.id)
    )).scalars().all()]

    # Disciplines
    if "disciplines" in selected and discipline_ids:
        st = select(Discipline.discipline_id, Discipline.name).where(
            Discipline.discipline_id.in_(discipline_ids)
        )
        if needle:
            st = st.where(or_(
                func.lower(Discipline.name).like(f"%{needle.lower()}%"),
                func.lower(func.coalesce(Discipline.description, "")).like(f"%{needle.lower()}%"),
            ))
        rows = (await session.execute(st.order_by(Discipline.name).limit(limit))).all()
        for d_id, name in rows:
            items.append(TeacherSearchItemOut(
                kind="discipline", id=int(d_id), label=name,
                href="/teacher/reference/disciplines", hint="Дисциплина",
            ))

    # Groups
    if "groups" in selected:
        st = select(Group.group_id, Group.name)
        grp_filter = []
        if group_ids:
            grp_filter.append(Group.group_id.in_(group_ids))
        # Legacy fallback: groups.student через дисциплины преподавателя.
        if discipline_ids:
            grp_filter.append(
                select(Student.group_id).where(
                    Student.group_id.isnot(None),
                    Student.student_id.in_(
                        select(TestSession.student_id).where(
                            TestSession.discipline_id.in_(discipline_ids)
                        )
                    )
                ).exists()
            )
        # Студенты в группах, имеющих отношение к дисциплинам преподавателя:
        if grp_filter:
            st = st.where(*grp_filter)
        if needle:
            st = st.where(func.lower(Group.name).like(f"%{needle.lower()}%"))
        rows = (await session.execute(st.order_by(Group.name).limit(limit))).all()
        for g_id, name in rows:
            items.append(TeacherSearchItemOut(
                kind="group", id=int(g_id), label=name,
                href=f"/teacher/reference/groups/{g_id}", hint="Группа",
            ))

    # Students
    if "students" in selected:
        st = select(Student.student_id, Student.last_name, Student.first_name, Student.middle_name, Student.login, Student.email)
        wheres = []
        if group_ids:
            wheres.append(Student.group_id.in_(group_ids))
        wheres.append(
            Student.student_id.in_(
                select(TestSession.student_id).where(
                    TestSession.discipline_id.in_(discipline_ids) if discipline_ids else TestSession.discipline_id == -1
                )
            )
        )
        st = st.where(*wheres)
        if needle:
            low = needle.lower()
            st = st.where(or_(
                func.lower(Student.last_name).like(f"%{low}%"),
                func.lower(Student.first_name).like(f"%{low}%"),
                func.lower(func.coalesce(Student.middle_name, "")).like(f"%{low}%"),
                func.lower(func.coalesce(Student.login, "")).like(f"%{low}%"),
                func.lower(Student.email).like(f"%{low}%"),
            ))
        rows = (await session.execute(st.order_by(Student.last_name).limit(limit))).all()
        for s_id, lname, fname, mname, login, email in rows:
            label = " ".join([lname or "", fname or ""]).strip()
            items.append(TeacherSearchItemOut(
                kind="student", id=int(s_id), label=label or login or email,
                href=f"/teacher/students/{s_id}",
                hint=f"логин: {login or '—'}, email: {email or '—'}",
            ))

    # Topics
    if "topics" in selected and discipline_ids:
        st = select(DisciplineTopic.topic_id, DisciplineTopic.name, DisciplineTopic.discipline_id, Discipline.name).join(
            Discipline, Discipline.discipline_id == DisciplineTopic.discipline_id
        ).where(
            DisciplineTopic.discipline_id.in_(discipline_ids),
            DisciplineTopic.archived_at.is_(None),
        )
        if needle:
            st = st.where(func.lower(DisciplineTopic.name).like(f"%{needle.lower()}%"))
        rows = (await session.execute(st.order_by(DisciplineTopic.name).limit(limit))).all()
        for t_id, t_name, d_id, d_name in rows:
            items.append(TeacherSearchItemOut(
                kind="topic", id=int(t_id), label=t_name,
                href=f"/teacher/policy/{d_id}",
                hint=f"Дисциплина: {d_name}",
            ))

    # Questions
    if "questions" in selected and discipline_ids:
        st = select(Question.question_id, Question.text, Question.discipline_id).where(
            Question.discipline_id.in_(discipline_ids),
            Question.discipline_id.isnot(None),
        )
        if needle:
            st = st.where(func.lower(Question.text).like(f"%{needle.lower()}%"))
        rows = (await session.execute(st.order_by(Question.question_id.desc()).limit(limit))).all()
        for q_id, qtext, d_id in rows:
            short = (qtext or "").strip().split("\n")[0][:120]
            items.append(TeacherSearchItemOut(
                kind="question", id=int(q_id), label=short,
                href=f"/teacher/bank?disc={d_id}&q={q_id}",
                hint=f"#{q_id}",
            ))

    return TeacherSearchOut(items=items, total=len(items))


# ============================================================================
#  § 3.9 / 5.1.6 — Аудит действий преподавателя
# ============================================================================
@router.get("/audit", response_model=TeacherAuditOut)
async def teacher_audit_list(
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    action: Optional[str] = None,
):
    rows, total = await teacher_audit.list_for_teacher(
        session, teacher_id=user.id, limit=limit, offset=offset, action=action,
    )
    return TeacherAuditOut(
        items=[await _audit_row_as_view(r) for r in rows],
        total=total,
    )
