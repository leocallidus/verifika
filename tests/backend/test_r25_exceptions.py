from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_404_not_found_unified_format(client):
    r = await client.get("/api/non-existent-page-url-12345")
    assert r.status_code == 404
    res = r.json()
    assert res["code"] == "NOT_FOUND"
    assert "message" in res
    assert "reason" in res
    assert "action_hint" in res


async def test_401_unauthorized_unified_format(client):
    r = await client.get("/api/teacher/disciplines")
    assert r.status_code == 401
    res = r.json()
    assert res["code"] == "UNAUTHORIZED"
    assert "message" in res
    assert "reason" in res
    assert "action_hint" in res


async def test_422_validation_error_unified_format(client):
    # invalid request body
    r = await client.post("/api/auth/login", json={"something": "wrong"})
    assert r.status_code == 422
    res = r.json()
    assert res["code"] == "VALIDATION_ERROR"
    assert "message" in res
    assert "reason" in res
    assert "action_hint" in res
