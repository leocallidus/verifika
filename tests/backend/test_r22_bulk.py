from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def login(client, identifier: str, password: str = "Passw0rd!Test") -> str:
    r = await client.post("/api/auth/login", json={"identifier": identifier, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


async def test_r22_bulk_difficulty_and_tags(client):
    h = {"Authorization": f"Bearer {await login(client, 'sidorov')}"}
    
    # 1. Create Question 1 (difficulty 1)
    r1 = await client.post(
        "/api/teacher/questions",
        json={
            "discipline_id": 1,
            "text": "Bulk test question number one",
            "difficulty": 1,
            "options": [
                {"option_number": 1, "text": "correct option", "is_correct": True},
                {"option_number": 2, "text": "incorrect option 1", "is_correct": False},
                {"option_number": 3, "text": "incorrect option 2", "is_correct": False},
                {"option_number": 4, "text": "incorrect option 3", "is_correct": False},
            ],
        },
        headers=h,
    )
    assert r1.status_code == 201
    q1 = r1.json()

    # 2. Create Question 2 (difficulty 2)
    r2 = await client.post(
        "/api/teacher/questions",
        json={
            "discipline_id": 1,
            "text": "Bulk test question number two",
            "difficulty": 2,
            "options": [
                {"option_number": 1, "text": "correct option", "is_correct": True},
                {"option_number": 2, "text": "incorrect option 1", "is_correct": False},
                {"option_number": 3, "text": "incorrect option 2", "is_correct": False},
                {"option_number": 4, "text": "incorrect option 3", "is_correct": False},
            ],
        },
        headers=h,
    )
    assert r2.status_code == 201
    q2 = r2.json()

    q_ids = [q1["question_id"], q2["question_id"]]

    # 3. Bulk change difficulty to 4
    r_diff = await client.post(
        "/api/v2/teacher/questions/bulk-difficulty",
        json={"question_ids": q_ids, "difficulty": 4},
        headers=h,
    )
    assert r_diff.status_code == 200
    assert r_diff.json() == {"ok": True, "count": 2}

    # Verify difficulty is updated to 4
    r_qs = await client.get("/api/v2/teacher/questions?discipline_id=1", headers=h)
    assert r_qs.status_code == 200
    qs_map = {q["question_id"]: q for q in r_qs.json()}
    assert qs_map[q1["question_id"]]["difficulty"] == 4
    assert qs_map[q2["question_id"]]["difficulty"] == 4

    # 4. Bulk add tags
    r_tags = await client.post(
        "/api/v2/teacher/questions/bulk-tags",
        json={"question_ids": q_ids, "tags": ["bulk-tag-1", "bulk-tag-2"]},
        headers=h,
    )
    assert r_tags.status_code == 200
    assert r_tags.json() == {"ok": True, "count": 2}

    # Verify tags are added
    r_qs_updated = await client.get("/api/v2/teacher/questions?discipline_id=1", headers=h)
    assert r_qs_updated.status_code == 200
    qs_map_updated = {q["question_id"]: q for q in r_qs_updated.json()}
    
    assert "bulk-tag-1" in qs_map_updated[q1["question_id"]]["tags"]
    assert "bulk-tag-2" in qs_map_updated[q1["question_id"]]["tags"]
    assert "bulk-tag-1" in qs_map_updated[q2["question_id"]]["tags"]
    assert "bulk-tag-2" in qs_map_updated[q2["question_id"]]["tags"]
