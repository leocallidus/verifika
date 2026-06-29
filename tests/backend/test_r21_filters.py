from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def login(client, identifier: str, password: str = "Passw0rd!Test") -> str:
    r = await client.post("/api/auth/login", json={"identifier": identifier, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


async def test_r21_difficulty_and_ai_status_filters(client):
    h = {"Authorization": f"Bearer {await login(client, 'sidorov')}"}
    
    # 1. Create Question with difficulty=3 (manual)
    r1 = await client.post(
        "/api/teacher/questions",
        json={
            "discipline_id": 1,
            "text": "Filter test question difficulty three",
            "difficulty": 3,
            "options": [
                {"option_number": 1, "text": "correct option", "is_correct": True},
                {"option_number": 2, "text": "incorrect option 1", "is_correct": False},
                {"option_number": 3, "text": "incorrect option 2", "is_correct": False},
                {"option_number": 4, "text": "incorrect option 3", "is_correct": False},
            ],
        },
        headers=h,
    )
    assert r1.status_code == 201, r1.text
    q1 = r1.json()

    # 2. Create Question with difficulty=5 (manual)
    r2 = await client.post(
        "/api/teacher/questions",
        json={
            "discipline_id": 1,
            "text": "Filter test question difficulty five",
            "difficulty": 5,
            "options": [
                {"option_number": 1, "text": "correct option", "is_correct": True},
                {"option_number": 2, "text": "incorrect option 1", "is_correct": False},
                {"option_number": 3, "text": "incorrect option 2", "is_correct": False},
                {"option_number": 4, "text": "incorrect option 3", "is_correct": False},
            ],
        },
        headers=h,
    )
    assert r2.status_code == 201, r2.text
    q2 = r2.json()

    # 3. Query all v2 questions
    r_all = await client.get("/api/v2/teacher/questions?discipline_id=1", headers=h)
    assert r_all.status_code == 200
    all_qs = r_all.json()
    all_ids = {q["question_id"] for q in all_qs}
    assert q1["question_id"] in all_ids
    assert q2["question_id"] in all_ids

    # 4. Filter by difficulty=3
    r_diff3 = await client.get("/api/v2/teacher/questions?discipline_id=1&difficulty=3", headers=h)
    assert r_diff3.status_code == 200
    diff3_qs = r_diff3.json()
    assert len(diff3_qs) > 0
    assert all(q["difficulty"] == 3 for q in diff3_qs)
    assert any(q["question_id"] == q1["question_id"] for q in diff3_qs)
    assert not any(q["question_id"] == q2["question_id"] for q in diff3_qs)

    # 5. Filter by difficulty=5
    r_diff5 = await client.get("/api/v2/teacher/questions?discipline_id=1&difficulty=5", headers=h)
    assert r_diff5.status_code == 200
    diff5_qs = r_diff5.json()
    assert len(diff5_qs) > 0
    assert all(q["difficulty"] == 5 for q in diff5_qs)
    assert any(q["question_id"] == q2["question_id"] for q in diff5_qs)
    assert not any(q["question_id"] == q1["question_id"] for q in diff5_qs)

    # 6. Filter by ai_status=manual
    r_manual = await client.get("/api/v2/teacher/questions?discipline_id=1&ai_status=manual", headers=h)
    assert r_manual.status_code == 200
    manual_qs = r_manual.json()
    # Manual questions should have ai_status as None
    assert all(q["ai_status"] is None for q in manual_qs)
    assert any(q["question_id"] == q1["question_id"] for q in manual_qs)
    assert any(q["question_id"] == q2["question_id"] for q in manual_qs)

    # 7. Filter by ai_status=approved (none of the manually created should match)
    r_approved = await client.get("/api/v2/teacher/questions?discipline_id=1&ai_status=approved", headers=h)
    assert r_approved.status_code == 200
    approved_qs = r_approved.json()
    assert not any(q["question_id"] == q1["question_id"] for q in approved_qs)
    assert not any(q["question_id"] == q2["question_id"] for q in approved_qs)
