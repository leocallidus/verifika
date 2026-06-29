from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import desc, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import (
    AnswerOption,
    AttemptsPolicy,
    DisciplineTopic,
    Question,
    QuestionClozeBlank,
    QuestionImage,
    QuestionVersion,
    TeacherDiscipline,
    TeacherTopicTest,
    TestPolicyVersion,
    TestSession,
    TestSessionQuestion,
)


def _dt(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _float(value: Any) -> float | None:
    return float(value) if value is not None else None


def _compact_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Keep snapshots deterministic enough for equality checks."""
    return snapshot


async def question_snapshot(session: AsyncSession, question_id: int) -> dict[str, Any]:
    question = (await session.execute(
        select(Question)
        .where(Question.question_id == question_id)
        .options(
            selectinload(Question.options),
            selectinload(Question.acceptable_answers),
            selectinload(Question.cloze_blanks),
        )
    )).scalar_one()
    image = (await session.execute(
        select(QuestionImage).where(QuestionImage.question_id == question_id)
    )).scalar_one_or_none()
    return _compact_snapshot({
        "schema_version": 1,
        "question_id": question.question_id,
        "discipline_id": question.discipline_id,
        "topic_id": question.topic_id,
        "text": question.text,
        "difficulty": question.difficulty,
        "qtype": question.qtype or "single",
        "short_pattern": question.short_pattern,
        "numeric_tolerance": _float(question.numeric_tolerance),
        "match_pairs": question.match_pairs or [],
        "correct_bool": question.correct_bool,
        "explanation": question.explanation,
        "case_sensitive": bool(question.case_sensitive),
        "trim_whitespace": bool(question.trim_whitespace),
        "normalize_universal": bool(question.normalize_universal),
        "text_mode": question.text_mode or "string",
        "allow_partial": bool(question.allow_partial),
        "points": _float(question.points) or 1.0,
        "file_allowed_types": question.file_allowed_types,
        "file_max_size_bytes": question.file_max_size_bytes,
        "file_max_count": question.file_max_count,
        "archived_at": _dt(question.archived_at),
        "image_id": image.image_id if image is not None else None,
        "options": [
            {
                "option_id": option.option_id,
                "option_number": option.option_number,
                "text": option.text,
                "is_correct": bool(option.is_correct),
                "match_left": option.match_left,
                "match_right": option.match_right,
                "correct_position": option.correct_position,
            }
            for option in sorted(question.options, key=lambda item: item.option_number)
        ],
        "acceptable_answers": [
            answer.answer
            for answer in sorted(question.acceptable_answers, key=lambda item: item.ord)
        ],
        "cloze_blanks": [
            {
                "index": blank.blank_index,
                "kind": blank.kind,
                "options": blank.options,
                "correct_index": blank.correct_index,
                "acceptable_answers": blank.acceptable_answers,
                "case_sensitive": bool(blank.case_sensitive),
                "trim_whitespace": bool(blank.trim_whitespace),
                "normalize_universal": bool(blank.normalize_universal),
            }
            for blank in sorted(question.cloze_blanks, key=lambda item: item.blank_index)
        ],
    })


async def ensure_question_version(
    session: AsyncSession,
    question_id: int,
    *,
    created_by_teacher_id: int | None = None,
) -> QuestionVersion:
    snapshot = await question_snapshot(session, question_id)
    latest = (await session.execute(
        select(QuestionVersion)
        .where(QuestionVersion.question_id == question_id)
        .order_by(desc(QuestionVersion.version_no))
        .limit(1)
    )).scalar_one_or_none()
    if latest is not None and latest.snapshot == snapshot:
        return latest
    version_no = (latest.version_no + 1) if latest is not None else 1
    version = QuestionVersion(
        question_id=question_id,
        version_no=version_no,
        snapshot=snapshot,
        created_by_teacher_id=created_by_teacher_id,
    )
    session.add(version)
    await session.flush()
    return version


def topic_policy_snapshot(test: TeacherTopicTest, *, discipline_id: int) -> dict[str, Any]:
    return _compact_snapshot({
        "schema_version": 1,
        "scope": "topic",
        "teacher_id": test.teacher_id,
        "discipline_id": discipline_id,
        "topic_id": test.topic_id,
        "is_enabled": bool(test.is_enabled),
        "question_count": test.question_count,
        "time_limit_minutes": test.time_limit_minutes,
        "attempts_allowed": test.attempts_allowed,
        "available_from": _dt(test.available_from),
        "available_until": _dt(test.available_until),
        "shuffle_seed": bool(test.shuffle_seed),
        "show_correct_after_finish": bool(test.show_correct_after_finish),
        "passing_score_percent": test.passing_score_percent,
        "grading_method": test.grading_method,
        "show_question_points": bool(test.show_question_points),
        "attempt_delay_minutes": test.attempt_delay_minutes,
        "grade_scale": test.grade_scale,
    })


async def discipline_policy_snapshot(
    session: AsyncSession,
    *,
    teacher_id: int,
    discipline_id: int,
) -> dict[str, Any]:
    td = (await session.execute(
        select(TeacherDiscipline).where(
            TeacherDiscipline.teacher_id == teacher_id,
            TeacherDiscipline.discipline_id == discipline_id,
        )
    )).scalar_one_or_none()
    policy = (await session.execute(
        select(AttemptsPolicy).where(
            AttemptsPolicy.teacher_id == teacher_id,
            AttemptsPolicy.discipline_id == discipline_id,
        )
    )).scalar_one_or_none()
    return _compact_snapshot({
        "schema_version": 1,
        "scope": "discipline",
        "teacher_id": teacher_id,
        "discipline_id": discipline_id,
        "topic_id": None,
        "question_count": td.question_count if td is not None else 10,
        "time_limit_minutes": td.time_limit_minutes if td is not None else 30,
        "attempts_allowed": policy.attempts_allowed if policy is not None else 1,
        "available_from": _dt(policy.available_from) if policy is not None else None,
        "available_until": _dt(policy.available_until) if policy is not None else None,
        "shuffle_seed": bool(policy.shuffle_seed) if policy is not None else True,
        "show_correct_after_finish": bool(policy.show_correct_after_finish) if policy is not None else True,
        "proctor_min_level": policy.proctor_min_level if policy is not None else 0,
    })


async def ensure_topic_policy_version(
    session: AsyncSession,
    test: TeacherTopicTest,
    *,
    created_by_teacher_id: int | None = None,
) -> TestPolicyVersion:
    discipline_id = (await session.execute(
        select(DisciplineTopic.discipline_id).where(DisciplineTopic.topic_id == test.topic_id)
    )).scalar_one()
    snapshot = topic_policy_snapshot(test, discipline_id=discipline_id)
    return await _ensure_policy_version(
        session,
        scope="topic",
        teacher_id=test.teacher_id,
        discipline_id=discipline_id,
        topic_id=test.topic_id,
        snapshot=snapshot,
        created_by_teacher_id=created_by_teacher_id,
    )


async def ensure_discipline_policy_version(
    session: AsyncSession,
    *,
    teacher_id: int,
    discipline_id: int,
    created_by_teacher_id: int | None = None,
) -> TestPolicyVersion:
    snapshot = await discipline_policy_snapshot(session, teacher_id=teacher_id, discipline_id=discipline_id)
    return await _ensure_policy_version(
        session,
        scope="discipline",
        teacher_id=teacher_id,
        discipline_id=discipline_id,
        topic_id=None,
        snapshot=snapshot,
        created_by_teacher_id=created_by_teacher_id,
    )


async def _ensure_policy_version(
    session: AsyncSession,
    *,
    scope: str,
    teacher_id: int,
    discipline_id: int,
    topic_id: int | None,
    snapshot: dict[str, Any],
    created_by_teacher_id: int | None,
) -> TestPolicyVersion:
    conditions = [
        TestPolicyVersion.scope == scope,
        TestPolicyVersion.teacher_id == teacher_id,
        TestPolicyVersion.discipline_id == discipline_id,
    ]
    if topic_id is None:
        conditions.append(TestPolicyVersion.topic_id.is_(None))
    else:
        conditions.append(TestPolicyVersion.topic_id == topic_id)
    latest = (await session.execute(
        select(TestPolicyVersion)
        .where(*conditions)
        .order_by(desc(TestPolicyVersion.version_no))
        .limit(1)
    )).scalar_one_or_none()
    if latest is not None and latest.snapshot == snapshot:
        return latest
    version_no = (latest.version_no + 1) if latest is not None else 1
    version = TestPolicyVersion(
        scope=scope,
        teacher_id=teacher_id,
        discipline_id=discipline_id,
        topic_id=topic_id,
        version_no=version_no,
        snapshot=snapshot,
        created_by_teacher_id=created_by_teacher_id,
    )
    session.add(version)
    await session.flush()
    return version


async def attach_question_versions_to_session(
    session: AsyncSession,
    *,
    test_session: TestSession,
    question_ids_in_order: list[int],
    created_by_teacher_id: int | None = None,
) -> None:
    for position, question_id in enumerate(question_ids_in_order, start=1):
        version = await ensure_question_version(
            session,
            question_id,
            created_by_teacher_id=created_by_teacher_id,
        )
        session.add(TestSessionQuestion(
            session_id=test_session.session_id,
            question_id=question_id,
            question_version_id=version.question_version_id,
            position=position,
        ))
    await session.flush()


@dataclass(frozen=True)
class SessionQuestionSnapshot:
    question_id: int
    question_version_id: int
    position: int
    snapshot: dict[str, Any]


async def session_question_snapshots(
    session: AsyncSession,
    session_id: int,
) -> list[SessionQuestionSnapshot]:
    rows = (await session.execute(
        select(
            TestSessionQuestion.question_id,
            TestSessionQuestion.question_version_id,
            TestSessionQuestion.position,
            QuestionVersion.snapshot,
        )
        .join(QuestionVersion, QuestionVersion.question_version_id == TestSessionQuestion.question_version_id)
        .where(TestSessionQuestion.session_id == session_id)
        .order_by(TestSessionQuestion.position.asc())
    )).all()
    return [
        SessionQuestionSnapshot(
            question_id=question_id,
            question_version_id=question_version_id,
            position=position,
            snapshot=snapshot,
        )
        for question_id, question_version_id, position, snapshot in rows
    ]


def _snapshot_option(snapshot: dict[str, Any], option_id: int | None) -> dict[str, Any] | None:
    if option_id is None:
        return None
    return next((opt for opt in snapshot_options(snapshot) if opt.get("option_id") == option_id), None)


def snapshot_options(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    return sorted(
        [dict(opt) for opt in snapshot.get("options") or []],
        key=lambda item: item.get("option_number") or 0,
    )


def snapshot_question_meta(snapshot: dict[str, Any]) -> dict[str, Any]:
    allowed_types = snapshot.get("file_allowed_types")
    if isinstance(allowed_types, str):
        try:
            allowed_types = json.loads(allowed_types)
        except Exception:
            pass
    return {
        "qtype": snapshot.get("qtype") or "single",
        "short_pattern": snapshot.get("short_pattern"),
        "numeric_tolerance": snapshot.get("numeric_tolerance"),
        "match_pairs": snapshot.get("match_pairs") or [],
        "correct_bool": snapshot.get("correct_bool"),
        "explanation": snapshot.get("explanation"),
        "case_sensitive": bool(snapshot.get("case_sensitive", False)),
        "trim_whitespace": bool(snapshot.get("trim_whitespace", True)),
        "normalize_universal": bool(snapshot.get("normalize_universal", True)),
        "text_mode": snapshot.get("text_mode") or "string",
        "allow_partial": bool(snapshot.get("allow_partial", False)),
        "acceptable_answers": list(snapshot.get("acceptable_answers") or []),
        "cloze_blanks": list(snapshot.get("cloze_blanks") or []),
        "options_meta": snapshot_options(snapshot),
        "file_allowed_types": allowed_types,
        "file_max_size_bytes": snapshot.get("file_max_size_bytes"),
        "file_max_count": snapshot.get("file_max_count"),
    }


def snapshot_to_question_dto(snapshot: dict[str, Any]):
    from app.services.randomization import OptionDTO, QuestionDTO

    return QuestionDTO(
        question_id=int(snapshot["question_id"]),
        text=str(snapshot.get("text") or ""),
        options=[
            OptionDTO(
                option_id=int(option["option_id"]),
                option_number=int(option.get("option_number") or 0),
                text=str(option.get("text") or ""),
                is_correct=bool(option.get("is_correct")),
            )
            for option in snapshot_options(snapshot)
        ],
    )


def session_snapshots_to_question_ids(
    snapshots: list[SessionQuestionSnapshot],
) -> list[int]:
    return [item.question_id for item in snapshots]


def policy_snapshot_value(snapshot: dict[str, Any] | None, key: str, default: Any = None) -> Any:
    if not snapshot:
        return default
    return snapshot.get(key, default)


def _normalize_text(value: str, *, case_sensitive: bool, trim: bool, universal: bool) -> str:
    s = value
    if trim:
        s = s.strip()
    if universal:
        quotes = {
            "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
            "«": '"', "»": '"',
        }
        for src, dst in quotes.items():
            s = s.replace(src, dst)
        s = s.replace("ё", "е").replace("Ё", "Е")
    if not case_sensitive:
        s = s.lower()
    return s


def _parse_number(value: str):
    s = value.strip().replace(",", ".")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _score_text_snapshot(
    *,
    raw: str | None,
    acceptable: list[str],
    text_mode: str,
    numeric_tolerance: float | None,
    case_sensitive: bool,
    trim_whitespace: bool,
    normalize_universal: bool,
) -> tuple[bool, float]:
    if raw is None:
        return False, 0.0
    if text_mode == "number":
        v = _parse_number(raw)
        target = _parse_number(acceptable[0]) if acceptable else None
        if v is None or target is None:
            return False, 0.0
        tol = float(numeric_tolerance) if numeric_tolerance is not None else 0.0
        ok = abs(v - target) <= tol
        return ok, 1.0 if ok else 0.0
    needle = _normalize_text(
        raw or "",
        case_sensitive=case_sensitive,
        trim=trim_whitespace,
        universal=normalize_universal,
    )
    for ans in acceptable:
        candidate = _normalize_text(
            ans,
            case_sensitive=case_sensitive,
            trim=trim_whitespace,
            universal=normalize_universal,
        )
        if needle and needle == candidate:
            return True, 1.0
    return False, 0.0


def _score_order_snapshot(
    *,
    raw: str | None,
    snapshot: dict[str, Any],
    allow_partial: bool,
) -> tuple[bool, float]:
    if raw is None:
        return False, 0.0
    try:
        submitted = [int(x) for x in raw.split(",") if x.strip()]
    except ValueError:
        return False, 0.0
    expected = [
        opt
        for opt in snapshot_options(snapshot)
        if opt.get("correct_position") is not None
    ]
    if not expected:
        return False, 0.0
    expected_ids = [
        int(opt["option_id"])
        for opt in sorted(expected, key=lambda item: item.get("correct_position") or 0)
    ]
    if not allow_partial:
        ok = submitted == expected_ids
        return ok, 1.0 if ok else 0.0
    matched = sum(1 for s, e in zip(submitted, expected_ids) if s == e)
    ratio = matched / max(1, len(expected_ids))
    return matched == len(expected_ids), ratio


def _score_bool_snapshot(*, raw: str | None, correct_bool: bool | None) -> tuple[bool, float]:
    if raw is None:
        return False, 0.0
    v = (raw or "").strip().lower()
    if v not in ("true", "false"):
        return False, 0.0
    student_val = v == "true"
    ok = student_val == bool(correct_bool)
    return ok, 1.0 if ok else 0.0


def _score_cloze_snapshot(
    *,
    raw: str | None,
    blanks: list[dict[str, Any]],
    allow_partial: bool,
) -> tuple[bool, float]:
    if raw is None or not blanks:
        return False, 0.0
    try:
        submitted = json.loads(raw) if raw else {}
    except (ValueError, TypeError):
        return False, 0.0
    if not isinstance(submitted, dict):
        return False, 0.0
    correct = 0
    total = len(blanks)
    for blank in blanks:
        idx = str(blank["index"])
        raw_value = submitted.get(idx, submitted.get(blank["index"]))
        if raw_value is None:
            continue
        if blank.get("kind") == "select":
            options = list(blank.get("options") or [])
            try:
                correct_index = blank.get("correct_index")
                correct_index = int(correct_index) if correct_index is not None else None
                allowed_text = (
                    options[correct_index]
                    if correct_index is not None and 0 <= correct_index < len(options)
                    else None
                )
                if str(raw_value) == str(allowed_text):
                    correct += 1
            except (IndexError, ValueError):
                pass
        else:
            accs = list(blank.get("acceptable_answers") or [])
            cs = bool(blank.get("case_sensitive", False))
            trim = bool(blank.get("trim_whitespace", True))
            nu = bool(blank.get("normalize_universal", True))
            value = _normalize_text(str(raw_value), case_sensitive=cs, trim=trim, universal=nu)
            for ans in accs:
                if value == _normalize_text(str(ans), case_sensitive=cs, trim=trim, universal=nu):
                    correct += 1
                    break
    ratio = correct / max(1, total)
    return correct == total, ratio if allow_partial else (1.0 if correct == total else 0.0)


def score_snapshot_answer(
    *,
    snapshot: dict[str, Any],
    selected_option_id: int | None,
    short_answer_raw: str | None,
    match_pairs: Any,
) -> tuple[bool, float]:
    qtype = snapshot.get("qtype") or "single"
    earned = 0.0
    ok = False
    if qtype == "single":
        selected = _snapshot_option(snapshot, selected_option_id)
        ok = bool(selected and selected.get("is_correct"))
        earned = 1.0 if ok else 0.0
    elif qtype == "multi":
        option_ids = [int(x) for x in list(match_pairs or []) if str(x).isdigit()]
        selected_set = set(option_ids)
        correct_set = {
            int(opt["option_id"])
            for opt in snapshot_options(snapshot)
            if opt.get("is_correct")
        }
        ok = selected_set == correct_set and bool(option_ids)
        earned = 1.0 if ok else 0.0
    elif qtype == "short":
        raw = (short_answer_raw or "").strip() if short_answer_raw is not None else None
        pattern = snapshot.get("short_pattern")
        if raw is not None and pattern:
            ok = bool(re.match(pattern, raw, re.IGNORECASE))
        elif raw is not None:
            correct = next((opt for opt in snapshot_options(snapshot) if opt.get("is_correct")), None)
            expected = str(correct.get("text") if correct else "").strip()
            ok = raw.lower() == expected.lower()
        earned = 1.0 if ok else 0.0
    elif qtype == "numeric":
        value = _parse_number(short_answer_raw or "") if short_answer_raw is not None else None
        correct = next((opt for opt in snapshot_options(snapshot) if opt.get("is_correct")), None)
        target = _parse_number(str(correct.get("text") if correct else ""))
        if value is not None and target is not None:
            tolerance = float(snapshot.get("numeric_tolerance") or 0.0)
            ok = abs(value - target) <= tolerance
        earned = 1.0 if ok else 0.0
    elif qtype == "match":
        expected_pairs = [
            (pair.get("left"), pair.get("right"))
            for pair in (snapshot.get("match_pairs") or [])
            if isinstance(pair, dict)
        ]
        submitted_pairs = [
            (pair.get("left"), pair.get("right"))
            for pair in (match_pairs or [])
            if isinstance(pair, dict)
        ]
        ok = bool(expected_pairs) and expected_pairs == submitted_pairs
        earned = 1.0 if ok else 0.0
    elif qtype == "text":
        ok, earned = _score_text_snapshot(
            raw=short_answer_raw,
            acceptable=list(snapshot.get("acceptable_answers") or []),
            text_mode=snapshot.get("text_mode") or "string",
            numeric_tolerance=snapshot.get("numeric_tolerance"),
            case_sensitive=bool(snapshot.get("case_sensitive", False)),
            trim_whitespace=bool(snapshot.get("trim_whitespace", True)),
            normalize_universal=bool(snapshot.get("normalize_universal", True)),
        )
    elif qtype == "order":
        ok, earned = _score_order_snapshot(
            raw=short_answer_raw,
            snapshot=snapshot,
            allow_partial=bool(snapshot.get("allow_partial", False)),
        )
    elif qtype == "bool":
        ok, earned = _score_bool_snapshot(
            raw=short_answer_raw,
            correct_bool=snapshot.get("correct_bool"),
        )
    elif qtype == "cloze":
        ok, earned = _score_cloze_snapshot(
            raw=short_answer_raw,
            blanks=list(snapshot.get("cloze_blanks") or []),
            allow_partial=bool(snapshot.get("allow_partial", False)),
        )
    return ok, earned


def snapshot_correct_answer(snapshot: dict[str, Any]) -> str | None:
    qtype = snapshot.get("qtype") or "single"
    options = snapshot_options(snapshot)
    if qtype in ("single", "multi", "short", "numeric"):
        correct = [str(opt.get("text") or "") for opt in options if opt.get("is_correct")]
        return ", ".join(correct) if correct else None
    if qtype == "bool":
        return "Верно" if snapshot.get("correct_bool") else "Неверно"
    if qtype == "match" and snapshot.get("match_pairs"):
        return "; ".join(
            f"{pair.get('left')} -> {pair.get('right')}"
            for pair in snapshot.get("match_pairs") or []
            if isinstance(pair, dict)
        )
    if qtype == "order":
        ordered = sorted(
            [opt for opt in options if opt.get("correct_position") is not None],
            key=lambda opt: opt.get("correct_position") or 0,
        )
        return " -> ".join(str(opt.get("text") or "") for opt in ordered)
    if qtype == "text":
        answers = list(snapshot.get("acceptable_answers") or [])
        return ", ".join(str(answer) for answer in answers) if answers else None
    if qtype == "cloze":
        parts: list[str] = []
        for blank in snapshot.get("cloze_blanks") or []:
            if blank.get("kind") == "select":
                options = blank.get("options") or []
                correct_index = blank.get("correct_index")
                if correct_index is not None and 0 <= int(correct_index) < len(options):
                    parts.append(f"{blank.get('index')}: {options[int(correct_index)]}")
            elif blank.get("acceptable_answers"):
                parts.append(
                    f"{blank.get('index')}: {', '.join(str(x) for x in blank.get('acceptable_answers') or [])}"
                )
        return "; ".join(parts) if parts else None
    return None


def snapshot_correct_answer_render(snapshot: dict[str, Any]) -> dict[str, Any] | None:
    qtype = snapshot.get("qtype") or "single"
    options = snapshot_options(snapshot)
    if qtype in ("single", "short", "numeric"):
        correct = [opt for opt in options if opt.get("is_correct")]
        return {
            "kind": qtype,
            "option_ids": [opt.get("option_id") for opt in correct],
            "option_texts": [opt.get("text") for opt in correct],
            "value": ", ".join(str(opt.get("text") or "") for opt in correct) if correct else None,
        }
    if qtype == "multi":
        correct = [opt for opt in options if opt.get("is_correct")]
        return {
            "kind": "multi",
            "option_ids": [opt.get("option_id") for opt in correct],
            "option_texts": [opt.get("text") for opt in correct],
        }
    if qtype == "bool":
        return {"kind": "bool", "value": bool(snapshot.get("correct_bool"))}
    if qtype == "match":
        return {"kind": "match", "pairs": snapshot.get("match_pairs") or []}
    if qtype == "order":
        ordered = sorted(
            [opt for opt in options if opt.get("correct_position") is not None],
            key=lambda opt: opt.get("correct_position") or 0,
        )
        return {
            "kind": "order",
            "option_ids": [opt.get("option_id") for opt in ordered],
            "option_texts": [opt.get("text") for opt in ordered],
        }
    if qtype == "text":
        return {"kind": "text", "values": list(snapshot.get("acceptable_answers") or [])}
    if qtype == "cloze":
        blanks = []
        for blank in snapshot.get("cloze_blanks") or []:
            value = None
            if blank.get("kind") == "select":
                options = blank.get("options") or []
                correct_index = blank.get("correct_index")
                if correct_index is not None and 0 <= int(correct_index) < len(options):
                    value = options[int(correct_index)]
            elif blank.get("acceptable_answers"):
                value = blank.get("acceptable_answers")
            blanks.append({"index": blank.get("index"), "kind": blank.get("kind"), "value": value})
        return {"kind": "cloze", "blanks": blanks}
    return None


def snapshot_student_answer_text(
    *,
    snapshot: dict[str, Any],
    selected_option_id: int | None,
    short_answer_raw: str | None,
    match_pairs: Any,
) -> str | None:
    qtype = snapshot.get("qtype") or "single"
    selected = _snapshot_option(snapshot, selected_option_id)
    if qtype == "single" and selected:
        return str(selected.get("text") or "")
    if qtype == "bool" and short_answer_raw in ("true", "false"):
        return "Верно" if short_answer_raw == "true" else "Неверно"
    if qtype == "match" and match_pairs:
        return "; ".join(
            f"{pair.get('left')} -> {pair.get('right')}"
            for pair in match_pairs
            if isinstance(pair, dict)
        )
    if qtype == "multi" and match_pairs:
        options_by_id = {int(opt["option_id"]): opt for opt in snapshot_options(snapshot)}
        return ", ".join(
            str(options_by_id[int(option_id)].get("text") or "")
            for option_id in match_pairs
            if str(option_id).isdigit() and int(option_id) in options_by_id
        )
    return short_answer_raw or (str(selected.get("text") or "") if selected else None)


def snapshot_student_answer_render(
    *,
    snapshot: dict[str, Any],
    selected_option_id: int | None,
    short_answer_raw: str | None,
    match_pairs: Any,
) -> dict[str, Any] | None:
    qtype = snapshot.get("qtype") or "single"
    selected = _snapshot_option(snapshot, selected_option_id)
    options_by_id = {int(opt["option_id"]): opt for opt in snapshot_options(snapshot)}
    if qtype == "multi":
        ids = [int(x) for x in list(match_pairs or []) if str(x).isdigit()]
        return {
            "kind": "multi",
            "option_ids": ids,
            "option_texts": [options_by_id[oid].get("text") for oid in ids if oid in options_by_id],
        }
    if qtype == "match":
        return {"kind": "match", "pairs": match_pairs or []}
    if qtype == "order":
        ids = [int(x) for x in (short_answer_raw or "").split(",") if x.strip().isdigit()]
        return {
            "kind": "order",
            "option_ids": ids,
            "option_texts": [options_by_id[oid].get("text") for oid in ids if oid in options_by_id],
        }
    if qtype == "bool":
        value = short_answer_raw == "true" if short_answer_raw in ("true", "false") else None
        return {"kind": "bool", "value": value}
    if qtype == "cloze":
        values: Any = {}
        if short_answer_raw:
            try:
                values = json.loads(short_answer_raw)
            except (TypeError, ValueError):
                values = {}
        return {"kind": "cloze", "values": values}
    if selected is None and short_answer_raw is None:
        return None
    return {
        "kind": qtype,
        "selected_option_text": selected.get("text") if selected else None,
        "selected_option_id": selected.get("option_id") if selected else None,
        "value": short_answer_raw or (selected.get("text") if selected else None),
    }
