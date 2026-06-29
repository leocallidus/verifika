from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import text

from app.db.session import SessionLocal


pytestmark = pytest.mark.asyncio(loop_scope="session")


async def login(client, identifier: str, password: str = "Passw0rd!Test") -> str:
    response = await client.post("/api/auth/login", json={"identifier": identifier, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


async def _create_teacher_discipline(*, question_count: int = 1) -> int:
    suffix = uuid4().hex[:10]
    async with SessionLocal() as session:
        discipline_id = (await session.execute(text(
            """
            INSERT INTO disciplines (name, description, created_by)
            VALUES (:name, 'R-08 diagnostics test', 1)
            RETURNING discipline_id
            """
        ), {"name": f"R-08 discipline {suffix}"})).scalar_one()
        await session.execute(text(
            """
            INSERT INTO teacher_disciplines (teacher_id, discipline_id, time_limit_minutes, question_count)
            VALUES (1, :discipline_id, 20, :question_count)
            """
        ), {"discipline_id": discipline_id, "question_count": question_count})
        await session.commit()
    return int(discipline_id)


async def _assign_student(discipline_id: int) -> None:
    suffix = uuid4().hex[:10]
    async with SessionLocal() as session:
        group_id = (await session.execute(text(
            """
            INSERT INTO groups (name, admission_year)
            VALUES (:name, 2026)
            RETURNING group_id
            """
        ), {"name": f"R-08 group {suffix}"})).scalar_one()
        student_id = (await session.execute(text(
            """
            INSERT INTO students (first_name, last_name, email, login, group_id)
            VALUES ('R08', 'Student', :email, :login, :group_id)
            RETURNING student_id
            """
        ), {
            "email": f"r08_{suffix}@example.test",
            "login": f"r08_{suffix}",
            "group_id": group_id,
        })).scalar_one()
        await session.execute(text(
            """
            INSERT INTO student_disciplines (student_id, discipline_id)
            VALUES (:student_id, :discipline_id)
            """
        ), {"student_id": student_id, "discipline_id": discipline_id})
        await session.commit()


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
            "text": f"R-08 question {uuid4().hex[:8]}",
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


async def _create_topic_test(discipline_id: int, *, question_count: int) -> int:
    async with SessionLocal() as session:
        topic_id = (await session.execute(text(
            """
            INSERT INTO discipline_topics (discipline_id, name, sort_order, created_by)
            VALUES (:discipline_id, :name, 10, 1)
            RETURNING topic_id
            """
        ), {
            "discipline_id": discipline_id,
            "name": f"R-08 topic {uuid4().hex[:8]}",
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
            VALUES (1, :topic_id, 20, :question_count, 2, TRUE)
            """
        ), {"topic_id": topic_id, "question_count": question_count})
        await session.commit()
    return int(topic_id)


async def _diagnostic_item(client, headers: dict[str, str], discipline_id: int) -> dict:
    response = await client.get("/api/teacher/diagnostics/disciplines", headers=headers)
    assert response.status_code == 200, response.text
    item = next((row for row in response.json()["disciplines"] if row["discipline_id"] == discipline_id), None)
    assert item is not None
    return item


async def test_teacher_diagnostics_reports_general_discipline_setup_problems(client):
    discipline_id = await _create_teacher_discipline(question_count=2)
    headers = {"Authorization": f"Bearer {await login(client, 'sidorov')}"}

    item = await _diagnostic_item(client, headers, discipline_id)
    codes = {problem["code"] for problem in item["problems"]}

    assert item["test_mode"] == "discipline"
    assert item["assigned_students_count"] == 0
    assert item["active_questions_count"] == 0
    assert item["general_test_available"] is False
    assert {"no_assigned_students", "no_active_questions", "not_enough_general_questions"} <= codes


async def test_teacher_diagnostics_reports_topic_test_publication_blockers(client):
    discipline_id = await _create_teacher_discipline(question_count=1)
    await _assign_student(discipline_id)
    topic_id = await _create_topic_test(discipline_id, question_count=2)
    headers = {"Authorization": f"Bearer {await login(client, 'sidorov')}"}

    item = await _diagnostic_item(client, headers, discipline_id)
    topic = next(row for row in item["topics"] if row["topic_id"] == topic_id)
    topic_codes = {problem["code"] for problem in topic["problems"]}

    assert item["test_mode"] == "topic"
    assert item["assigned_students_count"] == 1
    assert item["enabled_topic_tests_count"] == 1
    assert item["general_test_available"] is False
    assert topic["status"] == "blocked"
    assert "topic_publication_blocker" in topic_codes
    assert any("Недостаточно активных вопросов" in problem["message"] for problem in topic["problems"])
