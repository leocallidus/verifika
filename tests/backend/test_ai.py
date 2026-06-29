import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from uuid import uuid4
from datetime import datetime, timezone
from app.core.config import get_settings
from app.db.models import Question, AiChat, AiMessage

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def login(client, identifier: str, password: str = "Passw0rd!Test") -> str:
    r = await client.post("/api/auth/login", json={"identifier": identifier, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


async def test_ai_status_endpoint(client):
    settings = get_settings()
    orig = settings.ai_student_enabled
    try:
        settings.ai_student_enabled = True
        # Student login
        student_tok = await login(client, "petrova")
        sh = {"Authorization": f"Bearer {student_tok}"}
        r = await client.get("/api/v2/ai/status", headers=sh)
        assert r.status_code == 200
        assert r.json()["enabled"] is True
        assert isinstance(r.json()["chat_models_allowed"], list)

        # Teacher login
        teacher_tok = await login(client, "sidorov")
        th = {"Authorization": f"Bearer {teacher_tok}"}
        r = await client.get("/api/v2/ai/status", headers=th)
        assert r.status_code == 200
        assert r.json()["enabled"] is True
        assert r.json()["student_access_enabled"] is True
    finally:
        settings.ai_student_enabled = orig


async def test_ai_assistant_chats_crud(client):
    tok = await login(client, "sidorov")
    h = {"Authorization": f"Bearer {tok}"}

    # Create chat
    r = await client.post("/api/v2/ai/chats", json={}, headers=h)
    assert r.status_code == 200
    chat = r.json()
    chat_id = chat["chat_id"]
    assert chat["title"] is None  # Auto-naming is async/triggered later

    # List chats
    r = await client.get("/api/v2/ai/chats", headers=h)
    assert r.status_code == 200
    chats = r.json()
    assert any(c["chat_id"] == chat_id for c in chats)

    # Rename chat
    r = await client.patch(f"/api/v2/ai/chats/{chat_id}/title", json={"title": "Custom Title"}, headers=h)
    assert r.status_code == 200
    assert r.json()["title"] == "Custom Title"

    # Delete chat
    r = await client.delete(f"/api/v2/ai/chats/{chat_id}", headers=h)
    assert r.status_code == 204

    # List again: should be archived/hidden
    r = await client.get("/api/v2/ai/chats", headers=h)
    assert r.status_code == 200
    assert not any(c["chat_id"] == chat_id for c in r.json())


async def test_ai_assistant_permissions(client):
    tok_sidorov = await login(client, "sidorov")
    tok_petrova = await login(client, "petrova")

    h_sidorov = {"Authorization": f"Bearer {tok_sidorov}"}
    h_petrova = {"Authorization": f"Bearer {tok_petrova}"}

    # Sidorov creates chat
    r = await client.post("/api/v2/ai/chats", json={}, headers=h_sidorov)
    chat_id = r.json()["chat_id"]

    # Petrova tries to fetch messages of Sidorov's chat
    r = await client.get(f"/api/v2/ai/chats/{chat_id}/messages", headers=h_petrova)
    assert r.status_code == 403

    # Petrova tries to stream to Sidorov's chat
    r = await client.post(f"/api/v2/ai/chats/{chat_id}/stream", json={"content": "Hi"}, headers=h_petrova)
    assert r.status_code == 403


async def test_ai_assistant_student_disabled(client):
    settings = get_settings()
    original_student_enabled = settings.ai_student_enabled
    try:
        # Disable student access
        settings.ai_student_enabled = False

        student_tok = await login(client, "petrova")
        sh = {"Authorization": f"Bearer {student_tok}"}

        # Status endpoint is accessible, but shows enabled=False for student
        r = await client.get("/api/v2/ai/status", headers=sh)
        assert r.status_code == 200
        assert r.json()["enabled"] is False

        # Chat endpoints return 403
        r = await client.post("/api/v2/ai/chats", json={}, headers=sh)
        assert r.status_code == 403
    finally:
        settings.ai_student_enabled = original_student_enabled


async def mock_chat_stream_generator(*args, **kwargs):
    yield {"type": "delta", "content": "Hello "}
    yield {"type": "delta", "content": "from "}
    yield {"type": "delta", "content": "AI!"}
    yield {"type": "done", "tokens_used": 15, "model": "anthropic/claude-sonnet-4-5-20250929"}


@patch("app.services.ai_client.AiClient.chat_stream", side_effect=mock_chat_stream_generator)
@patch("app.services.ai_client.AiClient.generate_title", return_value="AI Generated Title")
async def test_ai_chat_streaming(mock_title, mock_stream, client):
    tok = await login(client, "sidorov")
    h = {"Authorization": f"Bearer {tok}"}

    # Create chat
    r = await client.post("/api/v2/ai/chats", json={}, headers=h)
    chat_id = r.json()["chat_id"]

    # Stream a message
    # Note: FastAPI streaming responses are fetched completely by testclient or can be parsed chunk-by-chunk.
    r = await client.post(f"/api/v2/ai/chats/{chat_id}/stream", json={"content": "Tell me a joke"}, headers=h)
    assert r.status_code == 200
    assert "text/event-stream" in r.headers["content-type"]

    # Parse SSE payload
    events = []
    for line in r.iter_lines():
        if line.startswith("data: "):
            import json
            events.append(json.loads(line[6:]))

    assert any(e["type"] == "delta" and e["content"] == "Hello " for e in events)
    assert any(e["type"] == "delta" and e["content"] == "AI!" for e in events)
    assert any(e["type"] == "title" and e["title"] == "AI Generated Title" for e in events)
    assert any(e["type"] == "done" and e["tokens_used"] == 15 for e in events)

    # Check that Sidorov's messages are persisted in DB
    r = await client.get(f"/api/v2/ai/chats/{chat_id}/messages", headers=h)
    assert r.status_code == 200
    msgs = r.json()
    assert len(msgs) == 2
    assert msgs[0]["role"] == "user"
    assert msgs[0]["content"] == "Tell me a joke"
    assert msgs[1]["role"] == "assistant"
    assert msgs[1]["content"] == "Hello from AI!"


MOCK_AI_QUESTIONS = {
    "questions": [
        {
            "text": "What is 2+2?",
            "difficulty": 1,
            "qtype": "single",
            "explanation": "Math basics",
            "options": [
                {"option_number": 1, "text": "4", "is_correct": True},
                {"option_number": 2, "text": "3", "is_correct": False},
                {"option_number": 3, "text": "5", "is_correct": False},
                {"option_number": 4, "text": "6", "is_correct": False}
            ]
        }
    ]
}


@patch("app.services.ai_client.AiClient.generate_structured", return_value=MOCK_AI_QUESTIONS)
async def test_ai_question_generation_and_review(mock_gen, client):
    tok = await login(client, "sidorov")
    h = {"Authorization": f"Bearer {tok}"}

    # Start generation
    r = await client.post(
        "/api/v2/ai/generate/questions",
        json={
            "discipline_id": 1,
            "topic_id": None,
            "topic_name_hint": "Math",
            "question_types": ["single"],
            "count": 1,
            "difficulty_min": 1,
            "difficulty_max": 2,
            "language": "en"
        },
        headers=h
    )
    assert r.status_code == 202
    task_id = r.json()["task_id"]

    # Poll status until done (wait a bit in async loop)
    import asyncio
    for _ in range(10):
        r = await client.get(f"/api/v2/ai/generate/tasks/{task_id}", headers=h)
        assert r.status_code == 200
        if r.json()["status"] in ("done", "error"):
            break
        await asyncio.sleep(0.5)

    assert r.json()["status"] == "done"
    assert r.json()["generated_count"] == 1

    # Check pending questions
    r = await client.get("/api/v2/ai/pending-questions", params={"discipline_id": 1}, headers=h)
    assert r.status_code == 200
    pending = r.json()
    assert len(pending) >= 1
    q = next(x for x in pending if x["text"] == "What is 2+2?")
    assert q["qtype"] == "single"
    assert len(q["options"]) == 4

    # Edit pending question
    q_id = q["question_id"]
    r = await client.patch(
        f"/api/v2/ai/pending-questions/{q_id}",
        json={
            "discipline_id": 1,
            "topic_id": None,
            "text": "What is 2+2? (Edited)",
            "difficulty": 2,
            "qtype": "single",
            "explanation": "Math basics edited",
            "options": [
                {"option_number": 1, "text": "4", "is_correct": True},
                {"option_number": 2, "text": "3", "is_correct": False},
                {"option_number": 3, "text": "5", "is_correct": False},
                {"option_number": 4, "text": "6", "is_correct": False}
            ]
        },
        headers=h
    )
    assert r.status_code == 200
    assert r.json()["text"] == "What is 2+2? (Edited)"

    # Approve pending question
    r = await client.post(f"/api/v2/ai/pending-questions/{q_id}/approve", headers=h)
    assert r.status_code == 200
    assert r.json()["ai_status"] == "approved"

    # Make sure it's no longer in pending list
    r = await client.get("/api/v2/ai/pending-questions", params={"discipline_id": 1}, headers=h)
    assert r.status_code == 200
    assert not any(x["question_id"] == q_id for x in r.json())


async def test_ai_question_generation_limits(client):
    tok = await login(client, "sidorov")
    h = {"Authorization": f"Bearer {tok}"}

    # Count > 50 should fail with 422
    r = await client.post(
        "/api/v2/ai/generate/questions",
        json={
            "discipline_id": 1,
            "question_types": ["single"],
            "count": 51,
            "difficulty_min": 1,
            "difficulty_max": 2,
            "language": "ru"
        },
        headers=h
    )
    assert r.status_code == 422


async def test_ai_student_generation_forbidden(client):
    student_tok = await login(client, "petrova")
    sh = {"Authorization": f"Bearer {student_tok}"}

    r = await client.post(
        "/api/v2/ai/generate/questions",
        json={
            "discipline_id": 1,
            "question_types": ["single"],
            "count": 5
        },
        headers=sh
    )
    assert r.status_code == 403


from app.services.ai_client import AiClient

async def test_ai_client_generate_structured_payload():
    settings = get_settings()
    client = AiClient(settings)

    mock_response = AsyncMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json = MagicMock(return_value={
        "choices": [
            {
                "message": {
                    "content": '{"questions": []}'
                }
            }
        ]
    })

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_response) as mock_post:
        result = await client.generate_structured(
            messages=[{"role": "user", "content": "test"}],
            model="test-model",
            json_schema={"type": "object"},
            temperature=0.7,
            max_tokens=100
        )

        assert result == {"questions": []}
        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        payload = kwargs.get("json", {})

        # Verify the key response-healing plugin requirement
        assert "plugins" in payload
        assert payload["plugins"] == [{"id": "response-healing"}]
        assert payload["response_format"]["type"] == "json_schema"


async def test_ai_v2_features(client):
    tok = await login(client, "sidorov")
    h = {"Authorization": f"Bearer {tok}"}

    # 1. Create a couple of chats
    r1 = await client.post("/api/v2/ai/chats", json={"first_message": "Hello first"}, headers=h)
    chat1_id = r1.json()["chat_id"]

    r2 = await client.post("/api/v2/ai/chats", json={"first_message": "Hello second"}, headers=h)
    chat2_id = r2.json()["chat_id"]

    # 2. Toggle pin chat1
    r_pin = await client.patch(f"/api/v2/ai/chats/{chat1_id}/pin", headers=h)
    assert r_pin.status_code == 200
    assert r_pin.json()["is_pinned"] is True

    # 3. List chats and verify chat1 is first because it's pinned
    r_list = await client.get("/api/v2/ai/chats", headers=h)
    assert r_list.status_code == 200
    chats = r_list.json()
    assert chats[0]["chat_id"] == chat1_id
    assert chats[0]["is_pinned"] is True

    # 4. Search chats
    r_search = await client.get("/api/v2/ai/chats/search?q=first", headers=h)
    assert r_search.status_code == 200
    search_results = r_search.json()
    assert any(c["chat_id"] == chat1_id for c in search_results)

    # 5. Export chat
    r_export_md = await client.get(f"/api/v2/ai/chats/{chat1_id}/export?fmt=md", headers=h)
    assert r_export_md.status_code == 200
    assert "text/markdown" in r_export_md.headers["content-type"]
    assert "Hello first" in r_export_md.text

    # 6. Usage endpoint for Sidorov (teacher: limits should be 0)
    r_usage = await client.get("/api/v2/ai/usage", headers=h)
    assert r_usage.status_code == 200
    usage = r_usage.json()
    assert usage["limit_messages"] == 0
    assert usage["limit_tokens"] == 0

    # 7. Student usage limits (limit=50 messages for student)
    settings = get_settings()
    settings.ai_student_enabled = True
    student_tok = await login(client, "petrova")
    sh = {"Authorization": f"Bearer {student_tok}"}

    r_student_usage = await client.get("/api/v2/ai/usage", headers=sh)
    assert r_student_usage.status_code == 200
    student_usage = r_student_usage.json()
    assert student_usage["limit_messages"] == 50

    # 8. Cascade delete message
    # Sidorov gets messages for chat1
    r_msgs = await client.get(f"/api/v2/ai/chats/{chat1_id}/messages", headers=h)
    assert r_msgs.status_code == 200
    msgs = r_msgs.json()
    assert len(msgs) > 0
    msg_id = msgs[0]["message_id"]

    r_del = await client.delete(f"/api/v2/ai/chats/{chat1_id}/messages/{msg_id}?cascade=after", headers=h)
    assert r_del.status_code == 204

    r_msgs_after = await client.get(f"/api/v2/ai/chats/{chat1_id}/messages", headers=h)
    assert r_msgs_after.status_code == 200
    assert len(r_msgs_after.json()) == 0


@patch("app.services.ai_client.AiClient.generate_structured", return_value=MOCK_AI_QUESTIONS)
async def test_ai_question_review_batch_and_regenerate(mock_gen, client):
    tok = await login(client, "sidorov")
    h = {"Authorization": f"Bearer {tok}"}

    # Start generation
    r = await client.post(
        "/api/v2/ai/generate/questions",
        json={
            "discipline_id": 1,
            "topic_id": None,
            "topic_name_hint": "Math",
            "question_types": ["single"],
            "count": 1,
            "difficulty_min": 1,
            "difficulty_max": 2,
            "language": "en"
        },
        headers=h
    )
    assert r.status_code == 202
    task_id = r.json()["task_id"]

    # Poll status until done
    for _ in range(10):
        r_status = await client.get(f"/api/v2/ai/generate/tasks/{task_id}", headers=h)
        assert r_status.status_code == 200
        if r_status.json()["status"] == "done":
            break
        import asyncio
        await asyncio.sleep(0.1)

    # Get pending questions
    r_pending = await client.get("/api/v2/ai/pending-questions?discipline_id=1", headers=h)
    assert r_pending.status_code == 200
    pending = r_pending.json()
    assert len(pending) > 0
    q_id = pending[0]["question_id"]

    # Regenerate draft
    r_regen = await client.post(
        f"/api/v2/ai/pending-questions/{q_id}/regenerate",
        json={"instruction": "make it harder"},
        headers=h
    )
    assert r_regen.status_code == 200
    new_q_id = r_regen.json()["question_id"]
    assert new_q_id != q_id

    # Batch approve
    r_batch_app = await client.post(
        "/api/v2/ai/pending-questions/batch-approve",
        json={"ids": [new_q_id]},
        headers=h
    )
    assert r_batch_app.status_code == 200
    assert len(r_batch_app.json()) == 1


@patch("app.services.ai_client.AiClient.chat_stream", side_effect=mock_chat_stream_generator)
async def test_ai_student_topic_preparation(mock_stream, client):
    # 0. Clean up any active sessions for petrova on topic 1001 to ensure hermeticity
    from app.db.session import SessionLocal
    from sqlalchemy import text
    async with SessionLocal() as db_session:
        student_id = (await db_session.execute(
            text("SELECT student_id FROM students WHERE login = 'petrova'")
        )).scalar_one()
        await db_session.execute(
            text("DELETE FROM test_sessions WHERE student_id = :student_id AND topic_id = 1001 AND completed_at IS NULL"),
            {"student_id": student_id}
        )
        await db_session.commit()

    # 1. Login as student
    student_tok = await login(client, "petrova")
    sh = {"Authorization": f"Bearer {student_tok}"}

    # 2. Call prepare on topic 1001 (topic_id=1001 exists from seed data)
    r = await client.post(
        "/api/v2/ai/student/topics/1001/prepare",
        json={"prompt": "Explain this topic"},
        headers=sh
    )
    assert r.status_code == 200
    res = r.json()
    assert res["topic_id"] == 1001
    assert "answer" in res
    assert "Hello from AI!" in res["answer"]

    # 3. Try to call prepare with a teacher account (should fail with 403)
    teacher_tok = await login(client, "sidorov")
    th = {"Authorization": f"Bearer {teacher_tok}"}
    r_teacher = await client.post(
        "/api/v2/ai/student/topics/1001/prepare",
        json={"prompt": "Explain this topic"},
        headers=th
    )
    assert r_teacher.status_code == 403

    # 4. Try to call prepare when ai_student_enabled is False
    settings = get_settings()
    original_student_enabled = settings.ai_student_enabled
    try:
        settings.ai_student_enabled = False
        r_disabled = await client.post(
            "/api/v2/ai/student/topics/1001/prepare",
            json={"prompt": "Explain this topic"},
            headers=sh
        )
        assert r_disabled.status_code == 403
    finally:
        settings.ai_student_enabled = original_student_enabled

    # 5. Active session constraint test
    r_start = await client.post("/api/student/topics/1001/tests/start", headers=sh)
    if r_start.status_code in (200, 201):
        try:
            r_active = await client.post(
                "/api/v2/ai/student/topics/1001/prepare",
                json={"prompt": "Explain this topic"},
                headers=sh
            )
            assert r_active.status_code == 409
            assert "AI-помощник доступен только до старта теста по теме" in r_active.text
        finally:
            async with SessionLocal() as db_session:
                await db_session.execute(
                    text("DELETE FROM test_sessions WHERE student_id = :student_id AND topic_id = 1001 AND completed_at IS NULL"),
                    {"student_id": student_id}
                )
                await db_session.commit()


