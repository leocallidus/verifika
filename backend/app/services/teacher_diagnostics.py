from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    AttemptsPolicy,
    Discipline,
    DisciplineTopic,
    Group,
    GroupDiscipline,
    Question,
    Student,
    StudentDiscipline,
    TeacherDiscipline,
    TeacherTopicTest,
)
from app.services.student_test_modes import count_enabled_topic_tests, discipline_test_mode
from app.services.test_publication_validator import validate_topic_test_publication


def _aware_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _problem(
    severity: str,
    code: str,
    message: str,
    scope: str,
    *,
    topic_id: int | None = None,
) -> dict[str, Any]:
    return {
        "severity": severity,
        "code": code,
        "message": message,
        "scope": scope,
        "topic_id": topic_id,
    }


async def _assignment_counts(
    session: AsyncSession,
    discipline_id: int,
) -> tuple[int, int, int]:
    group_ids = (await session.execute(
        select(GroupDiscipline.group_id)
        .join(Group, Group.group_id == GroupDiscipline.group_id)
        .where(
            GroupDiscipline.discipline_id == discipline_id,
            Group.archived_at.is_(None),
        )
    )).scalars().all()
    individual_ids = (await session.execute(
        select(StudentDiscipline.student_id)
        .join(Student, Student.student_id == StudentDiscipline.student_id)
        .where(
            StudentDiscipline.discipline_id == discipline_id,
            Student.archived_at.is_(None),
        )
    )).scalars().all()
    group_student_ids = (await session.execute(
        select(Student.student_id)
        .join(GroupDiscipline, GroupDiscipline.group_id == Student.group_id)
        .join(Group, Group.group_id == Student.group_id)
        .where(
            GroupDiscipline.discipline_id == discipline_id,
            Student.archived_at.is_(None),
            Group.archived_at.is_(None),
        )
    )).scalars().all()
    assigned_students = set(individual_ids) | set(group_student_ids)
    return len(set(group_ids)), len(set(individual_ids)), len(assigned_students)


async def build_teacher_diagnostics(
    session: AsyncSession,
    *,
    teacher_id: int,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    rows = (await session.execute(
        select(Discipline, TeacherDiscipline)
        .join(TeacherDiscipline, TeacherDiscipline.discipline_id == Discipline.discipline_id)
        .where(
            TeacherDiscipline.teacher_id == teacher_id,
            Discipline.archived_at.is_(None),
        )
        .order_by(Discipline.name.asc())
    )).all()

    diagnostics: list[dict[str, Any]] = []
    for discipline, teacher_link in rows:
        discipline_id = discipline.discipline_id
        active_questions_count = int((await session.execute(
            select(func.count()).select_from(Question).where(
                Question.discipline_id == discipline_id,
                Question.archived_at.is_(None),
            )
        )).scalar_one() or 0)
        untopiced_questions_count = int((await session.execute(
            select(func.count()).select_from(Question).where(
                Question.discipline_id == discipline_id,
                Question.topic_id.is_(None),
                Question.archived_at.is_(None),
            )
        )).scalar_one() or 0)
        archived_questions_count = int((await session.execute(
            select(func.count()).select_from(Question).where(
                Question.discipline_id == discipline_id,
                Question.archived_at.is_not(None),
            )
        )).scalar_one() or 0)
        topics = (await session.execute(
            select(DisciplineTopic)
            .where(
                DisciplineTopic.discipline_id == discipline_id,
                DisciplineTopic.archived_at.is_(None),
            )
            .order_by(DisciplineTopic.sort_order.asc(), DisciplineTopic.name.asc())
        )).scalars().all()
        enabled_topic_tests_count = await count_enabled_topic_tests(session, discipline_id)
        test_mode = await discipline_test_mode(session, discipline_id)
        assigned_groups_count, individual_students_count, assigned_students_count = await _assignment_counts(
            session,
            discipline_id,
        )
        policy = (await session.execute(
            select(AttemptsPolicy).where(
                AttemptsPolicy.teacher_id == teacher_id,
                AttemptsPolicy.discipline_id == discipline_id,
            )
        )).scalar_one_or_none()

        discipline_problems: list[dict[str, Any]] = []
        if assigned_students_count == 0:
            discipline_problems.append(_problem(
                "warning",
                "no_assigned_students",
                "Нет активных студентов с назначенной дисциплиной",
                "students",
            ))
        if active_questions_count == 0:
            discipline_problems.append(_problem(
                "error",
                "no_active_questions",
                "В дисциплине нет активных вопросов",
                "questions",
            ))
        if archived_questions_count > 0:
            discipline_problems.append(_problem(
                "info",
                "archived_questions_ignored",
                f"Архивные вопросы не попадают в пул теста: {archived_questions_count}",
                "questions",
            ))

        general_test_available = False
        if test_mode == "discipline":
            general_test_available = True
            if active_questions_count < teacher_link.question_count:
                general_test_available = False
                discipline_problems.append(_problem(
                    "error",
                    "not_enough_general_questions",
                    f"Для общего теста нужно {teacher_link.question_count} вопросов, активно {active_questions_count}",
                    "test",
                ))
            if policy and policy.attempts_allowed == 0:
                general_test_available = False
                discipline_problems.append(_problem(
                    "warning",
                    "general_attempts_zero",
                    "Для общего теста задано 0 попыток",
                    "test",
                ))
            if policy and _aware_utc(policy.available_until) and now > _aware_utc(policy.available_until):
                general_test_available = False
                discipline_problems.append(_problem(
                    "warning",
                    "general_window_closed",
                    "Окно доступности общего теста закрыто",
                    "test",
                ))
            if policy and _aware_utc(policy.available_from) and now < _aware_utc(policy.available_from):
                discipline_problems.append(_problem(
                    "info",
                    "general_window_not_started",
                    "Окно доступности общего теста ещё не началось",
                    "test",
                ))
        else:
            discipline_problems.append(_problem(
                "info",
                "general_start_hidden",
                "Общий старт скрыт: дисциплина работает через тесты по темам",
                "test",
            ))

        topic_rows: list[dict[str, Any]] = []
        for topic in topics:
            topic_id = topic.topic_id
            questions_count = int((await session.execute(
                select(func.count()).select_from(Question).where(
                    Question.topic_id == topic_id,
                    Question.archived_at.is_(None),
                )
            )).scalar_one() or 0)
            topic_archived_count = int((await session.execute(
                select(func.count()).select_from(Question).where(
                    Question.topic_id == topic_id,
                    Question.archived_at.is_not(None),
                )
            )).scalar_one() or 0)
            test = (await session.execute(
                select(TeacherTopicTest).where(
                    TeacherTopicTest.teacher_id == teacher_id,
                    TeacherTopicTest.topic_id == topic_id,
                )
            )).scalar_one_or_none()

            topic_problems: list[dict[str, Any]] = []
            status = "not_configured"
            if test is None:
                topic_problems.append(_problem(
                    "warning",
                    "topic_test_missing",
                    "Тест по теме не настроен",
                    "topic",
                    topic_id=topic_id,
                ))
            elif not test.is_enabled:
                status = "disabled"
                topic_problems.append(_problem(
                    "warning",
                    "topic_test_disabled",
                    "Тест по теме выключен",
                    "topic",
                    topic_id=topic_id,
                ))
            else:
                status = "available"
                publication_issues = await validate_topic_test_publication(
                    session,
                    topic_id=topic_id,
                    question_count=test.question_count,
                )
                for issue in publication_issues:
                    topic_problems.append(_problem(
                        "error",
                        "topic_publication_blocker",
                        issue,
                        "topic",
                        topic_id=topic_id,
                    ))
                if publication_issues:
                    status = "blocked"
                elif _aware_utc(test.available_until) and now > _aware_utc(test.available_until):
                    status = "closed"
                    topic_problems.append(_problem(
                        "warning",
                        "topic_window_closed",
                        "Окно доступности теста по теме закрыто",
                        "topic",
                        topic_id=topic_id,
                    ))
                elif _aware_utc(test.available_from) and now < _aware_utc(test.available_from):
                    status = "scheduled"
                    topic_problems.append(_problem(
                        "info",
                        "topic_window_not_started",
                        "Окно доступности теста по теме ещё не началось",
                        "topic",
                        topic_id=topic_id,
                    ))
            if topic_archived_count > 0:
                topic_problems.append(_problem(
                    "info",
                    "topic_archived_questions_ignored",
                    f"Архивные вопросы темы не попадают в пул: {topic_archived_count}",
                    "topic",
                    topic_id=topic_id,
                ))
            topic_rows.append({
                "topic_id": topic_id,
                "name": topic.name,
                "questions_count": questions_count,
                "archived_questions_count": topic_archived_count,
                "test_configured": test is not None,
                "test_enabled": bool(test and test.is_enabled),
                "test_question_count": test.question_count if test else None,
                "time_limit_minutes": test.time_limit_minutes if test else None,
                "available_from": test.available_from if test else None,
                "available_until": test.available_until if test else None,
                "status": status,
                "problems": topic_problems,
            })

        diagnostics.append({
            "discipline_id": discipline_id,
            "name": discipline.name,
            "description": discipline.description,
            "test_mode": test_mode,
            "active_questions_count": active_questions_count,
            "untopiced_questions_count": untopiced_questions_count,
            "archived_questions_count": archived_questions_count,
            "topics_count": len(topics),
            "enabled_topic_tests_count": enabled_topic_tests_count,
            "assigned_groups_count": assigned_groups_count,
            "individually_assigned_students_count": individual_students_count,
            "assigned_students_count": assigned_students_count,
            "general_question_count": teacher_link.question_count,
            "general_time_limit_minutes": teacher_link.time_limit_minutes,
            "general_test_available": general_test_available,
            "topics": topic_rows,
            "problems": discipline_problems,
        })

    return {
        "generated_at": now,
        "disciplines": diagnostics,
    }
