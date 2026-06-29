from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import text

from app.core.security import hash_password
from app.db.session import SessionLocal


pytestmark = pytest.mark.asyncio(loop_scope="session")


async def login(client, identifier: str, password: str = "Passw0rd!Test") -> str:
    response = await client.post("/api/auth/login", json={"identifier": identifier, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


async def _create_student_discipline() -> tuple[str, int, int]:
    suffix = uuid4().hex[:10]
    login_name = f"r07_{suffix}"
    async with SessionLocal() as session:
        group_id = (await session.execute(text(
            """
            INSERT INTO groups (name, admission_year)
            VALUES (:name, 2026)
            RETURNING group_id
            """
        ), {"name": f"R-07 group {suffix}"})).scalar_one()
        student_id = (await session.execute(text(
            """
            INSERT INTO students (first_name, last_name, email, login, group_id)
            VALUES ('R07', 'Student', :email, :login, :group_id)
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
            VALUES (:name, 'R-07 test mode separation', 1)
            RETURNING discipline_id
            """
        ), {"name": f"R-07 discipline {suffix}"})).scalar_one()
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
        await session.commit()
    return login_name, int(student_id), int(discipline_id)


async def _add_single_question(discipline_id: int, topic_id: int | None = None) -> int:
    async with SessionLocal() as session:
        question_id = (await session.execute(text(
            """
            INSERT INTO questions (discipline_id, topic_id, text, difficulty, qtype)
            VALUES (:discipline_id, :topic_id, :text, 1, 'single')
            RETURNING question_id
            """
        ), {
            "discipline_id": discipline_id,
            "topic_id": topic_id,
            "text": f"R-07 question {uuid4().hex[:8]}",
        })).scalar_one()
        for number in range(1, 5):
            await session.execute(text(
                """
                INSERT INTO answer_options (question_id, option_number, text, is_correct)
                VALUES (:question_id, :option_number, :text, :is_correct)
                """
            ), {
                "question_id": question_id,
                "option_number": number,
                "text": f"Вариант {number}",
                "is_correct": number == 1,
            })
        await session.commit()
    return int(question_id)


async def _create_enabled_topic_test(discipline_id: int) -> int:
    async with SessionLocal() as session:
        topic_id = (await session.execute(text(
            """
            INSERT INTO discipline_topics (discipline_id, name, sort_order, created_by)
            VALUES (:discipline_id, :name, 10, 1)
            RETURNING topic_id
            """
        ), {
            "discipline_id": discipline_id,
            "name": f"R-07 topic {uuid4().hex[:8]}",
        })).scalar_one()
        await session.commit()
    await _add_single_question(discipline_id, int(topic_id))
    async with SessionLocal() as session:
        await session.execute(text(
            """
            INSERT INTO teacher_topic_tests (
                teacher_id, topic_id, time_limit_minutes, question_count,
                attempts_allowed, is_enabled
            )
            VALUES (1, :topic_id, 20, 1, 2, TRUE)
            """
        ), {"topic_id": topic_id})
        await session.commit()
    return int(topic_id)


async def _discipline_from_list(client, headers: dict[str, str], discipline_id: int) -> dict:
    response = await client.get("/api/student/disciplines", headers=headers)
    assert response.status_code == 200, response.text
    item = next((row for row in response.json()["disciplines"] if row["discipline_id"] == discipline_id), None)
    assert item is not None
    return item


async def test_topic_mode_hides_and_blocks_general_discipline_start(client):
    login_name, _student_id, discipline_id = await _create_student_discipline()
    topic_id = await _create_enabled_topic_test(discipline_id)
    headers = {"Authorization": f"Bearer {await login(client, login_name)}"}

    discipline = await _discipline_from_list(client, headers, discipline_id)
    general_start = await client.post(f"/api/student/tests/{discipline_id}/start", headers=headers)
    topic_start = await client.post(f"/api/student/topics/{topic_id}/tests/start", headers=headers)

    assert discipline["test_mode"] == "topic"
    assert discipline["general_test_available"] is False
    assert discipline["enabled_topic_tests_count"] == 1
    assert discipline["available_topic_tests_count"] == 1
    assert general_start.status_code == 409
    assert "тесты по темам" in general_start.json()["message"]
    assert topic_start.status_code == 201, topic_start.text


async def test_discipline_mode_keeps_general_start_without_enabled_topic_tests(client):
    login_name, _student_id, discipline_id = await _create_student_discipline()
    await _add_single_question(discipline_id)
    headers = {"Authorization": f"Bearer {await login(client, login_name)}"}

    discipline = await _discipline_from_list(client, headers, discipline_id)
    general_start = await client.post(f"/api/student/tests/{discipline_id}/start", headers=headers)

    assert discipline["test_mode"] == "discipline"
    assert discipline["general_test_available"] is True
    assert discipline["enabled_topic_tests_count"] == 0
    assert general_start.status_code == 201, general_start.text
