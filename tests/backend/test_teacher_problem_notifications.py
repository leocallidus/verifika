from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import text

from app.api.v2.ai_generation import run_question_generation
from app.core.config import get_settings
from app.core.security import hash_password
from app.schemas.ai import AiGenerationRequest
from app.db.session import SessionLocal


pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _login(client, identifier: str, password: str = "Passw0rd!Test") -> str:
    response = await client.post("/api/auth/login", json={"identifier": identifier, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


async def _teacher_notifications(client, teacher_headers: dict[str, str], type_: str) -> list[dict]:
    response = await client.get(f"/api/teacher/notifications?limit=100&type={type_}", headers=teacher_headers)
    assert response.status_code == 200, response.text
    return response.json()["items"]


async def _create_topic_attempts_fixture(*, attempts_allowed: int = 1) -> tuple[str, int, int, int, int]:
    suffix = uuid4().hex[:10]
    login_name = f"r13_{suffix}"
    now = datetime.now(timezone.utc)
    async with SessionLocal() as session:
        group_id = (await session.execute(text(
            """
            INSERT INTO groups (name, admission_year)
            VALUES (:name, 2026)
            RETURNING group_id
            """
        ), {"name": f"R-13 group {suffix}"})).scalar_one()
        student_id = (await session.execute(text(
            """
            INSERT INTO students (first_name, last_name, email, login, group_id)
            VALUES ('R13', 'Student', :email, :login, :group_id)
            RETURNING student_id
            """
        ), {
            "email": f"{login_name}@example.test",
            "login": login_name,
            "group_id": group_id,
        })).scalar_one()
        discipline_id = (await session.execute(text(
            """
            INSERT INTO disciplines (name, description, created_by)
            VALUES (:name, 'R-13 problem notifications test', 1)
            RETURNING discipline_id
            """
        ), {"name": f"R-13 discipline {suffix}"})).scalar_one()
        await session.execute(text(
            """
            INSERT INTO teacher_disciplines (teacher_id, discipline_id, time_limit_minutes, question_count)
            VALUES (1, :discipline_id, 20, 1)
            """
        ), {"discipline_id": discipline_id})
        await session.execute(text(
            """
            INSERT INTO student_disciplines (student_id, discipline_id)
            VALUES (:student_id, :discipline_id)
            """
        ), {"student_id": student_id, "discipline_id": discipline_id})
        await session.execute(text(
            """
            INSERT INTO user_credentials (role, user_id, password_hash)
            VALUES ('student', :student_id, :password_hash)
            """
        ), {"student_id": student_id, "password_hash": hash_password("Passw0rd!Test")})
        topic_id = (await session.execute(text(
            """
            INSERT INTO discipline_topics (discipline_id, name, sort_order, created_by)
            VALUES (:discipline_id, :name, 10, 1)
            RETURNING topic_id
            """
        ), {"discipline_id": discipline_id, "name": f"R-13 topic {suffix}"})).scalar_one()
        await session.execute(text(
            """
            INSERT INTO questions (discipline_id, topic_id, text, difficulty, qtype, correct_bool)
            VALUES (:discipline_id, :topic_id, :text, 1, 'bool', TRUE)
            """
        ), {
            "discipline_id": discipline_id,
            "topic_id": topic_id,
            "text": f"R-13 question {suffix}",
        })
        await session.execute(text(
            """
            INSERT INTO teacher_topic_tests (
                teacher_id, topic_id, time_limit_minutes, question_count,
                attempts_allowed, available_from, available_until, is_enabled
            )
            VALUES (1, :topic_id, 20, 1, :attempts_allowed, :available_from, :available_until, TRUE)
            """
        ), {
            "topic_id": topic_id,
            "attempts_allowed": attempts_allowed,
            "available_from": now - timedelta(hours=1),
            "available_until": now + timedelta(days=1),
        })
        session_id = (await session.execute(text(
            """
            INSERT INTO test_sessions (
                student_id, discipline_id, topic_id, teacher_id,
                started_at, completed_at, score, max_score, attempt_no, status
            )
            VALUES (
                :student_id, :discipline_id, :topic_id, 1,
                :started_at, :completed_at, 1, 1, 1, 'completed'
            )
            RETURNING session_id
            """
        ), {
            "student_id": student_id,
            "discipline_id": discipline_id,
            "topic_id": topic_id,
            "started_at": now - timedelta(minutes=20),
            "completed_at": now - timedelta(minutes=10),
        })).scalar_one()
        await session.commit()
    return login_name, int(student_id), int(discipline_id), int(topic_id), int(session_id)


async def test_attempts_exhausted_notifies_teacher_once(client):
    login_name, _student_id, _discipline_id, topic_id, _session_id = await _create_topic_attempts_fixture()
    student_headers = {"Authorization": f"Bearer {await _login(client, login_name)}"}
    teacher_headers = {"Authorization": f"Bearer {await _login(client, 'sidorov')}"}

    before = await _teacher_notifications(client, teacher_headers, "attempts_exhausted")
    first = await client.post(f"/api/student/topics/{topic_id}/tests/start", headers=student_headers)
    second = await client.post(f"/api/student/topics/{topic_id}/tests/start", headers=student_headers)
    after = await _teacher_notifications(client, teacher_headers, "attempts_exhausted")

    assert first.status_code == 409, first.text
    assert second.status_code == 409, second.text
    new_items = [item for item in after if item["notification_id"] not in {old["notification_id"] for old in before}]
    assert len(new_items) == 1
    assert new_items[0]["meta"]["topic_id"] == topic_id
    assert new_items[0]["meta"]["reason"] == "попытки исчерпаны"


async def test_student_complaint_notifies_teacher(client):
    login_name, student_id, _discipline_id, _topic_id, session_id = await _create_topic_attempts_fixture(attempts_allowed=2)
    student_headers = {"Authorization": f"Bearer {await _login(client, login_name)}"}
    teacher_headers = {"Authorization": f"Bearer {await _login(client, 'sidorov')}"}

    before = await _teacher_notifications(client, teacher_headers, "student_complaint")
    response = await client.post(
        "/api/student/complaints",
        headers=student_headers,
        json={"session_id": session_id, "body": "Не открывается изображение в вопросе"},
    )
    after = await _teacher_notifications(client, teacher_headers, "student_complaint")

    assert response.status_code == 200, response.text
    new_items = [item for item in after if item["notification_id"] not in {old["notification_id"] for old in before}]
    assert len(new_items) == 1
    assert new_items[0]["meta"]["student_id"] == student_id
    assert new_items[0]["meta"]["session_id"] == session_id
    assert "Не открывается изображение" in new_items[0]["body"]


async def test_ai_generation_failure_notifies_teacher(client):
    teacher_headers = {"Authorization": f"Bearer {await _login(client, 'sidorov')}"}
    task_id = uuid4().hex
    async with SessionLocal() as session:
        await session.execute(text(
            """
            INSERT INTO ai_generation_tasks (
                task_id, teacher_id, discipline_id, status, generated_count, total_requested
            )
            VALUES (:task_id, 1, 1, 'processing', 0, 1)
            """
        ), {"task_id": task_id})
        await session.commit()

    before = await _teacher_notifications(client, teacher_headers, "ai_generation_failed")
    payload = AiGenerationRequest(discipline_id=999999, question_types=["single"], count=1)
    await run_question_generation(task_id, payload, 1, get_settings())
    after = await _teacher_notifications(client, teacher_headers, "ai_generation_failed")

    new_items = [item for item in after if item["notification_id"] not in {old["notification_id"] for old in before}]
    assert len(new_items) == 1
    assert new_items[0]["meta"]["task_id"] == task_id
    assert new_items[0]["meta"]["discipline_id"] == 999999
    assert "not found" in new_items[0]["meta"]["error_message"]
