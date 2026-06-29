from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import Request
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser
from app.db.models import Admin, AuditLog, Notification


from app.services.audit_trail import safe_json


async def admin_audit(
    session: AsyncSession,
    actor: CurrentUser,
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[int] = None,
    target_label: Optional[str] = None,
    ip_addr: Optional[str] = None,
    reason: Optional[str] = None,
    before: Optional[dict] = None,
    after: Optional[dict] = None,
    metadata: Optional[dict] = None,
) -> None:
    """Persist an AuditLog row for an admin-initiated mutation."""
    log = AuditLog(
        actor_role="admin",
        actor_id=actor.id,
        action=action,
        target=target_label,
        target_type=target_type,
        target_id=target_id,
        ip_addr=ip_addr,
        reason=reason,
        before_json=safe_json(before),
        after_json=safe_json(after),
        metadata_json=safe_json(metadata),
    )
    session.add(log)
    await session.flush()


def client_ip(request: Request) -> Optional[str]:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return None


async def admin_broadcast_event(
    session: AsyncSession,
    *,
    event_type: str,
    payload: Optional[dict] = None,
    metadata: Optional[dict] = None,
    severity: int = 0,
    actor_id: Optional[int] = None,
) -> int:
    """Insert an admin-channel broadcast notification; deliver via SSE bus."""
    from app.notifications.bus import bus  # local import: avoid cycle
    n = Notification(
        user_role="admin", user_id=0,
        event_type=event_type,
        payload=payload,
        recipient_role="admin",
        channel="admin",
        severity=severity,
        metadata=metadata,
    )
    session.add(n)
    await session.flush()
    await bus.publish_broadcast(
        "admin",
        {
            "notification_id": n.notification_id,
            "event_type": event_type,
            "payload": payload or {},
            "metadata": metadata or {},
            "severity": severity,
            "actor_id": actor_id,
            "created_at": (n.created_at or datetime.now(timezone.utc)).isoformat(),
        },
    )
    logger.debug("admin event broadcast: {} sev={} meta={}", event_type, severity, metadata)
    return n.notification_id


def is_last_admin(session: AsyncSession, exclude_admin_id: Optional[int] = None) -> bool:
    """Sync helper to ask: 'is this admin about to be demoted the last one?'"""
    raise NotImplementedError("Async caller -- use _count_admins")


async def count_active_admins(session: AsyncSession, exclude_id: Optional[int] = None) -> int:
    from sqlalchemy import func, select
    q = select(func.count()).select_from(Admin).where(Admin.archived_at.is_(None))
    if exclude_id is not None:
        q = q.where(Admin.admin_id != exclude_id)
    return int((await session.execute(q)).scalar_one() or 0)
