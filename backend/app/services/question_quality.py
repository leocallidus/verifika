from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field as dataclass_field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import Discipline, DisciplineTopic, Question


MIN_QUESTION_TEXT_CHARS = 12
MIN_OPTION_TEXT_CHARS = 1


@dataclass(frozen=True)
class QualityIssue:
    code: str
    severity: str
    message: str
    field: str | None = None
    duplicate_with: list[int] = dataclass_field(default_factory=list)


@dataclass(frozen=True)
class QualityQuestion:
    question_id: int
    discipline_id: int
    discipline_name: str
    topic_id: int | None
    topic_name: str | None
    qtype: str
    text: str
    archived: bool
    issues: list[QualityIssue]


@dataclass(frozen=True)
class QualitySummary:
    total_questions: int
    checked_questions: int
    questions_with_issues: int
    issue_counts: dict[str, int]
    severity_counts: dict[str, int]
    duplicate_groups: int


@dataclass(frozen=True)
class QualityReport:
    summary: QualitySummary
    questions: list[QualityQuestion]


def _filled(value: object) -> bool:
    return bool(str(value or "").strip())


def _norm_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().casefold())


def _option_numbers(question: Question) -> list[int]:
    return [option.option_number for option in question.options]


def _add_option_number_issues(question: Question, issues: list[QualityIssue], *, exact: list[int] | None = None) -> None:
    numbers = _option_numbers(question)
    if len(numbers) != len(set(numbers)):
        issues.append(QualityIssue(
            code="invalid_options",
            severity="error",
            field="options",
            message="Номера вариантов ответа повторяются",
        ))
    if exact is not None and sorted(numbers) != exact:
        issues.append(QualityIssue(
            code="invalid_options",
            severity="error",
            field="options",
            message=f"Варианты должны иметь номера {exact[0]}..{exact[-1]} без пропусков",
        ))


def _check_common(question: Question) -> list[QualityIssue]:
    issues: list[QualityIssue] = []
    if len((question.text or "").strip()) < MIN_QUESTION_TEXT_CHARS:
        issues.append(QualityIssue(
            code="short_text",
            severity="warning",
            field="text",
            message=f"Формулировка короче {MIN_QUESTION_TEXT_CHARS} символов",
        ))

    empty_options = [
        option.option_number
        for option in question.options
        if len((option.text or "").strip()) < MIN_OPTION_TEXT_CHARS
    ]
    if empty_options:
        issues.append(QualityIssue(
            code="invalid_options",
            severity="error",
            field="options",
            message=f"Пустые варианты ответа: {', '.join(map(str, empty_options))}",
        ))

    normalized_options = [_norm_text(option.text or "") for option in question.options if _filled(option.text)]
    duplicate_option_texts = [text for text, count in Counter(normalized_options).items() if count > 1]
    if duplicate_option_texts:
        issues.append(QualityIssue(
            code="invalid_options",
            severity="warning",
            field="options",
            message="Есть повторяющиеся тексты вариантов ответа",
        ))

    return issues


def _check_answer_key(question: Question) -> list[QualityIssue]:
    qtype = question.qtype or "single"
    issues: list[QualityIssue] = []

    if qtype == "single":
        if len(question.options) != 4:
            issues.append(QualityIssue("invalid_options", "error", "Для одиночного выбора нужно ровно 4 варианта", "options"))
        _add_option_number_issues(question, issues, exact=[1, 2, 3, 4])
        if sum(1 for option in question.options if option.is_correct) != 1:
            issues.append(QualityIssue("missing_correct_answer", "error", "Должен быть ровно один правильный вариант", "options"))
    elif qtype == "multi":
        if len(question.options) != 4:
            issues.append(QualityIssue("invalid_options", "error", "Для множественного выбора нужно ровно 4 варианта", "options"))
        _add_option_number_issues(question, issues, exact=[1, 2, 3, 4])
        correct_count = sum(1 for option in question.options if option.is_correct)
        if correct_count < 1 or correct_count > 3:
            issues.append(QualityIssue("missing_correct_answer", "error", "Должно быть от 1 до 3 правильных вариантов", "options"))
    elif qtype == "short":
        has_pattern = _filled(getattr(question, "short_pattern", None))
        has_correct_option = any(option.is_correct and _filled(option.text) for option in question.options)
        if not has_pattern and not has_correct_option:
            issues.append(QualityIssue("missing_correct_answer", "error", "Нужно указать правильный ответ или регулярное выражение (regex pattern)", "options"))
    elif qtype == "numeric":
        correct_options = [option for option in question.options if option.is_correct]
        if not correct_options:
            issues.append(QualityIssue("missing_correct_answer", "error", "Должен быть указан правильный числовой ответ", "options"))
        else:
            val_str = correct_options[0].text
            try:
                float(val_str)
            except (TypeError, ValueError):
                issues.append(QualityIssue("invalid_options", "error", "Правильный ответ должен быть числом", "options"))
        if question.numeric_tolerance is not None and float(question.numeric_tolerance) < 0:
            issues.append(QualityIssue("invalid_options", "error", "Числовой допуск не может быть отрицательным", "numeric_tolerance"))
    elif qtype == "match":
        pairs = question.match_pairs if isinstance(question.match_pairs, list) else []
        valid_pairs = [
            pair for pair in pairs
            if isinstance(pair, dict) and _filled(pair.get("left")) and _filled(pair.get("right"))
        ]
        if not valid_pairs:
            issues.append(QualityIssue("missing_correct_answer", "error", "Нужно заполнить пары сопоставления", "match_pairs"))
        pair_keys = [_norm_text(f"{pair.get('left', '')}\n{pair.get('right', '')}") for pair in valid_pairs]
        if any(count > 1 for count in Counter(pair_keys).values()):
            issues.append(QualityIssue("invalid_options", "warning", "Есть повторяющиеся пары сопоставления", "match_pairs"))
    elif qtype == "text":
        if not any(_filled(answer.answer) for answer in question.acceptable_answers):
            issues.append(QualityIssue("missing_correct_answer", "error", "Нужен хотя бы один допустимый текстовый ответ", "acceptable_answers"))
        if (question.text_mode or "string") not in ("string", "number"):
            issues.append(QualityIssue("invalid_options", "error", "Некорректный режим текстового ответа", "text_mode"))
    elif qtype == "order":
        if len(question.options) < 4 or len(question.options) > 15:
            issues.append(QualityIssue("invalid_options", "error", "Для упорядочивания нужно от 4 до 15 вариантов", "options"))
        positions = [option.correct_position for option in question.options if option.correct_position is not None]
        if len(positions) != len(question.options):
            issues.append(QualityIssue("missing_correct_answer", "error", "У каждого варианта должна быть позиция в правильном порядке", "options"))
        elif len(set(positions)) != len(positions):
            issues.append(QualityIssue("invalid_options", "error", "Позиции правильного порядка не должны повторяться", "options"))
        elif sorted(positions) != list(range(1, len(question.options) + 1)):
            issues.append(QualityIssue("invalid_options", "error", f"Позиции должны покрывать 1..{len(question.options)}", "options"))
    elif qtype == "bool":
        if question.correct_bool is None:
            issues.append(QualityIssue("missing_correct_answer", "error", "Нужно указать правильное значение Верно/Неверно", "correct_bool"))
    elif qtype == "cloze":
        if not question.cloze_blanks:
            issues.append(QualityIssue("missing_correct_answer", "error", "Нужны пропуски для cloze-вопроса", "cloze_blanks"))
        for blank in question.cloze_blanks:
            if blank.kind == "select":
                options = blank.options if isinstance(blank.options, list) else []
                if not options:
                    issues.append(QualityIssue("invalid_options", "error", f"Пропуск {blank.blank_index}: нужны варианты выбора", "cloze_blanks"))
                if blank.correct_index is None or blank.correct_index < 0 or blank.correct_index >= len(options):
                    issues.append(QualityIssue("missing_correct_answer", "error", f"Пропуск {blank.blank_index}: некорректный индекс правильного варианта", "cloze_blanks"))
            elif blank.kind == "input":
                answers = blank.acceptable_answers if isinstance(blank.acceptable_answers, list) else []
                if not any(_filled(answer) for answer in answers):
                    issues.append(QualityIssue("missing_correct_answer", "error", f"Пропуск {blank.blank_index}: нужен хотя бы один допустимый ответ", "cloze_blanks"))
            else:
                issues.append(QualityIssue("invalid_options", "error", f"Пропуск {blank.blank_index}: неизвестный тип пропуска", "cloze_blanks"))
    elif qtype == "file_upload":
        # Ручная оценка — автоматической проверки не требует
        pass
    else:
        issues.append(QualityIssue("invalid_options", "error", f"Неизвестный тип вопроса: {qtype}", "qtype"))

    return issues


def _question_issues(question: Question) -> list[QualityIssue]:
    return _check_common(question) + _check_answer_key(question)


async def build_question_quality_report(
    session: AsyncSession,
    *,
    teacher_id: int,
    discipline_id: int | None = None,
    topic_id: int | None = None,
    topic_none: bool = False,
    archived_only: bool = False,
    include_archived: bool = False,
) -> QualityReport:
    stmt = (
        select(Question)
        .where(
            Question.discipline_id.in_(
                text("SELECT discipline_id FROM teacher_disciplines WHERE teacher_id = :tid").bindparams(tid=teacher_id)
            )
        )
        .order_by(Question.discipline_id, Question.question_id)
        .options(
            selectinload(Question.options),
            selectinload(Question.acceptable_answers),
            selectinload(Question.cloze_blanks),
        )
    )
    if discipline_id is not None:
        stmt = stmt.where(Question.discipline_id == discipline_id)
    if topic_id is not None:
        stmt = stmt.where(Question.topic_id == topic_id)
    elif topic_none:
        stmt = stmt.where(Question.topic_id.is_(None))
    if archived_only:
        stmt = stmt.where(Question.archived_at.is_not(None))
    elif not include_archived:
        stmt = stmt.where(Question.archived_at.is_(None))

    questions = (await session.execute(stmt)).scalars().all()
    q_ids = [question.question_id for question in questions]

    discipline_ids = sorted({question.discipline_id for question in questions})
    discipline_names: dict[int, str] = {}
    if discipline_ids:
        rows = (await session.execute(
            select(Discipline.discipline_id, Discipline.name).where(Discipline.discipline_id.in_(discipline_ids))
        )).all()
        discipline_names = {row.discipline_id: row.name for row in rows}

    topic_ids = sorted({question.topic_id for question in questions if question.topic_id is not None})
    topic_names: dict[int, str] = {}
    if topic_ids:
        rows = (await session.execute(
            select(DisciplineTopic.topic_id, DisciplineTopic.name).where(DisciplineTopic.topic_id.in_(topic_ids))
        )).all()
        topic_names = {row.topic_id: row.name for row in rows}

    duplicate_map: dict[int, list[int]] = defaultdict(list)
    duplicate_groups = 0
    by_text: dict[tuple[int, str], list[int]] = defaultdict(list)
    for question in questions:
        normalized = _norm_text(question.text or "")
        if normalized:
            by_text[(question.discipline_id, normalized)].append(question.question_id)
    for ids in by_text.values():
        if len(ids) > 1:
            duplicate_groups += 1
            for question_id in ids:
                duplicate_map[question_id] = [other_id for other_id in ids if other_id != question_id]

    rows: list[QualityQuestion] = []
    issue_counts: Counter[str] = Counter()
    severity_counts: Counter[str] = Counter()

    for question in questions:
        issues = _question_issues(question)
        duplicate_with = duplicate_map.get(question.question_id, [])
        if duplicate_with:
            issues.append(QualityIssue(
                code="duplicate_text",
                severity="warning",
                field="text",
                message=f"Формулировка совпадает с вопросами: {', '.join(f'#{qid}' for qid in duplicate_with)}",
                duplicate_with=duplicate_with,
            ))
        if not issues:
            continue
        for issue in issues:
            issue_counts[issue.code] += 1
            severity_counts[issue.severity] += 1
        rows.append(QualityQuestion(
            question_id=question.question_id,
            discipline_id=question.discipline_id,
            discipline_name=discipline_names.get(question.discipline_id, f"#{question.discipline_id}"),
            topic_id=question.topic_id,
            topic_name=topic_names.get(question.topic_id) if question.topic_id is not None else None,
            qtype=question.qtype or "single",
            text=question.text,
            archived=question.archived_at is not None,
            issues=issues,
        ))

    summary = QualitySummary(
        total_questions=len(q_ids),
        checked_questions=len(q_ids),
        questions_with_issues=len(rows),
        issue_counts=dict(issue_counts),
        severity_counts=dict(severity_counts),
        duplicate_groups=duplicate_groups,
    )
    return QualityReport(summary=summary, questions=rows)
