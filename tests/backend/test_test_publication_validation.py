from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import text

from app.db.session import SessionLocal


pytestmark = pytest.mark.asyncio(loop_scope="session")


async def login(client, identifier: str, password: str = "Passw0rd!Test") -> str:
    response = await client.post("/api/auth/login", json={"identifier": identifier, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


async def _create_teacher_topic() -> tuple[int, int]:
    suffix = uuid4().hex[:10]
    async with SessionLocal() as session:
        discipline_id = (await session.execute(text(
            """
            INSERT INTO disciplines (name, description, created_by)
            VALUES (:name, 'R-06 publication validation', 1)
            RETURNING discipline_id
            """
        ), {"name": f"R-06 discipline {suffix}"})).scalar_one()
        await session.execute(text(
            """
            INSERT INTO teacher_disciplines (teacher_id, discipline_id, time_limit_minutes, question_count)
            VALUES (1, :discipline_id, 20, 1)
            """
        ), {"discipline_id": discipline_id})
        topic_id = (await session.execute(text(
            """
            INSERT INTO discipline_topics (discipline_id, name, sort_order, created_by)
            VALUES (:discipline_id, :name, 10, 1)
            RETURNING topic_id
            """
        ), {
            "discipline_id": discipline_id,
            "name": f"R-06 topic {suffix}",
        })).scalar_one()
        await session.commit()
    return int(discipline_id), int(topic_id)


async def _add_single_question(
    discipline_id: int,
    topic_id: int,
    *,
    correct_index: int | None = 1,
    archived: bool = False,
) -> int:
    async with SessionLocal() as session:
        question_id = (await session.execute(text(
            """
            INSERT INTO questions (discipline_id, topic_id, text, difficulty, qtype, archived_at)
            VALUES (:discipline_id, :topic_id, :text, 1, 'single', :archived_at)
            RETURNING question_id
            """
        ), {
            "discipline_id": discipline_id,
            "topic_id": topic_id,
            "text": f"R-06 question {uuid4().hex[:8]}",
            "archived_at": datetime.now(timezone.utc) if archived else None,
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
                "is_correct": correct_index == number,
            })
        await session.commit()
    return int(question_id)


def _topic_test_payload(*, is_enabled: bool = True, question_count: int = 1) -> dict:
    return {
        "is_enabled": is_enabled,
        "question_count": question_count,
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
    }


async def test_cannot_enable_topic_test_without_questions(client):
    _discipline_id, topic_id = await _create_teacher_topic()
    headers = {"Authorization": f"Bearer {await login(client, 'sidorov')}"}

    response = await client.put(
        f"/api/v2/teacher/topics/{topic_id}/test",
        json=_topic_test_payload(question_count=1),
        headers=headers,
    )

    assert response.status_code == 400
    assert "Тест нельзя включить" in response.json()["message"]
    assert "нет активных вопросов" in response.json()["message"].lower()


async def test_cannot_enable_topic_test_when_archived_questions_are_needed_for_count(client):
    discipline_id, topic_id = await _create_teacher_topic()
    await _add_single_question(discipline_id, topic_id)
    await _add_single_question(discipline_id, topic_id, archived=True)
    headers = {"Authorization": f"Bearer {await login(client, 'sidorov')}"}

    response = await client.put(
        f"/api/v2/teacher/topics/{topic_id}/test",
        json=_topic_test_payload(question_count=2),
        headers=headers,
    )

    assert response.status_code == 400
    assert "Недостаточно активных вопросов: доступно 1 из 2" in response.json()["message"]


async def test_can_enable_topic_test_with_enough_valid_active_questions_and_archived_extra(client):
    discipline_id, topic_id = await _create_teacher_topic()
    await _add_single_question(discipline_id, topic_id)
    await _add_single_question(discipline_id, topic_id, archived=True)
    headers = {"Authorization": f"Bearer {await login(client, 'sidorov')}"}

    response = await client.put(
        f"/api/v2/teacher/topics/{topic_id}/test",
        json=_topic_test_payload(question_count=1),
        headers=headers,
    )

    assert response.status_code == 200, response.text
    assert response.json()["is_enabled"] is True
    assert response.json()["question_count"] == 1


async def test_cannot_enable_topic_test_with_invalid_answer_key(client):
    discipline_id, topic_id = await _create_teacher_topic()
    await _add_single_question(discipline_id, topic_id, correct_index=None)
    headers = {"Authorization": f"Bearer {await login(client, 'sidorov')}"}

    response = await client.put(
        f"/api/v2/teacher/topics/{topic_id}/test",
        json=_topic_test_payload(question_count=1),
        headers=headers,
    )

    assert response.status_code == 400
    detail = response.json()["message"]
    assert "должен быть ровно один правильный вариант" in detail
    assert "Недостаточно вопросов с корректными ответами: доступно 0 из 1" in detail


async def test_bulk_schedule_does_not_create_enabled_invalid_topic_tests(client):
    discipline_id, _topic_id = await _create_teacher_topic()
    headers = {"Authorization": f"Bearer {await login(client, 'sidorov')}"}

    response = await client.post(
        f"/api/v2/teacher/disciplines/{discipline_id}/topics/bulk-test-schedule",
        json={"available_from": None, "available_until": None},
        headers=headers,
    )

    assert response.status_code == 400
    assert "Тест нельзя включить" in response.json()["message"]
    assert "нет активных вопросов" in response.json()["message"].lower()
