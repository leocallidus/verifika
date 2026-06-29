"""TZ tz-teacher-production-ready.md § 8.2 — публикация уведомлений преподавателю."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Notification
from app.services.notifications_helpers import store_and_publish


async def notify_teacher(
    session: AsyncSession,
    teacher_id: int,
    type_: str,
    title: str,
    body: Optional[str] = None,
    link: Optional[str] = None,
    meta: Optional[dict] = None,
    *,
    severity: int = 0,
) -> None:
    """Persist + publish уведомление конкретному преподавателю."""
    if not teacher_id or teacher_id <= 0:
        return
    payload: dict[str, Any] = {"title": title}
    if body is not None:
        payload["body"] = body
    if link is not None:
        payload["link"] = link
    if meta is not None:
        payload["meta"] = meta
    await store_and_publish(
        session,
        user_role="teacher",
        user_id=teacher_id,
        event_type=type_,
        payload=payload,
        severity=severity,
    )


async def notify_teacher_once(
    session: AsyncSession,
    teacher_id: int,
    type_: str,
    title: str,
    body: Optional[str] = None,
    link: Optional[str] = None,
    meta: Optional[dict] = None,
    *,
    severity: int = 0,
    dedupe_key: Optional[str] = None,
    window: timedelta = timedelta(hours=24),
) -> bool:
    """Persist + publish a teacher notification once per dedupe window."""
    if not teacher_id or teacher_id <= 0:
        return False
    if dedupe_key:
        since = datetime.now(timezone.utc) - window
        rows = (await session.execute(
            select(Notification).where(
                Notification.user_role == "teacher",
                Notification.user_id == teacher_id,
                Notification.event_type == type_,
                Notification.created_at >= since,
            )
        )).scalars().all()
        for row in rows:
            payload = row.payload or {}
            row_meta = payload.get("meta") if isinstance(payload, dict) else None
            if isinstance(row_meta, dict) and row_meta.get("dedupe_key") == dedupe_key:
                return False
        meta = {**(meta or {}), "dedupe_key": dedupe_key}

    await notify_teacher(
        session,
        teacher_id,
        type_,
        title,
        body=body,
        link=link,
        meta=meta,
        severity=severity,
    )
    return True
