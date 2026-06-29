import pytest
from datetime import datetime, timezone, timedelta
from sqlalchemy.sql import select

from app.db.models import DisciplineTopic, TeacherTopicTest, TeacherTopicTestGroupRule, Student
from app.services.topic_availability import calculate_topic_availability, TopicAvailability


class MockResult:
    def __init__(self, value):
        self._val = value

    def scalar_one(self):
        return self._val

    def scalar_one_or_none(self):
        return self._val

    def scalars(self):
        return self

    def first(self):
        return self._val


class MockSession:
    def __init__(self, mock_responses):
        self.mock_responses = mock_responses
        self.calls = []

    async def execute(self, query, *args, **kwargs):
        q_str = str(query).lower()
        self.calls.append(q_str)
        for pattern, response in self.mock_responses.items():
            if pattern in q_str:
                return MockResult(response)
        return MockResult(None)


@pytest.mark.asyncio
async def test_calculate_topic_availability_group_rule_override():
    # 1. Setup mock data
    topic = DisciplineTopic(topic_id=123, discipline_id=1, name="Test Topic")
    test = TeacherTopicTest(
        teacher_id=1,
        topic_id=123,
        question_count=3,
        attempts_allowed=2,
        is_enabled=True,
        # Default topic test window: in the past (already closed)
        available_from=datetime.now(timezone.utc) - timedelta(days=5),
        available_until=datetime.now(timezone.utc) - timedelta(days=2),
    )

    # Group override rule: window is in the future (starts in 1 day)
    future_from = datetime.now(timezone.utc) + timedelta(days=1)
    future_until = datetime.now(timezone.utc) + timedelta(days=3)
    future_rule = TeacherTopicTestGroupRule(
        topic_id=123,
        group_id=99,
        available_from=future_from,
        available_until=future_until,
    )

    mock_responses = {
        "count(*)": 5,                     # actual_questions_count
        "test_sessions.session_id": None,   # active_session_id
        "students.group_id": 99,           # student's group_id
        "teacher_topic_test_group_rules": future_rule,
    }

    session = MockSession(mock_responses)

    # 2. Run availability check
    availability = await calculate_topic_availability(
        session=session,
        student_id=456,
        topic=topic,
        test=test,
    )

    # 3. Assertions
    assert availability.available is False
    assert availability.unavailable_reason == "окно доступности еще не началось"
    assert availability.available_from == future_from
    assert availability.available_until == future_until
