from __future__ import annotations

from uuid import uuid4

import csv
import io

import pytest
from sqlalchemy import text

from app.core.security import hash_password
from app.db.session import SessionLocal


pytestmark = pytest.mark.asyncio(loop_scope="session")


async def login(client, identifier: str, password: str = "Passw0rd!Test") -> str:
    response = await client.post(
        "/api/auth/login",
        json={"identifier": identifier, "password": password},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


async def _ensure_admin_credentials() -> str:
    password = "Passw0rd!Test"
    async with SessionLocal() as session:
        admin = (await session.execute(text(
            "SELECT admin_id, login FROM admins ORDER BY admin_id LIMIT 1"
        ))).mappings().first()
        assert admin is not None
        await session.execute(text(
            """
            INSERT INTO user_credentials (role, user_id, password_hash, requires_totp)
            VALUES ('admin', :admin_id, :password_hash, FALSE)
            ON CONFLICT (role, user_id) DO UPDATE
              SET password_hash = EXCLUDED.password_hash,
                  requires_totp = FALSE
            """
        ), {
            "admin_id": admin["admin_id"],
            "password_hash": hash_password(password),
        })
        await session.commit()
        return str(admin["login"])


async def test_admin_imports_and_exports_learning_structure_csv(client):
    suffix = uuid4().hex[:10]
    group = f"R15-{suffix}"
    discipline = f"R15 discipline {suffix}"
    topic = f"R15 topic {suffix}"
    student_login = f"r15_{suffix}"
    columns = [
        "row_type", "external_id", "name", "description", "admission_year", "last_name",
        "first_name", "middle_name", "email", "login", "group_name", "initial_password",
        "discipline_name", "teacher_login", "topic_name", "sort_order", "question_external_id",
        "question_text", "qtype", "difficulty", "short_pattern", "numeric_tolerance",
        "correct_bool", "explanation", "option_number", "option_text", "is_correct",
        "match_left", "match_right", "correct_position",
    ]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=columns)
    writer.writeheader()
    writer.writerows([
        {"row_type": "group", "name": group, "admission_year": 2026},
        {
            "row_type": "student",
            "last_name": "Student",
            "first_name": "R15",
            "email": f"{student_login}@example.test",
            "login": student_login,
            "group_name": group,
            "initial_password": "Passw0rd!Test",
        },
        {"row_type": "discipline", "name": discipline, "description": "Imported structure"},
        {
            "row_type": "topic",
            "name": topic,
            "description": "Topic description",
            "discipline_name": discipline,
            "sort_order": 10,
        },
        {
            "row_type": "question",
            "external_id": "q1",
            "discipline_name": discipline,
            "topic_name": topic,
            "question_text": "2+2?",
            "qtype": "single",
            "difficulty": 1,
        },
        {
            "row_type": "option",
            "question_external_id": "q1",
            "option_number": 1,
            "option_text": "4",
            "is_correct": 1,
        },
    ])
    csv_text = buf.getvalue()

    admin_login = await _ensure_admin_credentials()
    headers = {"Authorization": f"Bearer {await login(client, admin_login)}"}
    response = await client.post(
        "/api/admin/structure/import",
        files={"file": ("structure.csv", csv_text.encode("utf-8"), "text/csv")},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["created"]["groups"] == 1
    assert data["created"]["students"] == 1
    assert data["created"]["disciplines"] == 1
    assert data["created"]["topics"] == 1
    assert data["created"]["questions"] == 1
    assert data["created"]["options"] == 1
    assert data["errors"] == []

    exported = await client.get(
        "/api/admin/structure/export",
        params={"format": "csv"},
        headers=headers,
    )
    assert exported.status_code == 200, exported.text
    body = exported.content.decode("utf-8-sig")
    assert group in body
    assert discipline in body
    assert topic in body
    assert "2+2?" in body


async def test_teacher_structure_export_is_scoped_to_own_disciplines(client):
    teacher_headers = {"Authorization": f"Bearer {await login(client, 'sidorov')}"}
    exported = await client.get(
        "/api/v2/teacher/structure/export",
        params={"format": "csv"},
        headers=teacher_headers,
    )
    assert exported.status_code == 200, exported.text
    assert "row_type" in exported.content.decode("utf-8-sig")
