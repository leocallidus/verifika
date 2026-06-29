from __future__ import annotations

from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import DisciplineTopic, TeacherTopicTest

StudentTestMode = Literal["discipline", "topic"]


async def count_enabled_topic_tests(
    session: AsyncSession,
    discipline_id: int,
) -> int:
    return int((await session.execute(
        select(func.count()).select_from(TeacherTopicTest)
        .join(DisciplineTopic, DisciplineTopic.topic_id == TeacherTopicTest.topic_id)
        .where(
            DisciplineTopic.discipline_id == discipline_id,
            DisciplineTopic.archived_at.is_(None),
            TeacherTopicTest.is_enabled.is_(True),
        )
    )).scalar_one() or 0)


async def discipline_test_mode(
    session: AsyncSession,
    discipline_id: int,
) -> StudentTestMode:
    enabled_topic_tests = await count_enabled_topic_tests(session, discipline_id)
    return "topic" if enabled_topic_tests > 0 else "discipline"
