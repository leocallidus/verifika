from __future__ import annotations

from sqlalchemy import exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Discipline, GroupDiscipline, Student, StudentDiscipline


def assigned_discipline_ids_stmt(student_id: int):
    group_assignment = exists(
        select(1)
        .select_from(Student)
        .join(GroupDiscipline, GroupDiscipline.group_id == Student.group_id)
        .where(
            Student.student_id == student_id,
            Student.archived_at.is_(None),
            GroupDiscipline.discipline_id == Discipline.discipline_id,
        )
    )
    individual_assignment = exists(
        select(1)
        .select_from(StudentDiscipline)
        .where(
            StudentDiscipline.student_id == student_id,
            StudentDiscipline.discipline_id == Discipline.discipline_id,
        )
    )
    return (
        select(Discipline.discipline_id)
        .where(
            Discipline.archived_at.is_(None),
            or_(group_assignment, individual_assignment),
        )
    )


async def student_can_access_discipline(
    session: AsyncSession,
    student_id: int,
    discipline_id: int,
) -> bool:
    allowed = (await session.execute(
        assigned_discipline_ids_stmt(student_id).where(Discipline.discipline_id == discipline_id)
    )).scalar_one_or_none()
    return allowed is not None
