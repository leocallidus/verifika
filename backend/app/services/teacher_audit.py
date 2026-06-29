"""TZ tz-teacher-production-ready.md § 3.9 — сервис аудита действий преподавателя."""
from __future__ import annotations

from typing import Any, Mapping, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import TeacherAuditLog
from app.services.audit_trail import record_audit


async def audit(
    session: AsyncSession,
    *,
    teacher_id: int,
    action: str,
    target_type: str,
    target_id: Optional[int] = None,
    before: Optional[Mapping[str, Any]] = None,
    after: Optional[Mapping[str, Any]] = None,
    ip_addr: Optional[str] = None,
) -> TeacherAuditLog:
    _audit, row = await record_audit(
        session,
        actor_role="teacher",
        actor_id=teacher_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        before=before,
        after=after,
        ip_addr=ip_addr,
        mirror_teacher_id=teacher_id,
    )
    assert row is not None
    return row


async def list_for_teacher(
    session: AsyncSession,
    *,
    teacher_id: int,
    limit: int = 50,
    offset: int = 0,
    action: Optional[str] = None,
) -> tuple[list[TeacherAuditLog], int]:
    """Список аудита конкретного преподавателя (новые сверху)."""
    stmt = select(TeacherAuditLog).where(TeacherAuditLog.teacher_id == teacher_id)
    cnt_stmt = select(func.count()).select_from(TeacherAuditLog).where(
        TeacherAuditLog.teacher_id == teacher_id
    )
    if action:
        stmt = stmt.where(TeacherAuditLog.action == action)
        cnt_stmt = cnt_stmt.where(TeacherAuditLog.action == action)
    rows = (await session.execute(
        stmt.order_by(TeacherAuditLog.created_at.desc()).offset(offset).limit(limit)
    )).scalars().all()
    total = int((await session.execute(cnt_stmt)).scalar_one() or 0)
    return list(rows), total
