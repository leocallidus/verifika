from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from sqlalchemy import exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    AuditLog,
    Discipline,
    DisciplineTopic,
    GroupDiscipline,
    Notification,
    Student,
    StudentDiscipline,
    TeacherDiscipline,
    TestSession,
)

ActivitySource = Literal["audit", "notification", "session"]


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _score_percent(score: int | float | None, max_score: int | float | None) -> float | None:
    if score is None or not max_score:
        return None
    return round(float(score) * 100.0 / float(max_score), 1)


def _audit_title(action: str) -> str:
    return {
        "auth_login": "Вход в систему",
        "auth_login_failed": "Неудачная попытка входа",
        "student_password_changed": "Смена пароля",
        "student_attempt_started": "Старт теста",
        "student_topic_attempt_started": "Старт тематического теста",
        "student_attempt_finished": "Завершение теста",
    }.get(action, action.replace("_", " "))


def _audit_category(action: str) -> str:
    if action.startswith("auth_login"):
        return "auth"
    if "password" in action:
        return "security"
    if "attempt" in action:
        return "test"
    return "audit"


def _notification_title(event_type: str, payload: dict[str, Any]) -> str:
    return str(payload.get("title") or {
        "test_available": "Тест доступен",
        "deadline_approaching": "Приближается дедлайн",
        "test_graded": "Тест оценён",
        "comment_added": "Комментарий преподавателя",
    }.get(event_type, "Уведомление"))


async def teacher_can_view_student_activity(
    session: AsyncSession,
    *,
    teacher_id: int,
    student_id: int,
) -> bool:
    row = (await session.execute(
        select(Student.student_id).where(Student.student_id == student_id)
    )).scalar_one_or_none()
    if row is None:
        return False

    visible = (await session.execute(
        select(
            exists().where(
                TestSession.student_id == student_id,
                TestSession.teacher_id == teacher_id,
                TestSession.discipline_id.in_(
                    select(TeacherDiscipline.discipline_id).where(
                        TeacherDiscipline.teacher_id == teacher_id
                    )
                ),
            )
        )
    )).scalar_one()
    if visible:
        return True

    assigned_to_teacher_discipline = (await session.execute(
        select(
            exists().where(
                TeacherDiscipline.teacher_id == teacher_id,
                or_(
                    exists(
                        select(1)
                        .select_from(Student)
                        .join(GroupDiscipline, GroupDiscipline.group_id == Student.group_id)
                        .where(
                            Student.student_id == student_id,
                            Student.archived_at.is_(None),
                            GroupDiscipline.discipline_id == TeacherDiscipline.discipline_id,
                        )
                    ),
                    exists(
                        select(1)
                        .select_from(StudentDiscipline)
                        .where(
                            StudentDiscipline.student_id == student_id,
                            StudentDiscipline.discipline_id == TeacherDiscipline.discipline_id,
                        )
                    ),
                ),
            )
        )
    )).scalar_one()
    return bool(assigned_to_teacher_discipline)


async def build_student_activity(
    session: AsyncSession,
    *,
    student_id: int,
    limit: int = 50,
    offset: int = 0,
    source: ActivitySource | None = None,
) -> tuple[list[dict[str, Any]], int]:
    entries: list[dict[str, Any]] = []

    if source in (None, "audit"):
        audit_rows = (await session.execute(
            select(AuditLog)
            .where(
                or_(
                    (AuditLog.actor_role == "student") & (AuditLog.actor_id == student_id),
                    (AuditLog.target_type == "student") & (AuditLog.target_id == student_id),
                )
            )
            .order_by(AuditLog.created_at.desc())
            .limit(max(limit + offset, 100))
        )).scalars().all()
        for row in audit_rows:
            after = _as_dict(row.after_json)
            meta = _as_dict(row.metadata_json)
            details = {**meta, **after}
            title = _audit_title(row.action)
            body = None
            if row.action == "student_attempt_finished":
                pct = _score_percent(after.get("score"), after.get("max_score"))
                body = f"Результат: {after.get('score', 0)} из {after.get('max_score', 0)}" + (f" ({pct}%)" if pct is not None else "")
            elif row.action in {"student_attempt_started", "student_topic_attempt_started"}:
                body = f"Попытка #{after.get('attempt_no', '—')}"
            elif row.action == "auth_login_failed":
                body = "Доступ не предоставлен"
            entries.append({
                "id": f"audit:{row.log_id}",
                "source": "audit",
                "category": _audit_category(row.action),
                "type": row.action,
                "title": title,
                "body": body,
                "created_at": row.created_at,
                "target_type": row.target_type,
                "target_id": int(row.target_id) if row.target_id is not None else None,
                "session_id": int(after.get("session_id") or row.target_id) if (after.get("session_id") or row.target_type == "session") and (after.get("session_id") or row.target_id) is not None else None,
                "discipline_id": int(after["discipline_id"]) if after.get("discipline_id") is not None else None,
                "topic_id": int(after["topic_id"]) if after.get("topic_id") is not None else None,
                "ip_addr": str(row.ip_addr) if row.ip_addr is not None else None,
                "is_read": None,
                "severity": 0,
                "details": details,
            })

    if source in (None, "notification"):
        notification_rows = (await session.execute(
            select(Notification)
            .where(Notification.user_role == "student", Notification.user_id == student_id)
            .order_by(Notification.created_at.desc())
            .limit(max(limit + offset, 100))
        )).scalars().all()
        for row in notification_rows:
            payload = _as_dict(row.payload)
            meta = _as_dict(payload.get("meta"))
            entries.append({
                "id": f"notification:{row.notification_id}",
                "source": "notification",
                "category": "notification",
                "type": row.event_type,
                "title": _notification_title(row.event_type, payload),
                "body": payload.get("body") or payload.get("summary"),
                "created_at": row.created_at,
                "target_type": "notification",
                "target_id": int(row.notification_id),
                "session_id": int(meta["session_id"]) if meta.get("session_id") is not None else None,
                "discipline_id": int(meta["discipline_id"]) if meta.get("discipline_id") is not None else None,
                "topic_id": int(meta["topic_id"]) if meta.get("topic_id") is not None else None,
                "ip_addr": None,
                "is_read": row.read_at is not None,
                "severity": int(row.severity or 0),
                "details": payload,
            })

    if source in (None, "session"):
        session_rows = (await session.execute(
            select(TestSession, Discipline.name, DisciplineTopic.name)
            .join(Discipline, Discipline.discipline_id == TestSession.discipline_id)
            .outerjoin(DisciplineTopic, DisciplineTopic.topic_id == TestSession.topic_id)
            .where(TestSession.student_id == student_id)
            .order_by(TestSession.started_at.desc())
            .limit(max(limit + offset, 100))
        )).all()
        for sess, discipline_name, topic_name in session_rows:
            common = {
                "target_type": "session",
                "target_id": int(sess.session_id),
                "session_id": int(sess.session_id),
                "discipline_id": int(sess.discipline_id),
                "topic_id": int(sess.topic_id) if sess.topic_id is not None else None,
                "ip_addr": None,
                "is_read": None,
                "severity": 0,
            }
            title = "Старт тематического теста" if sess.topic_id is not None else "Старт теста"
            entries.append({
                "id": f"session-start:{sess.session_id}",
                "source": "session",
                "category": "test",
                "type": "session_started",
                "title": title,
                "body": f"{discipline_name}" + (f" — {topic_name}" if topic_name else ""),
                "created_at": sess.started_at,
                "details": {
                    "attempt_no": sess.attempt_no,
                    "discipline_name": discipline_name,
                    "topic_name": topic_name,
                },
                **common,
            })
            if sess.completed_at is not None:
                pct = _score_percent(sess.score, sess.max_score)
                entries.append({
                    "id": f"session-finish:{sess.session_id}",
                    "source": "session",
                    "category": "test",
                    "type": "session_finished",
                    "title": "Завершение теста",
                    "body": f"{sess.score or 0} из {sess.max_score or 0}" + (f" ({pct}%)" if pct is not None else ""),
                    "created_at": sess.completed_at,
                    "details": {
                        "attempt_no": sess.attempt_no,
                        "score": sess.score,
                        "max_score": sess.max_score,
                        "percent": pct,
                        "discipline_name": discipline_name,
                        "topic_name": topic_name,
                    },
                    **common,
                })

    entries.sort(key=lambda item: item["created_at"] or datetime.min, reverse=True)

    audit_session_keys: set[tuple[str, int | None]] = set()
    for item in entries:
        if item["source"] != "audit":
            continue
        if item["type"] in {
            "student_attempt_started",
            "student_topic_attempt_started",
            "student_attempt_finished",
        }:
            audit_session_keys.add((item["type"], item.get("session_id")))

    # Use TestSession rows only as historical fallback when the audit row is absent.
    seen: set[tuple[str, int | None, datetime | None]] = set()
    deduped: list[dict[str, Any]] = []
    for item in entries:
        kind = item["type"]
        if kind == "session_started":
            kind = "student_topic_attempt_started" if item.get("topic_id") else "student_attempt_started"
        elif kind == "session_finished":
            kind = "student_attempt_finished"
        if item["source"] == "session" and (kind, item.get("session_id")) in audit_session_keys:
            continue
        key = (kind, item.get("session_id"), item.get("created_at"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    total = len(deduped)
    return deduped[offset: offset + limit], total


async def student_activity_summary(
    session: AsyncSession,
    *,
    student_id: int,
) -> dict[str, int]:
    audit_count = int((await session.execute(
        select(func.count()).select_from(AuditLog).where(
            AuditLog.actor_role == "student",
            AuditLog.actor_id == student_id,
        )
    )).scalar_one() or 0)
    notification_count = int((await session.execute(
        select(func.count()).select_from(Notification).where(
            Notification.user_role == "student",
            Notification.user_id == student_id,
        )
    )).scalar_one() or 0)
    session_count = int((await session.execute(
        select(func.count()).select_from(TestSession).where(
            TestSession.student_id == student_id,
        )
    )).scalar_one() or 0)
    return {
        "audit_count": audit_count,
        "notification_count": notification_count,
        "session_count": session_count,
    }
