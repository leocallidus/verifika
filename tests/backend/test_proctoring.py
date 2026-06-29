from __future__ import annotations

import pytest
from sqlalchemy import text

from app.db.session import SessionLocal

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def login(client, identifier: str, password: str = "Passw0rd!Test") -> str:
    r = await client.post("/api/auth/login", json={"identifier": identifier, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


async def _active_session_id(client, headers) -> int:
    """Return an in-progress session id for the current student, starting one if needed."""
    r = await client.get("/api/student/sessions", headers=headers)
    active = next(
        (s for s in r.json().get("sessions", []) if s["status"] == "in_progress"),
        None,
    )
    if active:
        return active["session_id"]
    start = await client.post("/api/student/tests/1/start", headers=headers)
    assert start.status_code in (200, 201), start.text
    return start.json()["session_id"]


async def _max_teacher_notification_id(type_: str) -> int:
    async with SessionLocal() as session:
        value = (await session.execute(
            text(
                """
                SELECT COALESCE(MAX(notification_id), 0)
                FROM notifications
                WHERE user_role = 'teacher'
                  AND user_id = 1
                  AND event_type = :type
                """
            ),
            {"type": type_},
        )).scalar_one()
    return int(value or 0)


async def test_proctor_event_and_snapshot_flow(client):
    student_token = await login(client, "petrova")
    teacher_token = await login(client, "sidorov")
    sh = {"Authorization": f"Bearer {student_token}"}
    th = {"Authorization": f"Bearer {teacher_token}"}

    session_id = await _active_session_id(client, sh)

    # 1. Student posts a proctor event.
    event_resp = await client.post(
        f"/api/v2/student/sessions/{session_id}/proctor-events",
        json={
            "event_type": "tab_blur",
            "metadata": {"seconds_away": 15, "info": "switched window"},
        },
        headers=sh,
    )
    assert event_resp.status_code == 200, event_resp.text
    created_event = event_resp.json()
    assert created_event["event_type"] == "tab_blur"
    assert created_event["metadata"]["seconds_away"] == 15

    # 2. Student uploads a webcam snapshot (dummy JPEG).
    dummy_jpeg = b"\xff\xd8" + b"\x00" * 500
    snapshot_resp = await client.post(
        f"/api/v2/student/sessions/{session_id}/webcam-snapshot",
        files={"file": ("snapshot.jpg", dummy_jpeg, "image/jpeg")},
        headers=sh,
    )
    assert snapshot_resp.status_code == 200, snapshot_resp.text
    snapshot_result = snapshot_resp.json()
    assert snapshot_result["ok"] is True
    snapshot_event_id = snapshot_result["event_id"]
    photo_url = snapshot_result["photo_url"]
    assert f"/api/v2/proctor-snapshots/{snapshot_event_id}" in photo_url

    # 3. Teacher reads the proctor log and sees both events.
    log_resp = await client.get(
        f"/api/v2/teacher/sessions/{session_id}/proctor-log", headers=th
    )
    assert log_resp.status_code == 200, log_resp.text
    log_data = log_resp.json()
    assert log_data["session_id"] == session_id
    types = [e["event_type"] for e in log_data["events"]]
    assert "tab_blur" in types
    assert "webcam_snapshot" in types

    # 4. Teacher can fetch the snapshot image.
    img_resp = await client.get(f"/api/v2/proctor-snapshots/{snapshot_event_id}", headers=th)
    assert img_resp.status_code == 200, img_resp.text
    assert img_resp.content.startswith(b"\xff\xd8")

    # 5. Owning student can fetch their own snapshot.
    img_student_resp = await client.get(
        f"/api/v2/proctor-snapshots/{snapshot_event_id}", headers=sh
    )
    assert img_student_resp.status_code == 200, img_student_resp.text

    # 6. Anonymous access is rejected.
    img_anon_resp = await client.get(f"/api/v2/proctor-snapshots/{snapshot_event_id}")
    assert img_anon_resp.status_code == 401


async def test_proctor_violation_notifies_teacher(client):
    """A proctoring violation must reach the teacher as a notification, while
    benign telemetry (tab_focus) must not."""
    student_token = await login(client, "petrova")
    teacher_token = await login(client, "sidorov")
    sh = {"Authorization": f"Bearer {student_token}"}
    th = {"Authorization": f"Bearer {teacher_token}"}

    session_id = await _active_session_id(client, sh)

    before_max_id = await _max_teacher_notification_id("proctor_violation")

    # Violation → must notify.
    viol = await client.post(
        f"/api/v2/student/sessions/{session_id}/proctor-events",
        json={"event_type": "key_violation", "metadata": {"key": "PrintScreen"}},
        headers=sh,
    )
    assert viol.status_code == 200, viol.text

    # Benign return-to-tab → must NOT notify.
    benign = await client.post(
        f"/api/v2/student/sessions/{session_id}/proctor-events",
        json={"event_type": "tab_focus", "metadata": {"seconds_away": 2}},
        headers=sh,
    )
    assert benign.status_code == 200, benign.text

    after = await client.get("/api/teacher/notifications?limit=100", headers=th)
    assert after.status_code == 200, after.text
    proctor_notifs = [
        i for i in after.json()["items"]
        if i["type"] == "proctor_violation" and i["notification_id"] > before_max_id
    ]
    assert len(proctor_notifs) == 1, "exactly one new notification (violation only)"

    newest = proctor_notifs[0]
    assert newest["title"], "notification title must be populated"
    assert newest["link"] and newest["link"].startswith("/teacher/students/")
