from __future__ import annotations

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

from loguru import logger

from app.core.config import get_settings


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _new_token() -> str:
    return secrets.token_urlsafe(32)


async def deliver_reset_link(email: str, link: str) -> str:
    """Доставляет magic-link. Возвращает способ доставки ('smtp' | 'dev-fallback').

    Если SMTP_* заданы в .env — пытаемся использовать aiosmtplib (в факультативном виде) или
    падаем в dev-fallback.
    """
    settings = get_settings()
    if settings.smtp_host and settings.smtp_user and settings.smtp_pass:
        try:
            import aiosmtplib  # type: ignore
            msg = (
                f"From: {settings.smtp_user}\r\n"
                f"To: {email}\r\n"
                f"Subject: Сброс пароля\r\n"
                f"Content-Type: text/plain; charset=utf-8\r\n\r\n"
                f"Перейдите по ссылке для сброса пароля: {link}\n"
                f"Ссылка действительна {settings.reset_link_ttl // 60} минут."
            )
            await aiosmtplib.send(
                msg.encode("utf-8"),
                hostname=settings.smtp_host,
                port=settings.smtp_port,
                username=settings.smtp_user,
                password=settings.smtp_pass,
                use_tls=False,
            )
            logger.info(f"reset email sent to {email}")
            return "smtp"
        except Exception as e:
            logger.warning(f"smtp delivery failed: {e}; falling back to dev-fallback")
    out_dir = Path("/tmp/sts-reset-fallback")
    out_dir.mkdir(parents=True, exist_ok=True)
    fname = out_dir / f"{email.replace('@', '_at_')}.txt"
    fname.write_text(link, encoding="utf-8")
    logger.info(f"reset fallback link written to {fname}")
    return "dev-fallback"


def make_token_pair() -> tuple[str, str]:
    token = _new_token()
    return token, _hash_token(token)


def verify_token(plain: str, expected_hash: str) -> bool:
    return secrets.compare_digest(_hash_token(plain), expected_hash)


def expires_at_default(ttl_seconds: int | None = None) -> datetime:
    settings = get_settings()
    return datetime.now(timezone.utc) + timedelta(seconds=(ttl_seconds or settings.reset_link_ttl))
