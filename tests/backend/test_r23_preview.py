from __future__ import annotations

import pytest
from uuid import uuid4

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def login(client, identifier: str, password: str = "Passw0rd!Test") -> str:
    r = await client.post("/api/auth/login", json={"identifier": identifier, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


async def test_teacher_test_preview_and_grading(client):
    h = {"Authorization": f"Bearer {await login(client, 'sidorov')}"}

    # 1. Fetch teacher disciplines
    r_disc = await client.get("/api/teacher/disciplines", headers=h)
    assert r_disc.status_code == 200, r_disc.text
    disc_list = r_disc.json()["disciplines"]
    assert len(disc_list) > 0, "Teacher must have at least one discipline"
    disc_id = disc_list[0]["discipline_id"]

    # 2. Create a topic under the discipline
    topic_name = f"Preview Test Topic {uuid4().hex[:8]}"
    r_topic = await client.post(
        f"/api/v2/teacher/disciplines/{disc_id}/topics",
        json={"name": topic_name},
        headers=h
    )
    assert r_topic.status_code == 201, r_topic.text
    topic = r_topic.json()
    topic_id = topic["topic_id"]

    # 3. Create a question in the topic
    r_q = await client.post(
        "/api/teacher/questions",
        json={
            "discipline_id": disc_id,
            "topic_id": topic_id,
            "text": "Preview test question text",
            "difficulty": 3,
            "options": [
                {"option_number": 1, "text": "Correct Option", "is_correct": True},
                {"option_number": 2, "text": "Incorrect Option 1", "is_correct": False},
                {"option_number": 3, "text": "Incorrect Option 2", "is_correct": False},
                {"option_number": 4, "text": "Incorrect Option 3", "is_correct": False},
            ],
        },
        headers=h
    )
    assert r_q.status_code == 201, r_q.text
    q = r_q.json()
    q_id = q["question_id"]

    # 4. Fetch topic test preview
    r_topic_preview = await client.get(f"/api/v2/teacher/topics/{topic_id}/preview", headers=h)
    assert r_topic_preview.status_code == 200, r_topic_preview.text
    topic_preview = r_topic_preview.json()
    assert topic_preview["session_id"] == -1
    assert len(topic_preview["questions"]) > 0
    assert topic_preview["questions"][0]["question_id"] == q_id

    # 5. Fetch discipline test preview
    r_disc_preview = await client.get(f"/api/v2/teacher/disciplines/{disc_id}/preview", headers=h)
    assert r_disc_preview.status_code == 200, r_disc_preview.text
    disc_preview = r_disc_preview.json()
    assert disc_preview["session_id"] == -1
    assert len(disc_preview["questions"]) > 0

    # 6. Grade the preview using preview-grade endpoint
    # Find options of the question in the preview
    preview_q = next(item for item in topic_preview["questions"] if item["question_id"] == q_id)
    preview_opt = preview_q["options"][0]

    grade_payload = {
        "topic_id": topic_id,
        "question_ids": [q_id],
        "answers": [
            {
                "question_id": q_id,
                "chosen_option_id": preview_opt["option_id"]
            }
        ]
    }

    r_grade = await client.post("/api/v2/teacher/test/preview-grade", json=grade_payload, headers=h)
    assert r_grade.status_code == 200, r_grade.text
    grade_res = r_grade.json()

    assert grade_res["session_id"] == -1
    assert grade_res["topic_id"] == topic_id
    assert len(grade_res["answers"]) == 1
    assert grade_res["answers"][0]["question_id"] == q_id
    assert "score" in grade_res
    assert "max_score" in grade_res
    assert grade_res["show_correctness"] is True
