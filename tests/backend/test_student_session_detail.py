from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
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


async def _create_session_detail_fixture(*, show_correct: bool) -> tuple[str, int]:
    suffix = uuid4().hex[:10]
    login_name = f"r11_{suffix}"
    now = datetime.now(timezone.utc)
    async with SessionLocal() as session:
        group_id = (await session.execute(text(
            """
            INSERT INTO groups (name, admission_year)
            VALUES (:name, 2026)
            RETURNING group_id
            """
        ), {"name": f"R-11 group {suffix}"})).scalar_one()
        student_id = (await session.execute(text(
            """
            INSERT INTO students (first_name, last_name, email, login, group_id)
            VALUES ('R11', 'Student', :email, :login, :group_id)
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
            VALUES (:name, 'R-11 session detail test', 1)
            RETURNING discipline_id
            """
        ), {"name": f"R-11 discipline {suffix}"})).scalar_one()
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
        ), {
            "discipline_id": discipline_id,
            "name": f"R-11 topic {suffix}",
        })).scalar_one()
        question_id = (await session.execute(text(
            """
            INSERT INTO questions (discipline_id, topic_id, text, difficulty, qtype, explanation)
            VALUES (:discipline_id, :topic_id, :text, 1, 'multi', 'Пояснение R-11')
            RETURNING question_id
            """
        ), {
            "discipline_id": discipline_id,
            "topic_id": topic_id,
            "text": "Выберите правильные варианты R-11",
        })).scalar_one()
        option_ids = []
        for number in range(1, 4):
            option_id = (await session.execute(text(
                """
                INSERT INTO answer_options (question_id, option_number, text, is_correct)
                VALUES (:question_id, :option_number, :text, :is_correct)
                RETURNING option_id
                """
            ), {
                "question_id": question_id,
                "option_number": number,
                "text": f"Вариант {number}",
                "is_correct": number in (1, 2),
            })).scalar_one()
            option_ids.append(int(option_id))
        await session.execute(text(
            """
            INSERT INTO teacher_topic_tests (
                teacher_id, topic_id, time_limit_minutes, question_count,
                attempts_allowed, passing_score_percent,
                show_correct_after_finish, grade_scale, is_enabled
            )
            VALUES (
                1, :topic_id, 20, 1,
                2, 60,
                :show_correct, 'percent', TRUE
            )
            """
        ), {"topic_id": topic_id, "show_correct": show_correct})
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
            "started_at": now - timedelta(minutes=7),
            "completed_at": now,
        })).scalar_one()
        answer_id = (await session.execute(text(
            """
            INSERT INTO student_answers (session_id, question_id, selected_option_id)
            VALUES (:session_id, :question_id, :selected_option_id)
            RETURNING answer_id
            """
        ), {
            "session_id": session_id,
            "question_id": question_id,
            "selected_option_id": option_ids[0],
        })).scalar_one()
        await session.execute(text(
            """
            INSERT INTO answer_extra (answer_id, match_pairs)
            VALUES (:answer_id, CAST(:match_pairs AS jsonb))
            """
        ), {"answer_id": answer_id, "match_pairs": json.dumps([option_ids[0], option_ids[1]])})
        await session.execute(text(
            """
            INSERT INTO answer_comments (session_id, question_id, teacher_id, body)
            VALUES (:session_id, :question_id, 1, 'Комментарий преподавателя R-11')
            """
        ), {"session_id": session_id, "question_id": question_id})
        await session.commit()
    return login_name, int(session_id)


async def test_student_session_detail_shows_structured_answers_and_comments_when_policy_allows(client):
    login_name, session_id = await _create_session_detail_fixture(show_correct=True)
    headers = {"Authorization": f"Bearer {await _login(client, login_name)}"}

    response = await client.get(f"/api/student/sessions/{session_id}/detail", headers=headers)

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["percent"] == 100.0
    assert data["attempt_number"] == 1
    assert data["passing_score_percent"] == 60
    assert data["is_passed"] is True
    assert data["show_correctness"] is True
    answer = data["answers"][0]
    assert answer["is_correct"] is True
    assert answer["explanation"] == "Пояснение R-11"
    assert answer["comment"] == "Комментарий преподавателя R-11"
    assert answer["student_answer_render"]["kind"] == "multi"
    assert answer["student_answer_render"]["option_texts"] == ["Вариант 1", "Вариант 2"]
    assert answer["correct_answer_render"]["kind"] == "multi"
    assert answer["correct_answer_render"]["option_texts"] == ["Вариант 1", "Вариант 2"]


async def test_student_session_detail_hides_correctness_when_policy_forbids(client):
    login_name, session_id = await _create_session_detail_fixture(show_correct=False)
    headers = {"Authorization": f"Bearer {await _login(client, login_name)}"}

    response = await client.get(f"/api/student/sessions/{session_id}/detail", headers=headers)

    assert response.status_code == 200, response.text
    answer = response.json()["answers"][0]
    assert response.json()["show_correctness"] is False
    assert answer["is_correct"] is None
    assert answer["correct_answer"] is None
    assert answer["correct_answer_render"] is None
    assert answer["explanation"] is None
    assert answer["comment"] == "Комментарий преподавателя R-11"
