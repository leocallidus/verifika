import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.api.student import student_session_recommendations
from app.db.models import TestSession, Discipline, DisciplineTopic, TeacherTopicTest, Question
from app.schemas.student import SessionRecommendationsOut

TestSession.__test__ = False

@pytest.mark.asyncio
async def test_student_session_recommendations_success():
    # 1. Setup mock user
    user = MagicMock()
    user.id = 100

    # 2. Mock db session & execute results
    db_session = AsyncMock()

    sess = TestSession(
        session_id=1,
        student_id=100,
        discipline_id=10,
        teacher_id=5,
        topic_id=1,
        policy_version_id=None,
        status="completed",
    )

    questions_calls = []
    async def mock_execute(query):
        sql_str = str(query).lower()
        mock_res = MagicMock()
        
        if "from test_sessions" in sql_str:
            mock_res.scalar_one_or_none = MagicMock(return_value=sess)
        elif "from disciplines" in sql_str:
            mock_res.scalar_one_or_none = MagicMock(return_value="Высшая математика")
        elif "from teacher_topic_tests" in sql_str:
            test_settings = MagicMock()
            test_settings.passing_score_percent = 70
            test_settings.grade_scale = "5_point"
            test_settings.topic_id = 1
            mock_res.scalar_one_or_none = MagicMock(return_value=test_settings)
            mock_res.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[1, 2])))
        elif "from student_answers" in sql_str:
            mock_res.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        elif "from discipline_topics" in sql_str:
            topic1 = DisciplineTopic(topic_id=1, name="Topic 1", description="Description 1", discipline_id=10)
            topic2 = DisciplineTopic(topic_id=2, name="Topic 2", description="Description 2", discipline_id=10)
            if "topic_id in" in sql_str:
                mock_res.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[topic1])))
            else:
                mock_res.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[topic1, topic2])))
        elif "from questions" in sql_str:
            if not questions_calls:
                questions_calls.append(1)
                mock_res.all = MagicMock(return_value=[(101, 1)])
            else:
                mock_res.all = MagicMock(return_value=[(101, 1), (102, 1)])
        elif "from discipline_topic_images" in sql_str:
            mock_res.all = MagicMock(return_value=[])
        else:
            mock_res.scalar_one_or_none = MagicMock(return_value=None)
            mock_res.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
            mock_res.all = MagicMock(return_value=[])
            
        return mock_res

    db_session.execute = mock_execute

    # Mock grade_session to return some question correctness details
    mock_breakdown = MagicMock()
    mock_breakdown.score = 5
    mock_breakdown.max_score = 10
    mock_breakdown.percent = 50.0
    
    q1 = {"question_id": 101, "is_correct": False}
    q2 = {"question_id": 102, "is_correct": True}
    mock_breakdown.per_question = [q1, q2]

    # Mock session_question_snapshots to return question snapshots
    class MockSnapshotItem:
        def __init__(self, qid, text):
            self.question_id = qid
            self.snapshot = {"text": text}
    
    mock_snapshots = [
        MockSnapshotItem(101, "Что такое производная функции в точке?"),
        MockSnapshotItem(102, "Чему равен интеграл от x?"),
    ]

    with patch("app.api.student.grade_session", new_callable=AsyncMock, return_value=mock_breakdown), \
         patch("app.api.student.session_question_snapshots", new_callable=AsyncMock, return_value=mock_snapshots):
        
        res = await student_session_recommendations(
            session_id=1,
            user=user,
            session=db_session
        )
        
        assert isinstance(res, SessionRecommendationsOut)
        assert res.session_id == 1
        assert res.discipline_name == "Высшая математика"
        assert len(res.weak_topics) == 1
        assert res.weak_topics[0].topic_name == "Topic 1"
        assert res.weak_topics[0].wrong_questions_count == 1
        assert res.weak_topics[0].total_questions_count == 2
        assert len(res.review_hints) == 1
        assert "Что такое производная" in res.review_hints[0]
