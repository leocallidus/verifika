from __future__ import annotations

import pytest
from sqlalchemy import text
from app.db.session import SessionLocal

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def login(client, identifier: str, password: str = "Passw0rd!Test") -> str:
    response = await client.post(
        "/api/auth/login",
        json={"identifier": identifier, "password": password},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


async def _ensure_admin_credentials() -> str:
    async with SessionLocal() as session:
        admin = (await session.execute(text(
            "SELECT admin_id, login FROM admins ORDER BY admin_id LIMIT 1"
        ))).mappings().first()
        assert admin is not None
        # ensure password is set to Passw0rd!Test
        from app.core.security import hash_password
        pwd = hash_password("Passw0rd!Test")
        await session.execute(text(
            "UPDATE user_credentials SET password_hash = :hash WHERE role = 'admin' AND user_id = :id"
        ), {"hash": pwd, "id": admin["admin_id"]})
        await session.commit()
        return admin["login"]


async def test_admin_docs_env_info_endpoint(client):
    admin_login = await _ensure_admin_credentials()
    token = await login(client, admin_login)
    headers = {"Authorization": f"Bearer {token}"}

    # Hit the docs env-info endpoint
    r = await client.get("/api/admin/docs/env-info", headers=headers)
    assert r.status_code == 200, r.text
    res = r.json()

    # Verify all expected R-35 env-info fields are present
    assert "app_version" in res
    assert "python_version" in res
    assert "database_url_masked" in res
    assert "alembic_revision" in res
    assert "ai_enabled" in res
    assert "ai_base_url" in res
    assert "ai_chat_model" in res
    assert "ai_generation_model" in res
    assert "log_level" in res
    assert "cors_origins" in res
    assert "jwt_expire_minutes" in res
    assert "smtp_configured" in res
    assert "upload_dir" in res
    assert "bcrypt_rounds" in res

    # Verify database_url_masked contains mask
    assert "****" in res["database_url_masked"]
    assert "password" not in res["database_url_masked"]


async def test_admin_docs_env_info_unauthorized(client):
    # Try hitting without auth token
    r = await client.get("/api/admin/docs/env-info")
    assert r.status_code == 401
