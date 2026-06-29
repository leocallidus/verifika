from unittest.mock import AsyncMock, patch

import pytest

from app.api.v2.ai_question_editor import ExplainReq, explain_question
from app.core.deps import CurrentUser


@pytest.mark.asyncio
async def test_explain_question_uses_ai_client_structured_contract():
    teacher = CurrentUser(
        id=1,
        email="teacher@example.test",
        role="teacher",
        full_name="Teacher",
    )

    with patch("app.api.v2.ai_question_editor.get_settings") as settings_mock:
        settings_mock.return_value.ai_api_key = "test-key"
        settings_mock.return_value.ai_generation_model = "test-model"

        with patch("app.api.v2.ai_question_editor.AiClient") as client_cls:
            client = client_cls.return_value
            client.generate_structured = AsyncMock(return_value={"explanation": "Пояснение"})

            result = await explain_question(
                ExplainReq(text="Что такое HTTP?", correct_answer_context="Протокол"),
                teacher=teacher,
            )

    assert result.explanation == "Пояснение"
    client.generate_structured.assert_awaited_once()
    kwargs = client.generate_structured.await_args.kwargs
    assert "prompt" not in kwargs
    assert kwargs["model"] == "test-model"
    assert kwargs["json_schema"]["required"] == ["explanation"]
    assert kwargs["messages"][0]["role"] == "system"
    assert kwargs["messages"][1]["role"] == "user"
