from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import text

from app.core.security import hash_password
from app.db.session import SessionLocal


pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _login(client, identifier: str, password: str = "Passw0rd!Test") -> str:
    response = await client.post("/api/auth/login", json={"identifier": identifier, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


async def _create_notification_fixture() -> str:
    suffix = uuid4().hex[:10]
    login_name = f"r12_{suffix}"
    now = datetime.now(timezone.utc)
    async with SessionLocal() as session:
        group_id = (await session.execute(text(
            """
            INSERT INTO groups (name, admission_year)
            VALUES (:name, 2026)
            RETURNING group_id
            """
        ), {"name": f"R-12 group {suffix}"})).scalar_one()
        student_id = (await session.execute(text(
            """
            INSERT INTO students (first_name, last_name, email, login, group_id)
            VALUES ('R12', 'Student', :email, :login, :group_id)
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
            VALUES (:name, 'R-12 notifications test', 1)
            RETURNING discipline_id
            """
        ), {"name": f"R-12 discipline {suffix}"})).scalar_one()
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
        ), {"discipline_id": discipline_id, "name": f"R-12 topic {suffix}"})).scalar_one()
        await session.execute(text(
            """
            INSERT INTO questions (discipline_id, topic_id, text, difficulty, qtype, correct_bool)
            VALUES (:discipline_id, :topic_id, :text, 1, 'bool', TRUE)
            """
        ), {
            "discipline_id": discipline_id,
            "topic_id": topic_id,
            "text": f"R-12 question {suffix}",
        })
        await session.execute(text(
            """
            INSERT INTO teacher_topic_tests (
                teacher_id, topic_id, time_limit_minutes, question_count,
                attempts_allowed, available_from, available_until, is_enabled
            )
            VALUES (1, :topic_id, 20, 1, 2, :available_from, :available_until, TRUE)
            """
        ), {
            "topic_id": topic_id,
            "available_from": now - timedelta(hours=1),
            "available_until": now + timedelta(days=2),
        })
        await session.commit()
    return login_name


async def test_student_notifications_create_available_test_and_deadline_events_without_duplicates(client):
    login_name = await _create_notification_fixture()
    headers = {"Authorization": f"Bearer {await _login(client, login_name)}"}

    first = await client.get("/api/student/notifications", headers=headers)
    second = await client.get("/api/student/notifications", headers=headers)
    deadlines = await client.get("/api/student/notifications?type=deadline_approaching", headers=headers)
    unread = await client.get("/api/student/notifications?is_read=false", headers=headers)

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    event_types = [item["type"] for item in first.json()["items"]]
    assert "test_available" in event_types
    assert "deadline_approaching" in event_types
    assert [item["type"] for item in second.json()["items"]].count("test_available") == 1
    assert [item["type"] for item in second.json()["items"]].count("deadline_approaching") == 1
    assert deadlines.status_code == 200, deadlines.text
    assert deadlines.json()["total"] == 1
    assert deadlines.json()["items"][0]["link"].startswith("/student/topics/")
    assert unread.status_code == 200, unread.text
    assert unread.json()["unread_count"] >= 2
