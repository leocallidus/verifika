"""Unified audit trail helpers for critical domain mutations."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Mapping, Optional

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditLog, TeacherAuditLog


def client_ip(request: Request | None) -> Optional[str]:
    if request is None:
        return None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return None


def safe_json(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, Mapping):
        return {str(k): safe_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [safe_json(v) for v in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def target_label(target_type: Optional[str], target_id: Optional[int]) -> Optional[str]:
    if not target_type:
        return None
    if target_id is None:
        return target_type
    return f"{target_type}:{target_id}"


async def record_audit(
    session: AsyncSession,
    *,
    actor_role: Optional[str],
    actor_id: Optional[int],
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[int] = None,
    target: Optional[str] = None,
    ip_addr: Optional[str] = None,
    reason: Optional[str] = None,
    before: Optional[Mapping[str, Any]] = None,
    after: Optional[Mapping[str, Any]] = None,
    metadata: Optional[Mapping[str, Any]] = None,
    mirror_teacher_id: Optional[int] = None,
) -> tuple[AuditLog, TeacherAuditLog | None]:
    before_json = safe_json(before)
    after_json = safe_json(after)
    metadata_json = safe_json(metadata)
    audit = AuditLog(
        actor_role=actor_role,
        actor_id=actor_id,
        action=action,
        target=target or target_label(target_type, target_id),
        target_type=target_type,
        target_id=target_id,
        ip_addr=ip_addr,
        reason=reason,
        before_json=before_json,
        after_json=after_json,
        metadata_json=metadata_json,
    )
    session.add(audit)

    teacher_row: TeacherAuditLog | None = None
    if mirror_teacher_id is not None:
        teacher_row = TeacherAuditLog(
            teacher_id=mirror_teacher_id,
            action=action,
            target_type=target_type or "unknown",
            target_id=target_id,
            before=before_json,
            after=after_json,
            ip_addr=ip_addr,
        )
        session.add(teacher_row)

    await session.flush()
    return audit, teacher_row
