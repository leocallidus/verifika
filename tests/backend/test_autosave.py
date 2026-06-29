from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import text

from app.core.security import hash_password
from app.db.session import SessionLocal


pytestmark = pytest.mark.asyncio(loop_scope="session")


async def login(client, identifier: str, password: str = "Passw0rd!Test") -> str:
    response = await client.post("/api/auth/login", json={"identifier": identifier, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


async def _create_short_answer_session() -> tuple[str, int, int]:
    suffix = str(datetime.now(timezone.utc).timestamp()).replace(".", "")
    login_name = f"r03_{suffix}"
    async with SessionLocal() as session:
        group_id = (await session.execute(text(
            """
            INSERT INTO groups (name, admission_year)
            VALUES (:name, 2026)
            RETURNING group_id
            """
        ), {"name": f"R-03 group {suffix}"})).scalar_one()
        student_id = (await session.execute(text(
            """
            INSERT INTO students (first_name, last_name, email, login, group_id)
            VALUES ('R03', 'Student', :email, :login, :group_id)
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
            VALUES (:name, 'R-03 autosave test')
            RETURNING discipline_id
            """
        ), {"name": f"R-03 discipline {suffix}"})).scalar_one()
        question_id = (await session.execute(text(
            """
            INSERT INTO questions (discipline_id, text, difficulty, qtype)
            VALUES (:discipline_id, 'Short draft?', 1, 'short')
            RETURNING question_id
            """
        ), {"discipline_id": discipline_id})).scalar_one()
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
        session_id = (await session.execute(text(
            """
            INSERT INTO test_sessions (
                student_id, discipline_id, teacher_id, score, max_score, attempt_no, status
            )
            VALUES (:student_id, :discipline_id, 1, 0, 1, 1, 'in_progress')
            RETURNING session_id
            """
        ), {"student_id": student_id, "discipline_id": discipline_id})).scalar_one()
        await session.commit()
    return login_name, int(session_id), int(question_id)


async def test_autosave_restores_short_answer_without_option_id(client):
    login_name, session_id, question_id = await _create_short_answer_session()
    headers = {"Authorization": f"Bearer {await login(client, login_name)}"}

    saved = await client.post(
        f"/api/student/sessions/{session_id}/answers",
        headers=headers,
        json={"answers": [{"question_id": question_id, "short_answer": "draft value"}]},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["saved"] == 1

    resume = await client.get(f"/api/student/sessions/{session_id}/resume", headers=headers)
    assert resume.status_code == 200, resume.text
    assert resume.json()["saved_extras"][str(question_id)]["short"] == "draft value"


async def test_autosave_empty_snapshot_clears_previous_draft(client):
    login_name, session_id, question_id = await _create_short_answer_session()
    headers = {"Authorization": f"Bearer {await login(client, login_name)}"}

    first = await client.post(
        f"/api/student/sessions/{session_id}/answers",
        headers=headers,
        json={"answers": [{"question_id": question_id, "short_answer": "to clear"}]},
    )
    assert first.status_code == 200, first.text

    cleared = await client.post(
        f"/api/student/sessions/{session_id}/answers",
        headers=headers,
        json={"answers": []},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["saved"] == 0

    resume = await client.get(f"/api/student/sessions/{session_id}/resume", headers=headers)
    assert resume.status_code == 200, resume.text
    assert str(question_id) not in resume.json()["saved_extras"]
