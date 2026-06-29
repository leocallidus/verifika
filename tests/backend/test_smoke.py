from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def login(client, identifier: str, password: str = "Passw0rd!Test") -> str:
    r = await client.post("/api/auth/login", json={"identifier": identifier, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


async def test_teacher_login_ok(client):
    r = await client.post("/api/auth/login", json={"identifier": "sidorov", "password": "Passw0rd!Test"})
    assert r.status_code == 200, r.text


async def test_bad_password_401(client):
    r = await client.post("/api/auth/login", json={"identifier": "sidorov", "password": "wrong"})
    assert r.status_code == 401


async def test_no_token_401(client):
    r = await client.get("/api/teacher/disciplines")
    assert r.status_code == 401


async def test_double_start_409(client):
    h = {"Authorization": f"Bearer {await login(client, 'petrova')}"}
    r1 = await client.post("/api/student/tests/1/start", headers=h)
    assert r1.status_code in (201, 409), r1.text
    r2 = await client.post("/api/student/tests/1/start", headers=h)
    assert r2.status_code == 409


async def test_resume_does_not_leak_answers(client):
    h = {"Authorization": f"Bearer {await login(client, 'petrova')}"}
    await client.post("/api/student/tests/1/start", headers=h)
    sessions = (await client.get("/api/student/sessions", headers=h)).json().get("sessions", [])
    active = next((s for s in sessions if s["status"] == "in_progress"), None)
    if active is None:
        pytest.skip("no active session (finished by another test)")
    rr = await client.get(f"/api/student/sessions/{active['session_id']}/resume", headers=h)
    assert rr.status_code == 200
    assert "is_correct" not in rr.text, "leaked answer key"


async def test_student_token_forbidden_on_teacher_route(client):
    h = {"Authorization": f"Bearer {await login(client, 'petrova')}"}
    r = await client.get("/api/teacher/students/1", headers=h)
    assert r.status_code == 403


async def test_teacher_cannot_touch_other_disciplines(client):
    h = {"Authorization": f"Bearer {await login(client, 'sidorov')}"}
    r = await client.post(
        "/api/teacher/questions",
        json={
            "discipline_id": 999, "text": "q", "difficulty": 1,
            "options": [
                {"option_number": 1, "text": "a", "is_correct": True},
                {"option_number": 2, "text": "b", "is_correct": False},
                {"option_number": 3, "text": "c", "is_correct": False},
                {"option_number": 4, "text": "d", "is_correct": False},
            ],
        },
        headers=h,
    )
    assert r.status_code == 403


async def test_duplicate_option_number_rejected(client):
    h = {"Authorization": f"Bearer {await login(client, 'sidorov')}"}
    r = await client.post(
        "/api/teacher/questions",
        json={
            "discipline_id": 1, "text": "q", "difficulty": 1,
            "options": [
                {"option_number": 1, "text": "a", "is_correct": True},
                {"option_number": 1, "text": "b", "is_correct": False},
                {"option_number": 1, "text": "c", "is_correct": False},
                {"option_number": 1, "text": "d", "is_correct": False},
            ],
        },
        headers=h,
    )
    assert r.status_code == 400
