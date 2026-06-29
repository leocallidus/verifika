from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditLog, Notification
from app.notifications.bus import bus


async def record_audit(
    session: AsyncSession,
    actor_role: Optional[str], actor_id: Optional[int],
    action: str, target: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> None:
    log = AuditLog(
        actor_role=actor_role, actor_id=actor_id,
        action=action, target=target,
        metadata_json=metadata,
    )
    session.add(log)
    await session.flush()


async def record_event(
    session: AsyncSession, event_type: str,
    target: Optional[str] = None, metadata: Optional[dict] = None,
) -> None:
    log = AuditLog(action=event_type, target=target, metadata_json=metadata)
    session.add(log)
    await session.flush()


async def store_and_publish(
    session: AsyncSession,
    user_role: str, user_id: int,
    event_type: str, payload: Optional[dict] = None,
    *,
    severity: int = 0,
    channel: str = "user",
    metadata: Optional[dict] = None,
) -> None:
    """Persist a per-user notification and deliver it to that user's SSE queue.

    For role-wide broadcasts (e.g. to all admins), pass user_id=0 and use
    store_and_broadcast instead.
    """
    n = Notification(
        user_role=user_role, user_id=user_id,
        event_type=event_type, payload=payload,
        severity=severity, channel=channel, metadata=metadata,
    )
    session.add(n)
    await session.flush()
    await bus.publish(user_role, user_id, {
        "notification_id": n.notification_id,
        "event_type": event_type,
        "payload": payload or {},
        "metadata": metadata or {},
        "severity": severity,
        "created_at": (n.created_at or datetime.now(timezone.utc)).isoformat(),
    })


async def store_and_broadcast(
    session: AsyncSession,
    recipient_role: str,
    event_type: str,
    payload: Optional[dict] = None,
    *,
    severity: int = 0,
    metadata: Optional[dict] = None,
) -> None:
    """Persist a role-broadcast notification and deliver via role-subscribers."""
    n = Notification(
        user_role=recipient_role, user_id=0,
        event_type=event_type, payload=payload,
        severity=severity,
        channel="admin" if recipient_role == "admin" else "user",
        recipient_role=recipient_role,
        metadata=metadata,
    )
    session.add(n)
    await session.flush()
    await bus.publish_broadcast(recipient_role, {
        "notification_id": n.notification_id,
        "event_type": event_type,
        "payload": payload or {},
        "metadata": metadata or {},
        "severity": severity,
        "created_at": (n.created_at or datetime.now(timezone.utc)).isoformat(),
    })
