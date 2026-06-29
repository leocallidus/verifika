from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user
from app.core.rate_limit import change_password_limiter
from app.core.security import hash_password, verify_password
from app.db.models import PasswordResetToken, Student, Teacher, UserCredential
from app.db.session import get_session
from app.schemas.v2 import (
    ResetConfirmIn, ResetConfirmOut, ResetRequestIn, ResetRequestOut,
)
from app.services.mailer import deliver_reset_link, expires_at_default, make_token_pair, verify_token

router = APIRouter(prefix="/auth", tags=["v2.reset"])


async def _find_user(session: AsyncSession, email: str) -> tuple[str, int] | None:
    s = (await session.execute(select(Student).where(Student.email == email.lower()))).scalar_one_or_none()
    if s is not None:
        return ("student", s.student_id)
    t = (await session.execute(select(Teacher).where(Teacher.email == email.lower()))).scalar_one_or_none()
    if t is not None:
        return ("teacher", t.teacher_id)
    return None


@router.post("/reset/request", response_model=ResetRequestOut)
async def reset_request(payload: ResetRequestIn, session: AsyncSession = Depends(get_session)) -> ResetRequestOut:
    user = await _find_user(session, payload.email)
    if user is None:
        raise HTTPException(status_code=404, detail="email not found")
    role, user_id = user
    token, token_hash = make_token_pair()
    sess_row = PasswordResetToken(
        user_role=role, user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at_default(),
    )
    session.add(sess_row)
    await session.commit()
    settings = None
    from app.core.config import get_settings as _gs
    settings = _gs()
    link = f"{settings.public_base_url}/reset?token={token}"
    delivery = await deliver_reset_link(payload.email, link)
    return ResetRequestOut(ok=True, delivery=delivery)


@router.post("/reset/confirm", response_model=ResetConfirmOut)
async def reset_confirm(payload: ResetConfirmIn, session: AsyncSession = Depends(get_session)) -> ResetConfirmOut:
    import hashlib
    token_hash = hashlib.sha256(payload.token.encode("utf-8")).hexdigest()
    row = (await session.execute(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=410, detail="invalid token")
    if row.used_at is not None:
        raise HTTPException(status_code=410, detail="already used")
    if row.expires_at < datetime.utcnow().replace(tzinfo=row.expires_at.tzinfo):
        raise HTTPException(status_code=410, detail="expired")
    cred = (await session.execute(
        select(UserCredential).where(
            UserCredential.role == row.user_role,
            UserCredential.user_id == row.user_id,
        )
    )).scalar_one_or_none()
    new_hash = hash_password(payload.new_password)
    if cred is None:
        session.add(UserCredential(user_role=row.user_role, user_id=row.user_id, password_hash=new_hash))
    else:
        cred.password_hash = new_hash
    row.used_at = datetime.utcnow().replace(tzinfo=row.expires_at.tzinfo)
    await session.commit()
    return ResetConfirmOut(ok=True)


@router.post("/change-password", dependencies=[Depends(change_password_limiter)])
async def change_password(
    payload: dict,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    current_password = str(payload.get("current_password") or "")
    new_password = str(payload.get("new_password") or "")
    if len(new_password) < 8 or not any(c.isupper() for c in new_password) or not any(c.isdigit() for c in new_password):
        raise HTTPException(status_code=422, detail="new password must contain 8 chars, uppercase and digit")
    cred = (await session.execute(
        select(UserCredential).where(UserCredential.role == user.role, UserCredential.user_id == user.id)
    )).scalar_one_or_none()
    if cred is None or not verify_password(current_password, cred.password_hash):
        raise HTTPException(status_code=403, detail="invalid current password")
    cred.password_hash = hash_password(new_password)
    await session.commit()
    return {"success": True, "message": "Пароль изменён"}
