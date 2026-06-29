from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import text

from app.core.security import hash_password
from app.db.session import SessionLocal


pytestmark = pytest.mark.asyncio(loop_scope="session")


async def login(client, identifier: str, password: str = "Passw0rd!Test") -> str:
    r = await client.post("/api/auth/login", json={"identifier": identifier, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


async def _create_student_and_discipline() -> tuple[str, int, int]:
    suffix = uuid4().hex[:10]
    login = f"r01_{suffix}"
    password = "Passw0rd!Test"
    async with SessionLocal() as session:
        group_id = (await session.execute(text(
            """
            INSERT INTO groups (name, admission_year)
            VALUES (:name, 2026)
            RETURNING group_id
            """
        ), {"name": f"R-01 group {suffix}"})).scalar_one()
        student_id = (await session.execute(text(
            """
            INSERT INTO students (first_name, last_name, email, login, group_id)
            VALUES ('R01', 'Student', :email, :login, :group_id)
            RETURNING student_id
            """
        ), {"email": f"{login}@example.test", "login": login, "group_id": group_id})).scalar_one()
        discipline_id = (await session.execute(text(
            """
            INSERT INTO disciplines (name, description)
            VALUES (:name, 'R-01 explicit assignment test')
            RETURNING discipline_id
            """
        ), {"name": f"R-01 discipline {suffix}"})).scalar_one()
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
        ), {"student_id": student_id, "password_hash": hash_password(password)})
        await session.commit()
    return login, student_id, discipline_id


async def test_student_does_not_see_teacher_only_discipline(client):
    login_name, _student_id, discipline_id = await _create_student_and_discipline()
    token = await login(client, login_name)
    headers = {"Authorization": f"Bearer {token}"}

    disciplines = await client.get("/api/student/disciplines", headers=headers)
    assert disciplines.status_code == 200, disciplines.text
    ids = {item["discipline_id"] for item in disciplines.json()["disciplines"]}
    assert discipline_id not in ids

    topics = await client.get(f"/api/student/disciplines/{discipline_id}/topics", headers=headers)
    assert topics.status_code == 404

    start = await client.post(f"/api/student/tests/{discipline_id}/start", headers=headers)
    assert start.status_code == 404


async def test_individual_assignment_grants_student_discipline_access(client):
    login_name, student_id, discipline_id = await _create_student_and_discipline()
    async with SessionLocal() as session:
        await session.execute(text(
            """
            INSERT INTO student_disciplines (student_id, discipline_id)
            VALUES (:student_id, :discipline_id)
            """
        ), {"student_id": student_id, "discipline_id": discipline_id})
        await session.commit()

    token = await login(client, login_name)
    disciplines = await client.get("/api/student/disciplines", headers={"Authorization": f"Bearer {token}"})
    assert disciplines.status_code == 200, disciplines.text
    ids = {item["discipline_id"] for item in disciplines.json()["disciplines"]}
    assert discipline_id in ids
