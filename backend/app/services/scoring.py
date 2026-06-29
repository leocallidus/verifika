from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert

from app.db.models import AnswerOption, Question, StudentAnswer, TestSession
from app.services.randomization import OptionDTO


async def compute_and_save_score(session: AsyncSession, sess: TestSession) -> tuple[int, int]:
    res = await session.execute(
        select(Question.question_id, AnswerOption.is_correct, Question.text, AnswerOption.text)
        .select_from(StudentAnswer)
        .join(AnswerOption, AnswerOption.option_id == StudentAnswer.selected_option_id)
        .join(Question, Question.question_id == StudentAnswer.question_id)
        .where(StudentAnswer.session_id == sess.session_id)
    )
    rows = res.all()
    if not rows:
        return 0, 0
    score = sum(1 for _qid, correct, _qt, _ot in rows if correct)
    return score, len(rows)


async def regroup_with_correct(
    session: AsyncSession,
    session_id: int,
    rows: list[tuple],
) -> list[dict]:
    return [
        {
            "question_text": q_text,
            "chosen_option_text": opt_text,
            "is_answer_correct": bool(is_correct),
        }
        for (_sid, _qid, _oid, _on, q_text, opt_text, is_correct, _sa_status)
        in rows
    ]
