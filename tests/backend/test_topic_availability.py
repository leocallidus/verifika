from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from app.core.security import hash_password
from app.db.session import SessionLocal


pytestmark = pytest.mark.asyncio(loop_scope="session")


async def login(client, identifier: str, password: str = "Passw0rd!Test") -> str:
    response = await client.post("/api/auth/login", json={"identifier": identifier, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


async def _create_student_and_discipline() -> tuple[str, int, int]:
    suffix = str(datetime.now(timezone.utc).timestamp()).replace(".", "")
    login_name = f"r02_{suffix}"
    async with SessionLocal() as session:
        group_id = (await session.execute(text(
            """
            INSERT INTO groups (name, admission_year)
            VALUES (:name, 2026)
            RETURNING group_id
            """
        ), {"name": f"R-02 group {suffix}"})).scalar_one()
        student_id = (await session.execute(text(
            """
            INSERT INTO students (first_name, last_name, email, login, group_id)
            VALUES ('R02', 'Student', :email, :login, :group_id)
            RETURNING student_id
            """
        ), {
            "email": f"{login_name}@example.test",
            "login": login_name,
            "group_id": group_id,
        })).scalar_one()
        discipline_id = (await session.execute(text(
            """
            INSERT INTO disciplines (name, description)
            VALUES (:name, 'R-02 topic availability test')
            RETURNING discipline_id
            """
        ), {"name": f"R-02 discipline {suffix}"})).scalar_one()
        await session.execute(text(
            """
            INSERT INTO teacher_disciplines (teacher_id, discipline_id, time_limit_minutes, question_count)
            VALUES (1, :discipline_id, 20, 1)
            """
        ), {"discipline_id": discipline_id})
        await session.execute(text(
            """
            INSERT INTO user_credentials (role, user_id, password_hash)
            VALUES ('student', :student_id, :password_hash)
            """
        ), {"student_id": student_id, "password_hash": hash_password("Passw0rd!Test")})
        await session.commit()
    return login_name, int(student_id), int(discipline_id)


async def _assign_student(student_id: int, discipline_id: int) -> None:
    async with SessionLocal() as session:
        await session.execute(text(
            """
            INSERT INTO student_disciplines (student_id, discipline_id)
            VALUES (:student_id, :discipline_id)
            ON CONFLICT DO NOTHING
            """
        ), {"student_id": student_id, "discipline_id": discipline_id})
        await session.commit()


async def _create_topic_test(
    discipline_id: int,
    *,
    question_count: int = 1,
    actual_questions: int = 1,
    attempts_allowed: int = 2,
    available_from: datetime | None = None,
    available_until: datetime | None = None,
    attempt_delay_minutes: int | None = None,
) -> int:
    async with SessionLocal() as session:
        topic_id = (await session.execute(text(
            """
            INSERT INTO discipline_topics (discipline_id, name, sort_order)
            VALUES (:discipline_id, :name, 10)
            RETURNING topic_id
            """
        ), {
            "discipline_id": discipline_id,
            "name": f"R-02 topic {datetime.now(timezone.utc).timestamp()}",
        })).scalar_one()
        await session.execute(text(
            """
            INSERT INTO teacher_topic_tests (
                teacher_id, topic_id, time_limit_minutes, question_count,
                attempts_allowed, available_from, available_until,
                attempt_delay_minutes, is_enabled
            )
            VALUES (
                1, :topic_id, 20, :question_count,
                :attempts_allowed, :available_from, :available_until,
                :attempt_delay_minutes, TRUE
            )
            """
        ), {
            "topic_id": topic_id,
            "question_count": question_count,
            "attempts_allowed": attempts_allowed,
            "available_from": available_from,
            "available_until": available_until,
            "attempt_delay_minutes": attempt_delay_minutes,
        })
        for i in range(actual_questions):
            await session.execute(text(
                """
                INSERT INTO questions (discipline_id, topic_id, text, difficulty, qtype)
                VALUES (:discipline_id, :topic_id, :text, 1, 'bool')
                """
            ), {
                "discipline_id": discipline_id,
                "topic_id": topic_id,
                "text": f"R-02 question {i}",
            })
        await session.commit()
    return int(topic_id)


async def _topic_from_list(client, headers: dict[str, str], discipline_id: int, topic_id: int) -> dict:
    response = await client.get(f"/api/student/disciplines/{discipline_id}/topics", headers=headers)
    assert response.status_code == 200, response.text
    topic = next((item for item in response.json()["topics"] if item["topic_id"] == topic_id), None)
    assert topic is not None
    return topic


async def test_topic_availability_reason_is_shared_by_list_detail_and_start(client):
    login_name, student_id, discipline_id = await _create_student_and_discipline()
    await _assign_student(student_id, discipline_id)
    topic_id = await _create_topic_test(discipline_id, question_count=2, actual_questions=1)
    headers = {"Authorization": f"Bearer {await login(client, login_name)}"}

    listed = await _topic_from_list(client, headers, discipline_id, topic_id)
    detail = await client.get(f"/api/student/topics/{topic_id}", headers=headers)
    start = await client.post(f"/api/student/topics/{topic_id}/tests/start", headers=headers)

    assert listed["available"] is False
    assert detail.status_code == 200, detail.text
    assert start.status_code == 403
    assert listed["unavailable_reason"] == "недостаточно вопросов: доступно 1 из 2"
    assert detail.json()["unavailable_reason"] == listed["unavailable_reason"]
    assert start.json()["message"] == listed["unavailable_reason"]


async def test_topic_attempt_delay_is_shared_by_detail_and_start(client):
    login_name, student_id, discipline_id = await _create_student_and_discipline()
    await _assign_student(student_id, discipline_id)
    topic_id = await _create_topic_test(
        discipline_id,
        question_count=1,
        actual_questions=1,
        attempts_allowed=2,
        attempt_delay_minutes=60,
    )
    async with SessionLocal() as session:
        await session.execute(text(
            """
            INSERT INTO test_sessions (
                student_id, discipline_id, topic_id, teacher_id,
                started_at, completed_at, score, max_score, attempt_no, status
            )
            VALUES (
                :student_id, :discipline_id, :topic_id, 1,
                :started_at, :completed_at, 1, 1, 1, 'completed'
            )
            """
        ), {
            "student_id": student_id,
            "discipline_id": discipline_id,
            "topic_id": topic_id,
            "started_at": datetime.now(timezone.utc) - timedelta(minutes=5),
            "completed_at": datetime.now(timezone.utc),
        })
        await session.commit()
    headers = {"Authorization": f"Bearer {await login(client, login_name)}"}

    listed = await _topic_from_list(client, headers, discipline_id, topic_id)
    detail = await client.get(f"/api/student/topics/{topic_id}", headers=headers)
    start = await client.post(f"/api/student/topics/{topic_id}/tests/start", headers=headers)

    assert listed["available"] is False
    assert detail.status_code == 200, detail.text
    assert start.status_code == 429
    assert listed["unavailable_reason"].startswith("следующая попытка будет доступна через ")
    assert detail.json()["unavailable_reason"] == listed["unavailable_reason"]
    assert start.json()["message"] == listed["unavailable_reason"]
    assert detail.json()["next_attempt_available_at"] is not None


async def test_topic_availability_group_rules(client):
    login_name, student_id, discipline_id = await _create_student_and_discipline()
    await _assign_student(student_id, discipline_id)

    # Get group_id from DB
    async with SessionLocal() as session:
        group_id = (await session.execute(text(
            "SELECT group_id FROM students WHERE student_id = :student_id"
        ), {"student_id": student_id})).scalar_one()

        # Link group and discipline
        await session.execute(text(
            """
            INSERT INTO group_disciplines (group_id, discipline_id)
            VALUES (:group_id, :discipline_id)
            """
        ), {"group_id": group_id, "discipline_id": discipline_id})
        await session.commit()

    topic_id = await _create_topic_test(
        discipline_id,
        question_count=1,
        actual_questions=1,
        attempts_allowed=2,
    )

    student_headers = {"Authorization": f"Bearer {await login(client, login_name)}"}
    teacher_headers = {"Authorization": f"Bearer {await login(client, 'sidorov', 'Passw0rd!Test')}"}

    now = datetime.now(timezone.utc)

    # 1. Future group rule
    future_from = (now + timedelta(hours=1)).isoformat()
    future_until = (now + timedelta(hours=2)).isoformat()
    resp = await client.put(
        f"/api/v2/teacher/topics/{topic_id}/test/group-rules",
        headers=teacher_headers,
        json=[{
            "group_id": group_id,
            "available_from": future_from,
            "available_until": future_until,
        }]
    )
    assert resp.status_code == 200, resp.text

    detail = await client.get(f"/api/student/topics/{topic_id}", headers=student_headers)
    assert detail.status_code == 200
    assert detail.json()["available"] is False
    assert detail.json()["unavailable_reason"] == "окно доступности еще не началось"

    # 2. Past group rule
    past_from = (now - timedelta(hours=2)).isoformat()
    past_until = (now - timedelta(hours=1)).isoformat()
    resp = await client.put(
        f"/api/v2/teacher/topics/{topic_id}/test/group-rules",
        headers=teacher_headers,
        json=[{
            "group_id": group_id,
            "available_from": past_from,
            "available_until": past_until,
        }]
    )
    assert resp.status_code == 200, resp.text

    detail = await client.get(f"/api/student/topics/{topic_id}", headers=student_headers)
    assert detail.status_code == 200
    assert detail.json()["available"] is False
    assert detail.json()["unavailable_reason"] == "окно доступности закрыто"

    # 3. Current group rule
    current_from = (now - timedelta(hours=1)).isoformat()
    current_until = (now + timedelta(hours=1)).isoformat()
    resp = await client.put(
        f"/api/v2/teacher/topics/{topic_id}/test/group-rules",
        headers=teacher_headers,
        json=[{
            "group_id": group_id,
            "available_from": current_from,
            "available_until": current_until,
        }]
    )
    assert resp.status_code == 200, resp.text

    detail = await client.get(f"/api/student/topics/{topic_id}", headers=student_headers)
    assert detail.status_code == 200
    assert detail.json()["available"] is True

