from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.core.config import get_settings

_BCRYPT_MAX_LEN = 72

def _truncate(plain: str) -> bytes:
    return plain.encode("utf-8")[:_BCRYPT_MAX_LEN]


def hash_password(plain: str) -> str:
    settings = get_settings()
    salt = bcrypt.gensalt(rounds=settings.bcrypt_rounds)
    return bcrypt.hashpw(_truncate(plain), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_truncate(plain), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(subject: str, role: str, jti: str | None = None, sid: str | None = None) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_expire_minutes)).timestamp()),
    }
    if jti:
        payload["jti"] = jti
    if sid:
        payload["sid"] = sid
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as e:
        raise ValueError(f"invalid token: {e}") from e
