from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Iterable, List, Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AnswerExtra, AnswerOption, Question, StudentAnswer, Student, TestSession, FileUploadGrade
from app.services.versioning import score_snapshot_answer, session_question_snapshots


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


async def _score_text(
    *,
    raw: Optional[str],
    acceptable: list[str],
    text_mode: str,
    numeric_tolerance: Optional[float],
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
        return (ok, 1.0 if ok else 0.0)
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


async def _score_order(
    *,
    raw: Optional[str],
    question_id: int,
    allow_partial: bool,
    session: AsyncSession,
) -> tuple[bool, float]:
    if raw is None:
        return False, 0.0
    try:
        submitted = [int(x) for x in raw.split(",") if x.strip()]
    except ValueError:
        return False, 0.0
    rows = (await session.execute(
        select(AnswerOption.option_id, AnswerOption.correct_position).where(
            AnswerOption.question_id == question_id,
            AnswerOption.correct_position.is_not(None),
        )
    )).all()
    if not rows:
        return False, 0.0
    expected_ids = [oid for oid, _pos in sorted(rows, key=lambda r: r[1])]
    if not allow_partial:
        ok = submitted == expected_ids
        return ok, 1.0 if ok else 0.0
    matched = sum(1 for s, e in zip(submitted, expected_ids) if s == e)
    total = max(1, len(expected_ids))
    ratio = matched / total
    return matched == len(expected_ids), ratio


async def _score_bool(*, raw: Optional[str], correct_bool: Optional[bool]) -> tuple[bool, float]:
    if raw is None:
        return False, 0.0
    v = (raw or "").strip().lower()
    if v not in ("true", "false"):
        return False, 0.0
    student_val = v == "true"
    return student_val == bool(correct_bool), 1.0 if student_val == bool(correct_bool) else 0.0


async def _score_cloze(
    *,
    raw: Optional[str],
    blanks: list[dict],
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
    for b in blanks:
        idx = str(b["index"])
        raw_value = submitted.get(idx, submitted.get(b["index"]))
        if raw_value is None:
            continue
        if b.get("kind") == "select":
            options = list(b.get("options") or [])
            try:
                ci = b.get("correct_index")
                ci = int(ci) if ci is not None else None
                allowed_text = options[ci] if ci is not None and 0 <= ci < len(options) else None
                if str(raw_value) == str(allowed_text):
                    correct += 1
            except (IndexError, ValueError):
                pass
        else:
            accs = list(b.get("acceptable_answers") or [])
            cs = bool(b.get("case_sensitive", False))
            trim = bool(b.get("trim_whitespace", True))
            nu = bool(b.get("normalize_universal", True))
            v = _normalize_text(str(raw_value), case_sensitive=cs, trim=trim, universal=nu)
            for ans in accs:
                if v == _normalize_text(ans, case_sensitive=cs, trim=trim, universal=nu):
                    correct += 1
                    break
    ratio = correct / max(1, total)
    return (correct == total, ratio if allow_partial else (1.0 if correct == total else 0.0))


@dataclass
class GradeBreakdown:
    per_question: list[dict]
    score: int
    max_score: int


async def _is_option_correct(option_id: int, qtype: str) -> bool:
    return True


async def grade_session(session: AsyncSession, sess: TestSession) -> GradeBreakdown:
    """Посчитать score/max_score с учётом qtype каждого вопроса."""
    session_snapshots = await session_question_snapshots(session, sess.session_id)
    if session_snapshots:
        snapshots_by_q = {item.question_id: item.snapshot for item in session_snapshots}
        answers = (await session.execute(
            select(StudentAnswer).where(StudentAnswer.session_id == sess.session_id)
        )).scalars().all()
        answer_by_q = {answer.question_id: answer for answer in answers}
        extras = {
            e.answer_id: e
            for e in (await session.execute(
                select(AnswerExtra).where(
                    AnswerExtra.answer_id.in_([answer.answer_id for answer in answers] or [-1])
                )
            )).scalars().all()
        }
        breakdown: list[dict] = []
        score_float = 0.0
        for item in session_snapshots:
            snapshot = snapshots_by_q[item.question_id]
            answer = answer_by_q.get(item.question_id)
            extra = extras.get(answer.answer_id) if answer else None
            qtype = snapshot.get("qtype") or "single"
            pts = float(snapshot.get("points") or 1.0)
            if qtype == "file_upload":
                manual_grade = None
                if answer:
                    manual_grade = (await session.execute(
                        select(FileUploadGrade).where(FileUploadGrade.answer_id == answer.answer_id)
                    )).scalars().first()
                earned = float(manual_grade.points_earned) if manual_grade else 0.0
                ok = manual_grade is not None
            else:
                ok, earned_ratio = score_snapshot_answer(
                    snapshot=snapshot,
                    selected_option_id=answer.selected_option_id if answer else None,
                    short_answer_raw=extra.short_answer_raw if extra else None,
                    match_pairs=extra.match_pairs if extra else None,
                )
                earned = earned_ratio * pts
            score_float += earned
            breakdown.append({
                "question_id": item.question_id,
                "question_text": snapshot.get("text") or "",
                "qtype": qtype,
                "is_correct": ok,
                "points_earned": earned,
            })
        return GradeBreakdown(
            per_question=breakdown,
            score=int(round(score_float)),
            max_score=int(round(sum(float(snapshots_by_q[item.question_id].get("points") or 1.0) for item in session_snapshots))),
        )

    rows = (await session.execute(
        select(
            StudentAnswer.answer_id,
            StudentAnswer.question_id,
            StudentAnswer.selected_option_id,
            Question.qtype,
            Question.text,
            Question.numeric_tolerance,
            Question.short_pattern,
            Question.match_pairs,
            Question.text_mode,
            Question.case_sensitive,
            Question.trim_whitespace,
            Question.normalize_universal,
            Question.correct_bool,
            Question.allow_partial,
            Question.points,
        )
        .join(Question, Question.question_id == StudentAnswer.question_id)
        .where(StudentAnswer.session_id == sess.session_id)
    )).all()
    if not rows:
        return GradeBreakdown(per_question=[], score=0, max_score=sess.max_score or 0)

    extras = {
        e.answer_id: e
        for e in (await session.execute(
            select(AnswerExtra).where(
                AnswerExtra.answer_id.in_([r[0] for r in rows])
            )
        )).scalars().all()
    }

    # Pre-fetch acceptable answers and cloze blanks in bulk.
    q_ids = [r[1] for r in rows]
    acceptable_by_q: dict[int, list[str]] = {qid: [] for qid in q_ids}
    aa_rows = (await session.execute(
        text("SELECT question_id, answer FROM question_acceptable_answers WHERE question_id = ANY(:ids) ORDER BY question_id, ord")
        .bindparams(ids=q_ids)
    )).all()
    for qid, ans in aa_rows:
        acceptable_by_q.setdefault(qid, []).append(ans)
    cloze_by_q: dict[int, list[dict]] = {}
    cloze_rows = (await session.execute(
        text(
            "SELECT question_id, blank_index, kind, options, correct_index, acceptable_answers, case_sensitive, trim_whitespace, normalize_universal "
            "FROM question_cloze_blanks WHERE question_id = ANY(:ids) ORDER BY question_id, blank_index"
        ).bindparams(ids=q_ids)
    )).all()
    for row in cloze_rows:
        (qid, idx, kind, options, correct_index, acceptable_answers, cs, trim, nu) = row
        cloze_by_q.setdefault(qid, []).append({
            "index": idx,
            "kind": kind,
            "options": options,
            "correct_index": correct_index,
            "acceptable_answers": acceptable_answers,
            "case_sensitive": cs,
            "trim_whitespace": trim,
            "normalize_universal": nu,
        })

    breakdown: list[dict] = []  # type: ignore
    score_float = 0.0
    for row in rows:
        (answer_id, q_id, opt_id, qtype, q_text, num_tol, pat, mp,
         text_mode, case_sensitive, trim_whitespace, normalize_universal,
         correct_bool, allow_partial, points) = row
        ex = extras.get(answer_id)
        earned = 0.0
        ok = False
        pts_val = float(points) if points is not None else 1.0
        if qtype == "single":
            if opt_id is not None:
                opt = (await session.execute(
                    select(AnswerOption).where(AnswerOption.option_id == opt_id)
                )).scalar_one_or_none()
                ok = bool(opt and opt.is_correct)
                if ok:
                    earned = 1.0
        elif qtype == "multi":
            if opt_id is not None and ex and ex.match_pairs:
                option_ids = [int(x) for x in list(ex.match_pairs) if str(x).isdigit()]
                opts = (await session.execute(
                    select(AnswerOption).where(AnswerOption.option_id.in_(option_ids))
                )).scalars().all()
                selected_set = set(o.option_id for o in opts)
                correct_set = set(o.option_id for o in (await session.execute(
                    select(AnswerOption).where(AnswerOption.question_id == q_id, AnswerOption.is_correct == True)
                )).scalars().all())
                ok = selected_set == correct_set and len(option_ids) > 0
                if ok:
                    earned = 1.0
        elif qtype == "short":
            if ex and ex.short_answer_raw is not None:
                raw = (ex.short_answer_raw or "").strip()
                if pat:
                    ok = bool(re.match(pat, raw, re.IGNORECASE))
                else:
                    expected = (await session.execute(
                        select(AnswerOption.text).where(
                            AnswerOption.question_id == q_id,
                            AnswerOption.is_correct == True,
                        )
                    )).first()
                    exp_text = (expected[0] if expected else "").strip()
                    ok = raw.lower() == exp_text.lower()
                if ok:
                    earned = 1.0
        elif qtype == "numeric":
            if ex and ex.short_answer_raw is not None:
                try:
                    val = float(ex.short_answer_raw)
                except (TypeError, ValueError):
                    val = None
                if val is not None:
                    expected = (await session.execute(
                        select(AnswerOption.text).where(
                            AnswerOption.question_id == q_id,
                            AnswerOption.is_correct == True,
                        )
                    )).first()
                    if expected and expected[0] is not None:
                        try:
                            target = float(expected[0])
                            tol = float(num_tol) if num_tol is not None else 0.0
                            ok = abs(val - target) <= tol
                        except (TypeError, ValueError):
                            pass
                if ok:
                    earned = 1.0
        elif qtype == "match":
            if ex and ex.match_pairs:
                if mp:
                    expected_pairs = [(p.get("left"), p.get("right")) for p in mp]
                    submitted_pairs = [(p.get("left"), p.get("right")) for p in ex.match_pairs]
                    ok = expected_pairs == submitted_pairs
                    if ok:
                        earned = 1.0
        elif qtype == "text":
            ok, earned = await _score_text(
                raw=ex.short_answer_raw if ex else None,
                acceptable=acceptable_by_q.get(q_id, []),
                text_mode=text_mode or "string",
                numeric_tolerance=num_tol,
                case_sensitive=bool(case_sensitive),
                trim_whitespace=bool(trim_whitespace),
                normalize_universal=bool(normalize_universal),
            )
        elif qtype == "order":
            ok, earned = await _score_order(
                raw=ex.short_answer_raw if ex else None,
                question_id=q_id,
                allow_partial=bool(allow_partial),
                session=session,
            )
        elif qtype == "bool":
            ok, earned = await _score_bool(
                raw=ex.short_answer_raw if ex else None,
                correct_bool=correct_bool,
            )
        elif qtype == "cloze":
            ok, earned_ratio = await _score_cloze(
                raw=ex.short_answer_raw if ex else None,
                blanks=cloze_by_q.get(q_id, []),
                allow_partial=bool(allow_partial),
            )
            earned = earned_ratio * pts_val
        elif qtype == "file_upload":
            manual_grade = (await session.execute(
                select(FileUploadGrade).where(FileUploadGrade.answer_id == answer_id)
            )).scalars().first()
            earned = float(manual_grade.points_earned) if manual_grade else 0.0
            ok = manual_grade is not None
        else:
            # For types checking raw matching directly (single, multi, short, numeric, match)
            # They returned earned as 1.0 on success.
            # Let's multiply their earned (which is 1.0 on success) by pts_val
            earned = earned * pts_val

        score_float += earned
        breakdown.append({
            "question_id": q_id,
            "question_text": q_text,
            "qtype": qtype,
            "is_correct": ok,
            "points_earned": earned,
        })

    score = int(round(score_float))
    max_score = int(round(sum(float(r[14]) if r[14] is not None else 1.0 for r in rows)))
    return GradeBreakdown(per_question=breakdown, score=score, max_score=max_score)
