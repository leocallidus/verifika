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


async def _add_bool_question(session, discipline_id: int, topic_id: int) -> None:
    await session.execute(text(
        """
        INSERT INTO questions (discipline_id, topic_id, text, difficulty, qtype, correct_bool)
        VALUES (:discipline_id, :topic_id, :text, 1, 'bool', TRUE)
        """
    ), {
        "discipline_id": discipline_id,
        "topic_id": topic_id,
        "text": f"R-09 question {uuid4().hex[:8]}",
    })


async def _create_dashboard_fixture() -> tuple[str, int, int, int, int]:
    suffix = uuid4().hex[:10]
    login_name = f"r09_{suffix}"
    now = datetime.now(timezone.utc)
    async with SessionLocal() as session:
        group_id = (await session.execute(text(
            """
            INSERT INTO groups (name, admission_year)
            VALUES (:name, 2026)
            RETURNING group_id
            """
        ), {"name": f"R-09 group {suffix}"})).scalar_one()
        student_id = (await session.execute(text(
            """
            INSERT INTO students (first_name, last_name, email, login, group_id)
            VALUES ('R09', 'Student', :email, :login, :group_id)
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
            VALUES (:name, 'R-09 dashboard test', 1)
            RETURNING discipline_id
            """
        ), {"name": f"R-09 discipline {suffix}"})).scalar_one()
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
        completed_topic_id = (await session.execute(text(
            """
            INSERT INTO discipline_topics (discipline_id, name, sort_order, created_by)
            VALUES (:discipline_id, :name, 10, 1)
            RETURNING topic_id
            """
        ), {
            "discipline_id": discipline_id,
            "name": f"R-09 completed {suffix}",
        })).scalar_one()
        next_topic_id = (await session.execute(text(
            """
            INSERT INTO discipline_topics (discipline_id, name, sort_order, created_by)
            VALUES (:discipline_id, :name, 20, 1)
            RETURNING topic_id
            """
        ), {
            "discipline_id": discipline_id,
            "name": f"R-09 next {suffix}",
        })).scalar_one()
        await _add_bool_question(session, int(discipline_id), int(completed_topic_id))
        await _add_bool_question(session, int(discipline_id), int(next_topic_id))
        await session.execute(text(
            """
            INSERT INTO teacher_topic_tests (
                teacher_id, topic_id, time_limit_minutes, question_count,
                attempts_allowed, available_until, is_enabled
            )
            VALUES
                (1, :completed_topic_id, 20, 1, 2, :available_until, TRUE),
                (1, :next_topic_id, 20, 1, 2, :available_until, TRUE)
            """
        ), {
            "completed_topic_id": completed_topic_id,
            "next_topic_id": next_topic_id,
            "available_until": now + timedelta(days=3),
        })
        await session.execute(text(
            """
            INSERT INTO test_sessions (
                student_id, discipline_id, topic_id, teacher_id,
                started_at, completed_at, score, max_score, attempt_no, status
            )
            VALUES (
                :student_id, :discipline_id, :completed_topic_id, 1,
                :started_at, :completed_at, 8, 10, 1, 'completed'
            )
            """
        ), {
            "student_id": student_id,
            "discipline_id": discipline_id,
            "completed_topic_id": completed_topic_id,
            "started_at": now - timedelta(days=1, minutes=20),
            "completed_at": now - timedelta(days=1),
        })
        active_session_id = (await session.execute(text(
            """
            INSERT INTO test_sessions (
                student_id, discipline_id, topic_id, teacher_id,
                started_at, completed_at, score, max_score, attempt_no, status
            )
            VALUES (
                :student_id, :discipline_id, :next_topic_id, 1,
                :started_at, NULL, 0, 1, 1, 'in_progress'
            )
            RETURNING session_id
            """
        ), {
            "student_id": student_id,
            "discipline_id": discipline_id,
            "next_topic_id": next_topic_id,
            "started_at": now - timedelta(minutes=5),
        })).scalar_one()
        await session.commit()

    return login_name, int(discipline_id), int(completed_topic_id), int(next_topic_id), int(active_session_id)


async def test_student_dashboard_includes_topic_progress_and_next_action(client):
    login_name, discipline_id, _completed_topic_id, next_topic_id, active_session_id = await _create_dashboard_fixture()
    headers = {"Authorization": f"Bearer {await _login(client, login_name)}"}

    response = await client.get("/api/student/dashboard", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    progress = next(
        item for item in data["topic_progress"]
        if item["discipline_id"] == discipline_id
    )
    assert progress["topics_total"] == 2
    assert progress["topics_completed"] == 1
    assert progress["available_topic_tests_count"] == 2
    assert progress["average_score_percent"] == 80.0
    assert progress["next_topic_id"] == next_topic_id
    assert progress["next_topic_attempts_left"] == 2
    assert progress["test_mode"] == "topic"
    assert any(item["session_id"] == active_session_id for item in data["active_sessions"])
    assert any(item["topic_id"] == next_topic_id for item in data["upcoming_deadlines"])
    assert data["recent_history"][0]["score"] == 8
    assert data["stats"]["average_score_percent"] == 80.0
