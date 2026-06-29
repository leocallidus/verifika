from __future__ import annotations

from __future__ import annotations

import asyncio
import json
from typing import AsyncIterator, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser
from app.core.security import decode_token
from app.db.models import Notification, Teacher
from app.db.session import get_session
from app.notifications.bus import bus
from app.schemas.v2 import NotificationOut

router = APIRouter(prefix="/notifications", tags=["v2.notifications"])


def _sse(data: str, event: str | None = None) -> bytes:
    parts = []
    if event:
        parts.append(f"event: {event}")
    parts.append(f"data: {data}")
    parts.append("")
    parts.append("")
    return "\n".join(parts).encode("utf-8")


async def _auth_from_query(token: Optional[str]) -> Optional[CurrentUser]:
    if not token:
        return None
    try:
        payload = decode_token(token)
    except Exception:
        return None
    if payload.get("role") != "teacher":
        return None
    user_id = int(payload["sub"])
    async with SessionLocal() as session:
        from app.db.models import Teacher
        t = (await session.execute(select(Teacher).where(Teacher.teacher_id == user_id))).scalar_one_or_none()
        if t is None:
            return None
        return CurrentUser(
            id=t.teacher_id, email=t.email, role="teacher",
            full_name=f"{t.last_name} {t.first_name} {t.middle_name or ''}".strip(),
            login=t.login,
        )


from app.db.session import SessionLocal  # noqa: E402


async def _auth_user(request: Request, token: Optional[str]) -> CurrentUser:
    authed_via_query = await _auth_from_query(token)
    if authed_via_query is not None:
        return authed_via_query
    from app.core.deps import _load_user
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        from app.core.security import decode_token as _dt
        try:
            payload = _dt(auth_header.split(" ", 1)[1])
            from app.db.models import Teacher as _T
            async with SessionLocal() as s:
                t = (await s.execute(select(_T).where(_T.teacher_id == int(payload["sub"])))).scalar_one_or_none()
                if t is not None:
                    return CurrentUser(
                        id=t.teacher_id, email=t.email, role="teacher",
                        full_name=f"{t.last_name} {t.first_name} {t.middle_name or ''}".strip(),
                        login=t.login,
                    )
        except Exception:
            pass
    raise HTTPException(status_code=401, detail="missing or invalid auth")


@router.get("/stream")
async def stream(
    request: Request,
    token: Optional[str] = Query(default=None),
) -> StreamingResponse:
    user = await _auth_user(request, token)
    q = bus.subscribe("teacher", user.id)

    async def gen() -> AsyncIterator[bytes]:
        try:
            yield _sse('{"hello":"connected"}', event="hello")
            last_keep = 0
            while True:
                try:
                    evt = await asyncio.wait_for(q.get(), timeout=20)
                    yield _sse(json.dumps(evt, ensure_ascii=False), event=evt.get("event_type", "message"))
                except asyncio.TimeoutError:
                    yield _sse('{"keep":"alive"}', event="ping")
                    last_keep += 1
                if last_keep > 360:
                    break
        finally:
            bus.unsubscribe("teacher", user.id, q)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("", response_model=list[NotificationOut])
async def list_my(
    request: Request,
    token: Optional[str] = Query(default=None),
    session: AsyncSession = Depends(get_session),
):
    user = await _auth_user(request, token)
    rows = (await session.execute(
        select(Notification).where(
            Notification.user_role == "teacher", Notification.user_id == user.id,
        ).order_by(Notification.created_at.desc()).limit(50)
    )).scalars().all()
    return [
        NotificationOut(
            notification_id=n.notification_id, user_role=n.user_role, user_id=n.user_id,
            event_type=n.event_type, payload=n.payload,
            read_at=n.read_at, created_at=n.created_at,
        ) for n in rows
    ]


@router.post("/{notification_id}/read", status_code=204)
async def mark_read(
    notification_id: int,
    request: Request,
    token: Optional[str] = Query(default=None),
    session: AsyncSession = Depends(get_session),
):
    user = await _auth_user(request, token)
    n = (await session.execute(
        select(Notification).where(Notification.notification_id == notification_id)
    )).scalar_one_or_none()
    if n is None or n.user_id != user.id or n.user_role != "teacher":
        return
    if n.read_at is None:
        from datetime import datetime, timezone
        n.read_at = datetime.now(timezone.utc)
        await session.commit()
    return None
