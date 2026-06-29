import pytest
from uuid import uuid4

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def login(client, identifier: str, password: str = "Passw0rd!Test") -> str:
    r = await client.post("/api/auth/login", json={"identifier": identifier, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


async def test_login_teacher_ok(client):
    r = await client.post("/api/auth/login", json={"identifier": "sidorov", "password": "Passw0rd!Test"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user"]["role"] == "teacher"


async def test_login_bad_password(client):
    r = await client.post("/api/auth/login", json={"identifier": "sidorov", "password": "wrong"})
    assert r.status_code == 401


async def test_no_token_protected(client):
    r = await client.get("/api/teacher/disciplines")
    assert r.status_code == 401


async def test_double_start_session_409(client):
    tok = await login(client, "petrova")
    h = {"Authorization": f"Bearer {tok}"}
    r1 = await client.post("/api/student/tests/1/start", headers=h)
    assert r1.status_code in (201, 409)
    r2 = await client.post("/api/student/tests/1/start", headers=h)
    assert r2.status_code == 409


async def test_student_start_no_is_correct_leaked(client):
    tok = await login(client, "petrova")
    h = {"Authorization": f"Bearer {tok}"}
    await client.post("/api/student/tests/1/start", headers=h)
    sess = (await client.get("/api/student/sessions", headers=h)).json()["sessions"]
    active = next((s for s in sess if s["status"] == "in_progress"), None)
    if active is None:
        pytest.skip("no active session (likely finished by another test)")
    r = await client.get(f"/api/student/sessions/{active['session_id']}/resume", headers=h)
    assert r.status_code == 200
    assert "is_correct" not in r.text, "leaked answer key"


async def test_teacher_student_detail_other_role_403(client):
    tok = await login(client, "petrova")
    r = await client.get("/api/teacher/students/1", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 403


async def test_teacher_creates_question_strict_4_options(client):
    tok = await login(client, "sidorov")
    h = {"Authorization": f"Bearer {tok}"}

    r = await client.post(
        "/api/teacher/questions",
        json={
            "discipline_id": 1, "text": "x", "difficulty": 1,
            "options": [{"option_number": 1, "text": "a", "is_correct": True}],
        },
        headers=h,
    )
    assert r.status_code == 400

    r = await client.post(
        "/api/teacher/questions",
        json={
            "discipline_id": 1, "text": "x", "difficulty": 1,
            "options": [
                {"option_number": 1, "text": "a", "is_correct": True},
                {"option_number": 2, "text": "b", "is_correct": True},
                {"option_number": 3, "text": "c", "is_correct": False},
                {"option_number": 4, "text": "d", "is_correct": False},
            ],
        },
        headers=h,
    )
    assert r.status_code == 400


async def test_teacher_forbidden_discipline(client):
    tok = await login(client, "sidorov")
    h = {"Authorization": f"Bearer {tok}"}
    r = await client.post(
        "/api/teacher/questions",
        json={
            "discipline_id": 9999, "text": "x", "difficulty": 1,
            "options": [
                {"option_number": 1, "text": "a", "is_correct": True},
                {"option_number": 2, "text": "b", "is_correct": False},
                {"option_number": 3, "text": "c", "is_correct": False},
                {"option_number": 4, "text": "d", "is_correct": False},
            ],
        },
        headers=h,
    )
    assert r.status_code == 403


async def test_topic_crud_question_filter_topic_test_and_student_start(client):
    teacher_token = await login(client, "sidorov")
    student_token = await login(client, "petrova")
    th = {"Authorization": f"Bearer {teacher_token}"}
    sh = {"Authorization": f"Bearer {student_token}"}
    topic_name = f"ООП в Java {uuid4().hex[:8]}"

    r = await client.post(
        "/api/v2/teacher/disciplines/1/topics",
        json={"name": topic_name, "description": "Классы и объекты", "sort_order": 10},
        headers=th,
    )
    assert r.status_code == 201, r.text
    topic = r.json()
    topic_id = topic["topic_id"]

    duplicate = await client.post(
        "/api/v2/teacher/disciplines/1/topics",
        json={"name": topic_name, "description": None, "sort_order": 20},
        headers=th,
    )
    assert duplicate.status_code == 409

    q_payload = {
        "discipline_id": 1,
        "topic_id": topic_id,
        "text": f"Что такое инкапсуляция? {uuid4().hex[:6]}",
        "difficulty": 1,
        "qtype": "single",
        "options": [
            {"option_number": 1, "text": "Сокрытие состояния", "is_correct": True},
            {"option_number": 2, "text": "Сортировка", "is_correct": False},
            {"option_number": 3, "text": "JOIN", "is_correct": False},
            {"option_number": 4, "text": "Индекс", "is_correct": False},
        ],
        "tag_ids": [],
    }
    created_q = await client.post("/api/teacher/questions", json=q_payload, headers=th)
    assert created_q.status_code == 201, created_q.text
    question_id = created_q.json()["question_id"]

    topic_questions = await client.get(
        "/api/v2/teacher/questions",
        params={"discipline_id": 1, "topic_id": topic_id},
        headers=th,
    )
    assert topic_questions.status_code == 200, topic_questions.text
    assert any(q["question_id"] == question_id and q["topic_id"] == topic_id for q in topic_questions.json())

    none_questions = await client.get(
        "/api/v2/teacher/questions",
        params={"discipline_id": 1, "topic": "none"},
        headers=th,
    )
    assert none_questions.status_code == 200
    assert all(q["topic_id"] is None for q in none_questions.json())

    test_cfg = await client.put(
        f"/api/v2/teacher/topics/{topic_id}/test",
        json={
            "is_enabled": True,
            "question_count": 1,
            "time_limit_minutes": 20,
            "attempts_allowed": 2,
            "available_from": None,
            "available_until": None,
            "shuffle_seed": True,
            "show_correct_after_finish": True,
        },
        headers=th,
    )
    assert test_cfg.status_code == 200, test_cfg.text
    assert test_cfg.json()["question_count"] == 1

    student_topics = await client.get("/api/student/disciplines/1/topics", headers=sh)
    assert student_topics.status_code == 200, student_topics.text
    student_topic = next((t for t in student_topics.json()["topics"] if t["topic_id"] == topic_id), None)
    assert student_topic is not None
    assert student_topic["available"] is True

    started = await client.post(f"/api/student/topics/{topic_id}/tests/start", headers=sh)
    assert started.status_code == 201, started.text
    body = started.json()
    assert len(body["questions"]) == 1
    assert body["questions"][0]["question_id"] == question_id


async def test_discipline_and_topic_images_and_csv_export(client):
    teacher_token = await login(client, "sidorov")
    th = {"Authorization": f"Bearer {teacher_token}"}
    topic_name = f"SQL JOIN {uuid4().hex[:8]}"

    topic_resp = await client.post(
        "/api/v2/teacher/disciplines/1/topics",
        json={"name": topic_name, "description": "JOIN", "sort_order": 30},
        headers=th,
    )
    assert topic_resp.status_code == 201, topic_resp.text
    topic_id = topic_resp.json()["topic_id"]

    png = (
        b"\x89PNG\r\n\x1a\n"
        b"\x00\x00\x00\rIHDR"
        b"\x00\x00\x00@\x00\x00\x00@\x08\x02\x00\x00\x00"
        b"\x25\x0b\xe6\x89"
        b"\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    disc_img = await client.post(
        "/api/v2/teacher/disciplines/1/image",
        files={"file": ("discipline.png", png, "image/png")},
        headers=th,
    )
    assert disc_img.status_code == 200, disc_img.text
    image_url = disc_img.json()["url"]
    got_disc_img = await client.get(image_url, headers=th)
    assert got_disc_img.status_code == 200

    topic_img = await client.post(
        f"/api/v2/teacher/topics/{topic_id}/image",
        files={"file": ("topic.png", png, "image/png")},
        headers=th,
    )
    assert topic_img.status_code == 200, topic_img.text
    got_topic_img = await client.get(topic_img.json()["url"], headers=th)
    assert got_topic_img.status_code == 200

    export = await client.get("/api/v2/teacher/questions/export", headers=th)
    assert export.status_code == 200
    header = export.text.splitlines()[0]
    assert "topic_id" in header
    assert "topic_name" in header

    delete_topic_image = await client.delete(f"/api/v2/teacher/topics/{topic_id}/image", headers=th)
    assert delete_topic_image.status_code == 204
    delete_disc_image = await client.delete("/api/v2/teacher/disciplines/1/image", headers=th)
    assert delete_disc_image.status_code == 204
