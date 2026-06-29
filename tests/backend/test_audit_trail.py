from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import desc, select

from app.db.models import AuditLog
from app.db.session import SessionLocal

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def login(client, identifier: str, password: str = "Passw0rd!Test") -> str:
    r = await client.post("/api/auth/login", json={"identifier": identifier, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


async def latest_audit(action: str, target_type: str, target_id: int | None = None) -> AuditLog | None:
    async with SessionLocal() as session:
        stmt = select(AuditLog).where(
            AuditLog.action == action,
            AuditLog.target_type == target_type,
        )
        if target_id is not None:
            stmt = stmt.where(AuditLog.target_id == target_id)
        return (await session.execute(
            stmt.order_by(desc(AuditLog.created_at)).limit(1)
        )).scalar_one_or_none()


async def test_teacher_topic_policy_question_and_attempts_are_audited(client):
    teacher_token = await login(client, "sidorov")
    student_token = await login(client, "petrova")
    th = {"Authorization": f"Bearer {teacher_token}"}
    sh = {"Authorization": f"Bearer {student_token}"}

    topic_name = f"Аудит R05 {uuid4().hex[:8]}"
    topic_resp = await client.post(
        "/api/v2/teacher/disciplines/1/topics",
        json={"name": topic_name, "description": "audit", "sort_order": 55},
        headers=th,
    )
    assert topic_resp.status_code == 201, topic_resp.text
    topic_id = topic_resp.json()["topic_id"]

    policy_resp = await client.put(
        "/api/v2/teacher/policy/1",
        json={
            "available_from": None,
            "available_until": None,
            "attempts_allowed": 3,
            "shuffle_seed": True,
            "show_correct_after_finish": True,
            "proctor_min_level": 0,
        },
        headers=th,
    )
    assert policy_resp.status_code == 200, policy_resp.text

    question_resp = await client.post(
        "/api/teacher/questions",
        json={
            "discipline_id": 1,
            "topic_id": topic_id,
            "text": f"Контрольный вопрос R05 {uuid4().hex[:6]}",
            "difficulty": 1,
            "qtype": "single",
            "options": [
                {"option_number": 1, "text": "Верно", "is_correct": True},
                {"option_number": 2, "text": "Неверно", "is_correct": False},
                {"option_number": 3, "text": "Не знаю", "is_correct": False},
                {"option_number": 4, "text": "Пропустить", "is_correct": False},
            ],
            "tag_ids": [],
        },
        headers=th,
    )
    assert question_resp.status_code == 201, question_resp.text
    question_id = question_resp.json()["question_id"]

    test_resp = await client.put(
        f"/api/v2/teacher/topics/{topic_id}/test",
        json={
            "is_enabled": True,
            "question_count": 1,
            "time_limit_minutes": 20,
            "attempts_allowed": 2,
            "available_from": None,
            "available_until": None,
            "shuffle_seed": True,
            "show_correct_after_finish": True,
            "passing_score_percent": None,
            "grading_method": "best",
            "show_question_points": True,
            "attempt_delay_minutes": None,
            "grade_scale": "5_point",
        },
        headers=th,
    )
    assert test_resp.status_code == 200, test_resp.text

    started = await client.post(f"/api/student/topics/{topic_id}/tests/start", headers=sh)
    assert started.status_code == 201, started.text
    session_id = started.json()["session_id"]

    finished = await client.post(f"/api/student/sessions/{session_id}/finish", headers=sh)
    assert finished.status_code == 200, finished.text

    teacher_audit = await client.get("/api/teacher/audit?limit=50", headers=th)
    assert teacher_audit.status_code == 200, teacher_audit.text
    actions = [item["action"] for item in teacher_audit.json()["items"]]
    assert "topic_created" in actions
    assert "policy_updated" in actions or "policy_created" in actions
    assert "question_created" in actions
    assert "topic_test_created" in actions
    assert "student_topic_attempt_started" in actions
    assert "student_attempt_finished" in actions

    topic_audit = await latest_audit("topic_created", "topic", topic_id)
    assert topic_audit is not None
    assert topic_audit.actor_role == "teacher"
    assert topic_audit.actor_id == 1
    assert topic_audit.after_json["name"] == topic_name

    question_audit = await latest_audit("question_created", "question", question_id)
    assert question_audit is not None
    assert question_audit.actor_role == "teacher"

    start_audit = await latest_audit("student_topic_attempt_started", "session", session_id)
    assert start_audit is not None
    assert start_audit.actor_role == "student"
    assert start_audit.after_json["topic_id"] == topic_id

    finish_audit = await latest_audit("student_attempt_finished", "session", session_id)
    assert finish_audit is not None
    assert finish_audit.actor_role == "student"
    assert finish_audit.after_json["score"] is not None
