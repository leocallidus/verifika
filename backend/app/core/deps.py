from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.models import Admin, Student, Teacher
from app.db.session import get_session


@dataclass
class CurrentUser:
    id: int
    email: str
    role: str
    full_name: str
    group_id: Optional[int] = None
    login: Optional[str] = None
    avatar_url: Optional[str] = None


oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


async def _get_active_avatar_url(session: AsyncSession, role: str, user_id: int) -> Optional[str]:
    from app.db.models import UserAvatarImage
    res = await session.execute(
        select(UserAvatarImage.avatar_id).where(
            UserAvatarImage.user_role == role,
            UserAvatarImage.user_id == user_id,
            UserAvatarImage.is_active == True,
            UserAvatarImage.deleted_at.is_(None)
        )
    )
    avatar_id = res.scalar_one_or_none()
    if avatar_id:
        return f"/api/v2/profile-branding/avatars/{avatar_id}"
    return None


async def _load_user(payload: dict, session: AsyncSession) -> CurrentUser:
    role = payload.get("role")
    sub = payload.get("sub")
    if not sub or role not in ("student", "teacher", "admin"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid claims")
    user_id = int(sub)
    avatar_url = await _get_active_avatar_url(session, role, user_id)
    if role == "student":
        res = await session.execute(select(Student).where(Student.student_id == user_id))
        s = res.scalar_one_or_none()
        if not s:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="user not found")
        return CurrentUser(
            id=s.student_id,
            email=s.email,
            role="student",
            full_name=f"{s.last_name} {s.first_name} {s.middle_name or ''}".strip(),
            group_id=s.group_id,
            login=s.login,
            avatar_url=avatar_url,
        )
    if role == "teacher":
        res = await session.execute(select(Teacher).where(Teacher.teacher_id == user_id))
        t = res.scalar_one_or_none()
        if not t:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="user not found")
        return CurrentUser(
            id=t.teacher_id,
            email=t.email,
            role="teacher",
            full_name=f"{t.last_name} {t.first_name} {t.middle_name or ''}".strip(),
            login=t.login,
            avatar_url=avatar_url,
        )
    res = await session.execute(select(Admin).where(Admin.admin_id == user_id))
    a = res.scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="user not found")
    return CurrentUser(
        id=a.admin_id,
        email=a.email,
        role="admin",
        full_name=f"{a.last_name} {a.first_name} {a.middle_name or ''}".strip(),
        login=a.login,
        avatar_url=avatar_url,
    )


async def get_current_user(
    token: Optional[str] = Depends(oauth2),
    session: AsyncSession = Depends(get_session),
) -> CurrentUser:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_token(token)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e)) from e

    jti = payload.get("jti")
    sid = payload.get("sid")
    if not jti or not sid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token session",
        )

    from app.db.models import AuthSession
    from datetime import datetime, timezone

    res = await session.execute(
        select(AuthSession).where(
            AuthSession.auth_session_id == sid,
            AuthSession.token_jti == jti,
            AuthSession.revoked_at.is_(None),
        )
    )
    db_sess = res.scalar_one_or_none()
    if not db_sess:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="session revoked or expired",
        )

    now = datetime.now(timezone.utc)
    if (now - db_sess.last_seen_at).total_seconds() > 60:
        db_sess.last_seen_at = now
        session.add(db_sess)
        await session.commit()

    return await _load_user(payload, session)


def require_role(role: str):
    async def _check(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role != role:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="role not allowed")
        return user
    return _check


require_student = require_role("student")
require_teacher = require_role("teacher")
require_admin = require_role("admin")
