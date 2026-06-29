from __future__ import annotations

from uuid import uuid4

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


async def _create_fixture() -> tuple[int, int, int, int]:
    suffix = uuid4().hex[:10]
    login_name = f"r14_{suffix}"
    async with SessionLocal() as session:
        group_id = (await session.execute(text(
            """
            INSERT INTO groups (name, admission_year)
            VALUES (:name, 2026)
            RETURNING group_id
            """
        ), {"name": f"R-14 group {suffix}"})).scalar_one()
        student_id = (await session.execute(text(
            """
            INSERT INTO students (first_name, last_name, email, login, group_id)
            VALUES ('R14', 'Student', :email, :login, :group_id)
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
            VALUES (:name, 'R-14 assignment matrix')
            RETURNING discipline_id
            """
        ), {"name": f"R-14 matrix {suffix}"})).scalar_one()
        await session.execute(text(
            """
            INSERT INTO user_credentials (role, user_id, password_hash, requires_totp)
            VALUES ('student', :student_id, :password_hash, FALSE)
            """
        ), {
            "student_id": student_id,
            "password_hash": hash_password("Passw0rd!Test"),
        })
        await session.commit()
    return int(discipline_id), int(group_id), int(student_id), 1


async def test_admin_assignment_matrix_shows_teacher_group_student_and_effective_access(client):
    admin_login = await _ensure_admin_credentials()
    token = await login(client, admin_login)
    headers = {"Authorization": f"Bearer {token}"}
    discipline_id, group_id, student_id, teacher_id = await _create_fixture()

    assign_teacher = await client.post(
        f"/api/admin/disciplines/{discipline_id}/assign-teacher",
        json={"teacher_id": teacher_id},
        headers=headers,
    )
    assert assign_teacher.status_code == 200, assign_teacher.text
    assign_group = await client.post(
        f"/api/admin/disciplines/{discipline_id}/assign-group",
        json={"group_id": group_id},
        headers=headers,
    )
    assert assign_group.status_code == 200, assign_group.text
    assign_student = await client.post(
        f"/api/admin/disciplines/{discipline_id}/assign-student",
        json={"student_id": student_id},
        headers=headers,
    )
    assert assign_student.status_code == 200, assign_student.text

    response = await client.get(
        "/api/admin/assignments/matrix",
        params={"q": "R-14 matrix"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    rows = response.json()["rows"]
    row = next((item for item in rows if item["discipline_id"] == discipline_id), None)
    assert row is not None
    assert row["has_teacher"] is True
    assert row["has_student_access"] is True
    assert row["effective_students_count"] >= 1
    assert {item["teacher_id"] for item in row["teachers"]} == {teacher_id}
    assert {item["group_id"] for item in row["groups"]} == {group_id}
    assert {item["student_id"] for item in row["students"]} == {student_id}

    revoke_group = await client.post(
        f"/api/admin/disciplines/{discipline_id}/revoke-group",
        json={"group_id": group_id},
        headers=headers,
    )
    assert revoke_group.status_code == 200, revoke_group.text
    revoke_student = await client.post(
        f"/api/admin/disciplines/{discipline_id}/revoke-student",
        json={"student_id": student_id},
        headers=headers,
    )
    assert revoke_student.status_code == 200, revoke_student.text
    revoke_teacher = await client.post(
        f"/api/admin/disciplines/{discipline_id}/revoke-teacher",
        json={"teacher_id": teacher_id},
        headers=headers,
    )
    assert revoke_teacher.status_code == 200, revoke_teacher.text

    after = await client.get(
        "/api/admin/assignments/matrix",
        params={"q": "R-14 matrix"},
        headers=headers,
    )
    assert after.status_code == 200, after.text
    row_after = next(
        item for item in after.json()["rows"]
        if item["discipline_id"] == discipline_id
    )
    assert row_after["has_teacher"] is False
    assert row_after["has_student_access"] is False
    assert row_after["effective_students_count"] == 0
