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


async def _create_topic_detail_fixture() -> tuple[str, int]:
    suffix = uuid4().hex[:10]
    login_name = f"r10_{suffix}"
    now = datetime.now(timezone.utc)
    async with SessionLocal() as session:
        group_id = (await session.execute(text(
            """
            INSERT INTO groups (name, admission_year)
            VALUES (:name, 2026)
            RETURNING group_id
            """
        ), {"name": f"R-10 group {suffix}"})).scalar_one()
        student_id = (await session.execute(text(
            """
            INSERT INTO students (first_name, last_name, email, login, group_id)
            VALUES ('R10', 'Student', :email, :login, :group_id)
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
            VALUES (:name, 'R-10 topic detail test', 1)
            RETURNING discipline_id
            """
        ), {"name": f"R-10 discipline {suffix}"})).scalar_one()
        await session.execute(text(
            """
            INSERT INTO teacher_disciplines (teacher_id, discipline_id, time_limit_minutes, question_count)
            VALUES (1, :discipline_id, 20, 2)
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
            INSERT INTO discipline_topics (discipline_id, name, description, sort_order, created_by)
            VALUES (:discipline_id, :name, :description, 10, 1)
            RETURNING topic_id
            """
        ), {
            "discipline_id": discipline_id,
            "name": f"R-10 topic {suffix}",
            "description": "Описание темы R-10",
        })).scalar_one()
        for idx in range(2):
            await session.execute(text(
                """
                INSERT INTO questions (discipline_id, topic_id, text, difficulty, qtype, correct_bool)
                VALUES (:discipline_id, :topic_id, :text, 1, 'bool', TRUE)
                """
            ), {
                "discipline_id": discipline_id,
                "topic_id": topic_id,
                "text": f"R-10 question {idx}",
            })
        await session.execute(text(
            """
            INSERT INTO teacher_topic_tests (
                teacher_id, topic_id, time_limit_minutes, question_count,
                attempts_allowed, available_from, available_until,
                passing_score_percent, grading_method, show_question_points,
                show_correct_after_finish, attempt_delay_minutes,
                grade_scale, is_enabled
            )
            VALUES (
                1, :topic_id, 25, 2,
                2, :available_from, :available_until,
                60, 'last', FALSE,
                FALSE, 90,
                'percent', TRUE
            )
            """
        ), {
            "topic_id": topic_id,
            "available_from": now - timedelta(days=1),
            "available_until": now + timedelta(days=2),
        })
        await session.execute(text(
            """
            INSERT INTO test_sessions (
                student_id, discipline_id, topic_id, teacher_id,
                started_at, completed_at, score, max_score, attempt_no, status
            )
            VALUES (
                :student_id, :discipline_id, :topic_id, 1,
                :started_at, :completed_at, 1, 2, 1, 'completed'
            )
            """
        ), {
            "student_id": student_id,
            "discipline_id": discipline_id,
            "topic_id": topic_id,
            "started_at": now - timedelta(minutes=10),
            "completed_at": now - timedelta(minutes=5),
        })
        await session.commit()
    return login_name, int(topic_id)


async def test_student_topic_detail_contains_rules_deadline_history_and_safe_questions(client):
    login_name, topic_id = await _create_topic_detail_fixture()
    headers = {"Authorization": f"Bearer {await _login(client, login_name)}"}

    response = await client.get(f"/api/student/topics/{topic_id}", headers=headers)
    start = await client.post(f"/api/student/topics/{topic_id}/tests/start", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["description"] == "Описание темы R-10"
    assert data["question_count"] == 2
    assert data["actual_questions_count"] == 2
    assert data["time_limit_minutes"] == 25
    assert data["attempts_allowed"] == 2
    assert data["attempts_left"] == 1
    assert data["available"] is False
    assert data["unavailable_reason"].startswith("следующая попытка будет доступна через ")
    assert data["available_from"] is not None
    assert data["available_until"] is not None
    assert data["passing_score_percent"] == 60
    assert data["grading_method"] == "last"
    assert data["show_question_points"] is False
    assert data["show_correct_after_finish"] is False
    assert data["attempt_delay_minutes"] == 90
    assert data["next_attempt_available_at"] is not None
    assert data["best_percent"] == 50.0
    assert data["last_percent"] == 50.0
    assert data["average_percent"] == 50.0
    assert data["is_passed"] is False
    assert data["grade_scale"] == "percent"
    assert len(data["study_questions"]) == 2
    assert "correct_bool" not in (data["study_questions"][0]["qmeta"] or {})
    assert "explanation" not in (data["study_questions"][0]["qmeta"] or {})
    assert data["history"][0]["attempt_number"] == 1
    assert data["history"][0]["percent"] == 50.0
    assert data["history"][0]["duration_seconds"] == 300
    assert data["history"][0]["is_best"] is True
    assert start.status_code == 429


async def test_student_topic_detail_allow_study_false(client):
    login_name, topic_id = await _create_topic_detail_fixture()
    
    # Disable allow_study for this topic test
    async with SessionLocal() as session:
        await session.execute(text(
            """
            UPDATE teacher_topic_tests
            SET allow_study = FALSE
            WHERE topic_id = :topic_id
            """
        ), {"topic_id": topic_id})
        await session.commit()

    headers = {"Authorization": f"Bearer {await _login(client, login_name)}"}
    response = await client.get(f"/api/student/topics/{topic_id}", headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()
    
    assert data["allow_study"] is False
    assert len(data["study_questions"]) == 0

