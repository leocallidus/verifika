import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.api.v2.grading import add_session_comment
from app.schemas.v2 import SessionCommentIn
from app.db.models import TestSession

TestSession.__test__ = False

@pytest.mark.asyncio
async def test_add_session_comment_success():
    # 1. Setup mock payload and user
    payload = SessionCommentIn(body="Отличная попытка!")
    user = MagicMock()
    user.id = 42

    # 2. Mock TestSession and DB session
    sess = TestSession(
        session_id=1,
        teacher_id=42,
        discipline_id=2,
        topic_id=None,
        student_id=10,
        comment=None
    )
    
    db_session = AsyncMock()
    
    # Mock execute results
    mock_execute_result = MagicMock()
    mock_execute_result.scalar_one_or_none = MagicMock(return_value="Программирование")
    db_session.execute = AsyncMock(return_value=mock_execute_result)

    # We patch _ensure_teacher_owns_session to return our mock session
    with patch("app.api.v2.grading._ensure_teacher_owns_session", return_value=sess) as mock_ensure, \
         patch("app.api.v2.grading.store_and_publish", new_callable=AsyncMock) as mock_store_publish:
        
        # 3. Call the endpoint function
        res = await add_session_comment(
            session_id=1,
            payload=payload,
            user=user,
            session=db_session
        )

        # 4. Assertions
        mock_ensure.assert_called_once_with(db_session, 42, 1)
        assert sess.comment == "Отличная попытка!"
        db_session.commit.assert_called_once()
        mock_store_publish.assert_called_once()
        assert res.session_id == 1
        assert res.comment == "Отличная попытка!"


@pytest.mark.asyncio
async def test_add_session_comment_empty_clears_comment():
    payload = SessionCommentIn(body="   ")
    user = MagicMock()
    user.id = 42

    sess = TestSession(
        session_id=1,
        teacher_id=42,
        discipline_id=2,
        topic_id=None,
        student_id=10,
        comment="Старый комментарий"
    )
    
    db_session = AsyncMock()
    mock_execute_result = MagicMock()
    mock_execute_result.scalar_one_or_none = MagicMock(return_value="Программирование")
    db_session.execute = AsyncMock(return_value=mock_execute_result)

    with patch("app.api.v2.grading._ensure_teacher_owns_session", return_value=sess) as mock_ensure, \
         patch("app.api.v2.grading.store_and_publish", new_callable=AsyncMock) as mock_store_publish:
        
        res = await add_session_comment(
            session_id=1,
            payload=payload,
            user=user,
            session=db_session
        )

        assert sess.comment is None
        db_session.commit.assert_called_once()
        # Since comment is cleared/empty, we should not notify the student
        mock_store_publish.assert_not_called()
        assert res.session_id == 1
        assert res.comment is None
