from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import AsyncIterator, Optional

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, select, or_

from app.api.admin import router
from app.api.v2.notifications import _sse
from app.core.deps import CurrentUser
from app.core.security import decode_token
from app.db.models import Admin, Notification
from app.db.session import SessionLocal
from app.notifications.bus import bus


@router.get("/stream")
async def admin_stream(
    request: Request,
    token: Optional[str] = Query(default=None),
    since: Optional[int] = Query(default=None, description="last event_id for backfill"),
):
    """SSE feed for all admin-channel notifications.

    Auth: either Authorization header Bearer or `?token=` query (EventSource can't send headers).
    On connect, replays up to 50 most recent admin-channel events with id > `since`.
    """
    # Auth
    payload: Optional[dict] = None
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        try:
            payload = decode_token(auth_header.split(" ", 1)[1])
        except Exception:
            payload = None
    elif token:
        try:
            payload = decode_token(token)
        except Exception:
            payload = None
    if payload is None or payload.get("role") != "admin":
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="admin token required")
    user_id = int(payload["sub"])

    q = bus.subscribe_role("admin")

    async def gen() -> AsyncIterator[bytes]:
        try:
            yield _sse('{"hello":"connected"}', event="hello")
            # Backfill: return unread admin-channel events since `since`
            try:
                async with SessionLocal() as s:
                    rows = (await s.execute(
                        select(Notification).where(
                            or_(
                                Notification.recipient_role == "admin",
                                Notification.channel == "admin",
                                Notification.user_id == user_id,
                            ),
                            Notification.hidden_admin_id.is_(None),
                            or_(since.is_(None), Notification.notification_id > since) if since is not None
                            else True,
                        ).order_by(desc(Notification.created_at)).limit(50)
                    )).scalars().all()
                    for r in rows:
                        yield _sse(json.dumps({
                            "notification_id": r.notification_id,
                            "event_type": r.event_type,
                            "payload": r.payload or {},
                            "metadata": r.extra_metadata or {},
                            "severity": r.severity or 0,
                            "created_at": (r.created_at or datetime.utcnow()).isoformat(),
                        }, ensure_ascii=False), event=r.event_type)
            except Exception:
                pass
            last_keep = 0
            while True:
                try:
                    evt = await asyncio.wait_for(q.get(), timeout=20)
                    yield _sse(json.dumps(evt, ensure_ascii=False),
                                event=evt.get("event_type", "message"))
                except asyncio.TimeoutError:
                    yield _sse('{"keep":"alive"}', event="ping")
                    last_keep += 1
                if last_keep > 360:
                    break
        finally:
            bus.unsubscribe_role("admin", q)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
