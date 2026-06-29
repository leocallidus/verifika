from __future__ import annotations

import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from threading import Lock
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import CurrentUser, get_current_user, oauth2, _get_active_avatar_url
from app.core.security import create_access_token, verify_password, decode_token
from app.db.models import Admin, Student, Teacher, UserCredential, AuthSession
from app.db.session import get_session
from app.schemas.auth import LoginRequest, LoginResponse, UserOut
from app.services.audit_trail import client_ip, record_audit

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ---------- login rate-limit (per IP) --------------------------------------
_RATE_WINDOW_SEC = 5 * 60
_RATE_MAX_FAILS = 5
_failed_attempts: dict[str, list[float]] = defaultdict(list)
_rate_lock = Lock()


def _is_email(s: str) -> bool:
    """Грубая эвристика: содержит '@' и точку — email; иначе считаем логином."""
    return "@" in s and "." in s.split("@", 1)[1] if "@" in s else False


def _check_rate_limit(ip: str) -> None:
    now = time.time()
    with _rate_lock:
        history = [t for t in _failed_attempts[ip] if now - t < _RATE_WINDOW_SEC]
        if len(history) >= _RATE_MAX_FAILS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="too many failed login attempts; try again later",
            )


def _record_failed_login(ip: str) -> None:
    now = time.time()
    with _rate_lock:
        history = [t for t in _failed_attempts[ip] if now - t < _RATE_WINDOW_SEC]
        history.append(now)
        _failed_attempts[ip] = history


async def _fetch_role_row(session: AsyncSession, role: str, user_id: int):
    if role == "student":
        return (await session.execute(
            select(Student).where(Student.student_id == user_id)
        )).scalar_one_or_none()
    if role == "teacher":
        return (await session.execute(
            select(Teacher).where(Teacher.teacher_id == user_id)
        )).scalar_one_or_none()
    return (await session.execute(
        select(Admin).where(Admin.admin_id == user_id)
    )).scalar_one_or_none()


async def _authenticate(
    session: AsyncSession,
    raw: str,
    password: str,
    request: Request,
    client_info: ClientInfo | None = None,
) -> tuple[str, str, CurrentUser]:
    by_email = _is_email(raw)
    ip = request.client.host if request.client else "?"
    _check_rate_limit(ip)
    email_norm = raw.lower() if by_email else None
    login_norm = raw.lower()

    candidate_role: str | None = None
    candidate_id: int | None = None

    if by_email:
        for role, model, id_attr in [
            ("student", Student, "student_id"),
            ("teacher", Teacher, "teacher_id"),
            ("admin", Admin, "admin_id"),
        ]:
            row = (await session.execute(
                select(model).where(model.email == email_norm)
            )).scalar_one_or_none()
            if row is not None:
                candidate_role = role
                candidate_id = getattr(row, id_attr)
                break
    else:
        for role, model, login_attr, id_attr in [
            ("student", Student, Student.login, "student_id"),
            ("teacher", Teacher, Teacher.login, "teacher_id"),
            ("admin", Admin, Admin.login, "admin_id"),
        ]:
            row = (await session.execute(
                select(model).where(login_attr == login_norm)
            )).scalar_one_or_none()
            if row is not None:
                candidate_role = role
                candidate_id = getattr(row, id_attr)
                break

    if candidate_role is None or candidate_id is None:
        _record_failed_login(ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid credentials",
        )

    cred = (await session.execute(
        select(UserCredential).where(
            UserCredential.role == candidate_role,
            UserCredential.user_id == candidate_id,
        )
    )).scalar_one_or_none()
    if cred is None or not verify_password(password, cred.password_hash):
        _record_failed_login(ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid credentials",
        )

    row = await _fetch_role_row(session, candidate_role, candidate_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid credentials",
        )
    if getattr(row, "archived_at", None) is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="user archived",
        )

    session_id = uuid.uuid4()
    jti = uuid.uuid4()

    os_name = "Unknown"
    browser_name = "Unknown"
    client_kind = "web"
    device_name = None
    os_version = None
    browser_version = None
    app_version = None
    locale = None
    timezone_str = None

    if client_info:
        client_kind = client_info.client_kind
        device_name = client_info.device_name
        os_name = client_info.os_name or os_name
        os_version = client_info.os_version
        browser_name = client_info.browser_name or browser_name
        browser_version = client_info.browser_version
        app_version = client_info.app_version
        locale = client_info.locale
        timezone_str = client_info.timezone

    user_agent = request.headers.get("User-Agent")
    if user_agent:
        ua_lower = user_agent.lower()
        if "windows" in ua_lower:
            os_name = "Windows"
        elif "macintosh" in ua_lower or "mac os" in ua_lower:
            os_name = "macOS"
        elif "android" in ua_lower:
            os_name = "Android"
        elif "iphone" in ua_lower or "ipad" in ua_lower:
            os_name = "iOS"
        elif "linux" in ua_lower:
            os_name = "Linux"

        if "chrome" in ua_lower or "chromium" in ua_lower:
            browser_name = "Chrome"
        elif "safari" in ua_lower:
            browser_name = "Safari"
        elif "firefox" in ua_lower:
            browser_name = "Firefox"
        elif "edge" in ua_lower:
            browser_name = "Edge"

    now = datetime.now(timezone.utc)
    settings = get_settings()
    expires_at = now + timedelta(minutes=settings.jwt_expire_minutes)

    auth_sess = AuthSession(
        auth_session_id=session_id,
        user_role=candidate_role,
        user_id=candidate_id,
        token_jti=jti,
        created_at=now,
        last_seen_at=now,
        expires_at=expires_at,
        ip_addr=ip,
        user_agent=user_agent,
        device_name=device_name,
        client_kind=client_kind,
        os_name=os_name,
        os_version=os_version,
        browser_name=browser_name,
        browser_version=browser_version,
        app_version=app_version,
        locale=locale,
        timezone=timezone_str,
        geo_country="Не определено",
        geo_region="Не определено",
        geo_city="Не определено",
    )
    session.add(auth_sess)
    await session.flush()

    token = create_access_token(subject=str(candidate_id), role=candidate_role, jti=str(jti), sid=str(session_id))
    avatar_url = await _get_active_avatar_url(session, candidate_role, candidate_id)

    if candidate_role == "student":
        return token, str(session_id), CurrentUser(
            id=row.student_id,
            email=row.email,
            role="student",
            full_name=f"{row.last_name} {row.first_name} {row.middle_name or ''}".strip(),
            group_id=row.group_id,
            avatar_url=avatar_url,
        )
    if candidate_role == "teacher":
        return token, str(session_id), CurrentUser(
            id=row.teacher_id,
            email=row.email,
            role="teacher",
            full_name=f"{row.last_name} {row.first_name} {row.middle_name or ''}".strip(),
            avatar_url=avatar_url,
        )
    return token, str(session_id), CurrentUser(
        id=row.admin_id,
        email=row.email,
        role="admin",
        full_name=f"{row.last_name} {row.first_name} {row.middle_name or ''}".strip(),
        avatar_url=avatar_url,
    )


@router.post("/login", response_model=LoginResponse)
async def login(
    data: LoginRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> LoginResponse:
    try:
        token, session_id, user = await _authenticate(
            session, data.identifier, data.password, request, client_info=data.client_info
        )
    except HTTPException as exc:
        if exc.status_code in {
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
            status.HTTP_429_TOO_MANY_REQUESTS,
        }:
            await record_audit(
                session,
                actor_role=None,
                actor_id=None,
                action="auth_login_failed",
                target_type="auth",
                ip_addr=client_ip(request),
                metadata={
                    "identifier": (data.identifier or "").strip().lower(),
                    "status_code": exc.status_code,
                },
            )
            await session.commit()
        raise
    user_login = None
    if user.role == "student":
        row = (
            await session.execute(
                select(Student.login).where(Student.student_id == user.id)
            )
        ).scalar_one_or_none()
        user_login = row
    elif user.role == "teacher":
        row = (
            await session.execute(
                select(Teacher.login).where(Teacher.teacher_id == user.id)
            )
        ).scalar_one_or_none()
        user_login = row
    elif user.role == "admin":
        row = (
            await session.execute(
                select(Admin.login).where(Admin.admin_id == user.id)
            )
        ).scalar_one_or_none()
        user_login = row
    await record_audit(
        session,
        actor_role=user.role,
        actor_id=user.id,
        action="auth_login",
        target_type=user.role,
        target_id=user.id,
        ip_addr=client_ip(request),
        metadata={"identifier": (data.identifier or "").strip().lower()},
    )
    await session.commit()
    return LoginResponse(
        access_token=token,
        auth_session_id=session_id,
        user=UserOut(
            id=user.id,
            full_name=user.full_name,
            role=user.role,
            email=user.email,
            group_id=user.group_id,
            login=user_login,
            avatar_url=user.avatar_url,
        ),
    )


@router.get("/me", response_model=UserOut)
async def me(
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    user_login = None
    if user.role == "student":
        row = (
            await session.execute(
                select(Student.login).where(Student.student_id == user.id)
            )
        ).scalar_one_or_none()
        user_login = row
    elif user.role == "teacher":
        row = (
            await session.execute(
                select(Teacher.login).where(Teacher.teacher_id == user.id)
            )
        ).scalar_one_or_none()
        user_login = row
    elif user.role == "admin":
        row = (
            await session.execute(
                select(Admin.login).where(Admin.admin_id == user.id)
            )
        ).scalar_one_or_none()
        user_login = row
    return UserOut(
        id=user.id,
        full_name=user.full_name,
        role=user.role,
        email=user.email,
        group_id=user.group_id,
        login=user_login,
        avatar_url=user.avatar_url,
    )


@router.post("/logout")
async def logout(
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    token: str = Depends(oauth2),
):
    payload = decode_token(token)
    sid = payload.get("sid")
    if sid:
        res = await session.execute(
            select(AuthSession).where(AuthSession.auth_session_id == sid)
        )
        db_sess = res.scalar_one_or_none()
        if db_sess:
            db_sess.revoked_at = datetime.now(timezone.utc)
            db_sess.revoked_reason = "logout"
            session.add(db_sess)
            await record_audit(
                session,
                actor_role=user.role,
                actor_id=user.id,
                action="auth_session_revoked",
                target_type="auth_session",
                target_id=None,
                metadata={"session_id": sid},
            )
            await session.commit()
    return {"success": True}
