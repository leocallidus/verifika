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


async def test_admin_health_endpoint(client):
    admin_login = await _ensure_admin_credentials()
    token = await login(client, admin_login)
    headers = {"Authorization": f"Bearer {token}"}

    # Hit the health endpoint
    r = await client.get("/api/admin/health/db", headers=headers)
    assert r.status_code == 200, r.text
    res = r.json()

    # Verify all expected R-24 health fields are present
    assert "db_ok" in res
    assert "db_latency_ms" in res
    assert "sse_connections_count" in res
    assert "ai_enabled" in res
    assert "ai_ok" in res
    assert "ai_latency_ms" in res
    assert "ai_model" in res
    assert "ai_generation_tasks" in res
    assert "api_response_stats" in res
    assert "recent_errors" in res

    # Verify nested shapes
    assert isinstance(res["ai_generation_tasks"], dict)
    assert "processing" in res["ai_generation_tasks"]
    assert "done" in res["ai_generation_tasks"]
    assert "error" in res["ai_generation_tasks"]

    assert isinstance(res["api_response_stats"], dict)
    assert "avg_ms" in res["api_response_stats"]
    assert "min_ms" in res["api_response_stats"]
    assert "max_ms" in res["api_response_stats"]
    assert "count" in res["api_response_stats"]

    assert isinstance(res["recent_errors"], list)
