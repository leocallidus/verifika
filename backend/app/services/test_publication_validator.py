from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import Question


def _filled(value: object) -> bool:
    return bool(str(value or "").strip())


def _issue_prefix(question: Question) -> str:
    return f"Вопрос #{question.question_id}"


def _validate_option_numbers(question: Question, *, expected: list[int]) -> str | None:
    numbers = sorted(option.option_number for option in question.options)
    if numbers != expected:
        return f"{_issue_prefix(question)}: варианты должны иметь номера {expected[0]}..{expected[-1]} без повторов"
    return None


def _validate_question_answer_key(question: Question) -> list[str]:
    qtype = question.qtype or "single"
    issues: list[str] = []

    if qtype == "single":
        if len(question.options) != 4:
            issues.append(f"{_issue_prefix(question)}: для одиночного выбора нужно ровно 4 варианта")
        option_issue = _validate_option_numbers(question, expected=[1, 2, 3, 4])
        if option_issue:
            issues.append(option_issue)
        if sum(1 for option in question.options if option.is_correct) != 1:
            issues.append(f"{_issue_prefix(question)}: должен быть ровно один правильный вариант")
    elif qtype == "multi":
        if len(question.options) != 4:
            issues.append(f"{_issue_prefix(question)}: для множественного выбора нужно ровно 4 варианта")
        option_issue = _validate_option_numbers(question, expected=[1, 2, 3, 4])
        if option_issue:
            issues.append(option_issue)
        correct_count = sum(1 for option in question.options if option.is_correct)
        if correct_count < 1 or correct_count > 3:
            issues.append(f"{_issue_prefix(question)}: должно быть от 1 до 3 правильных вариантов")
    elif qtype == "short":
        has_pattern = _filled(getattr(question, "short_pattern", None))
        has_correct_option = any(option.is_correct and _filled(option.text) for option in question.options)
        if not has_pattern and not has_correct_option:
            issues.append(f"{_issue_prefix(question)}: нужно указать правильный ответ или регулярное выражение (regex pattern)")
    elif qtype == "numeric":
        correct_options = [option for option in question.options if option.is_correct]
        if not correct_options:
            issues.append(f"{_issue_prefix(question)}: должен быть указан правильный числовой ответ")
        else:
            val_str = correct_options[0].text
            try:
                float(val_str)
            except (TypeError, ValueError):
                issues.append(f"{_issue_prefix(question)}: правильный ответ должен быть числом")
    elif qtype == "match":
        pairs = question.match_pairs if isinstance(question.match_pairs, list) else []
        valid_pairs = [
            pair for pair in pairs
            if isinstance(pair, dict) and _filled(pair.get("left")) and _filled(pair.get("right"))
        ]
        if not valid_pairs:
            issues.append(f"{_issue_prefix(question)}: нужно заполнить пары сопоставления")
    elif qtype == "text":
        if not any(_filled(answer.answer) for answer in question.acceptable_answers):
            issues.append(f"{_issue_prefix(question)}: нужен хотя бы один допустимый текстовый ответ")
        if (question.text_mode or "string") not in ("string", "number"):
            issues.append(f"{_issue_prefix(question)}: некорректный режим текстового ответа")
    elif qtype == "order":
        if len(question.options) < 4 or len(question.options) > 15:
            issues.append(f"{_issue_prefix(question)}: для упорядочивания нужно от 4 до 15 вариантов")
        positions = [option.correct_position for option in question.options if option.correct_position is not None]
        if len(positions) != len(question.options):
            issues.append(f"{_issue_prefix(question)}: у каждого варианта должна быть позиция в правильном порядке")
        elif len(set(positions)) != len(positions):
            issues.append(f"{_issue_prefix(question)}: позиции правильного порядка не должны повторяться")
        elif sorted(positions) != list(range(1, len(question.options) + 1)):
            issues.append(
                f"{_issue_prefix(question)}: позиции правильного порядка должны покрывать 1..{len(question.options)}"
            )
    elif qtype == "bool":
        if question.correct_bool is None:
            issues.append(f"{_issue_prefix(question)}: нужно указать правильное значение Верно/Неверно")
    elif qtype == "cloze":
        if not question.cloze_blanks:
            issues.append(f"{_issue_prefix(question)}: нужны пропуски для cloze-вопроса")
        for blank in question.cloze_blanks:
            blank_label = f"{_issue_prefix(question)}, пропуск {blank.blank_index}"
            if blank.kind == "select":
                options = blank.options if isinstance(blank.options, list) else []
                if not options:
                    issues.append(f"{blank_label}: нужны варианты выбора")
                if blank.correct_index is None or blank.correct_index < 0 or blank.correct_index >= len(options):
                    issues.append(f"{blank_label}: некорректный индекс правильного варианта")
            elif blank.kind == "input":
                answers = blank.acceptable_answers if isinstance(blank.acceptable_answers, list) else []
                if not any(_filled(answer) for answer in answers):
                    issues.append(f"{blank_label}: нужен хотя бы один допустимый ответ")
            else:
                issues.append(f"{blank_label}: неизвестный тип пропуска")
    elif qtype == "file_upload":
        pass
    else:
        issues.append(f"{_issue_prefix(question)}: неизвестный тип вопроса {qtype}")

    return issues


async def validate_topic_test_publication(
    session: AsyncSession,
    *,
    topic_id: int,
    question_count: int,
) -> list[str]:
    """Return human-readable blockers for publishing a topic test."""
    active_questions = (await session.execute(
        select(Question)
        .where(
            Question.topic_id == topic_id,
            Question.archived_at.is_(None),
        )
        .order_by(Question.question_id.asc())
        .options(
            selectinload(Question.options),
            selectinload(Question.acceptable_answers),
            selectinload(Question.cloze_blanks),
        )
    )).scalars().all()

    issues: list[str] = []
    active_count = len(active_questions)
    if active_count == 0:
        issues.append("В теме нет активных вопросов")
    if active_count < question_count:
        issues.append(f"Недостаточно активных вопросов: доступно {active_count} из {question_count}")

    invalid_questions_count = 0
    for question in active_questions:
        question_issues = _validate_question_answer_key(question)
        if question_issues:
            invalid_questions_count += 1
            issues.extend(question_issues)

    valid_count = active_count - invalid_questions_count
    if valid_count < question_count:
        issues.append(f"Недостаточно вопросов с корректными ответами: доступно {valid_count} из {question_count}")

    return issues


def format_publication_issues(issues: list[str]) -> str:
    if not issues:
        return ""
    return "Тест нельзя включить: " + "; ".join(dict.fromkeys(issues))
