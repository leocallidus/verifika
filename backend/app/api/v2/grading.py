from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, require_teacher
from app.db.models import AnswerComment, Discipline, DisciplineTopic, StudentAnswer, TestSession, TestSessionGradeOverride
from app.db.session import get_session
from app.schemas.v2 import CommentIn, CommentOut, OverrideScoreIn, OverrideScoreOut, SessionCommentIn, SessionCommentOut
from app.services.notifications_helpers import store_and_publish

router = APIRouter(prefix="/teacher/grading", tags=["v2.grading"])


async def _ensure_teacher_owns_session(session: AsyncSession, teacher_id: int, session_id: int) -> TestSession:
    sess = (await session.execute(
        select(TestSession).where(TestSession.session_id == session_id)
    )).scalar_one_or_none()
    if sess is None:
        raise HTTPException(status_code=404, detail="session not found")
    if sess.teacher_id != teacher_id:
        raise HTTPException(status_code=403, detail="not your session")
    return sess


@router.post("/sessions/{session_id}/override_score", response_model=OverrideScoreOut)
async def override_score(
    session_id: int,
    payload: OverrideScoreIn,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> OverrideScoreOut:
    sess = await _ensure_teacher_owns_session(session, user.id, session_id)
    if payload.score > sess.max_score:
        raise HTTPException(status_code=400, detail="score > max_score")
    existing = (await session.execute(
        select(TestSessionGradeOverride).where(TestSessionGradeOverride.session_id == session_id)
    )).scalar_one_or_none()
    if existing is None:
        session.add(TestSessionGradeOverride(
            session_id=session_id, score=payload.score,
            reason=payload.reason, teacher_id=user.id,
        ))
    else:
        existing.score = payload.score
        existing.reason = payload.reason
        existing.teacher_id = user.id
    sess.score = payload.score
    await session.commit()
    return OverrideScoreOut(
        session_id=session_id, score=payload.score, reason=payload.reason,
        teacher_id=user.id, updated_at=existing.updated_at if existing else sess.started_at,
    )


@router.post("/sessions/{session_id}/comments", response_model=CommentOut, status_code=201)
async def add_comment(
    session_id: int,
    payload: CommentIn,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> CommentOut:
    sess = await _ensure_teacher_owns_session(session, user.id, session_id)
    answer_exists = (await session.execute(
        select(StudentAnswer.answer_id).where(
            StudentAnswer.session_id == session_id,
            StudentAnswer.question_id == payload.question_id,
        )
    )).scalar_one_or_none()
    if answer_exists is None:
        raise HTTPException(status_code=404, detail="answer not found in session")

    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="empty comment")
    c = (await session.execute(
        select(AnswerComment).where(
            AnswerComment.session_id == session_id,
            AnswerComment.question_id == payload.question_id,
        )
    )).scalar_one_or_none()
    created = c is None
    if c is None:
        c = AnswerComment(
            session_id=session_id,
            question_id=payload.question_id,
            teacher_id=user.id,
            body=body,
        )
        session.add(c)
    else:
        c.teacher_id = user.id
        c.body = body
    discipline_name = (await session.execute(
        select(Discipline.name).where(Discipline.discipline_id == sess.discipline_id)
    )).scalar_one_or_none() or "Тест"
    topic_name = None
    if sess.topic_id is not None:
        topic_name = (await session.execute(
            select(DisciplineTopic.name).where(DisciplineTopic.topic_id == sess.topic_id)
        )).scalar_one_or_none()
    await store_and_publish(
        session,
        "student",
        sess.student_id,
        "comment_added",
        {
            "title": "Новый комментарий",
            "body": f"{discipline_name}{f' — {topic_name}' if topic_name else ''}",
            "link": f"/student/results/{session_id}",
            "meta": {
                "session_id": session_id,
                "question_id": payload.question_id,
                "discipline_id": sess.discipline_id,
                "topic_id": sess.topic_id,
                "updated": not created,
            },
        },
    )
    await session.commit()
    await session.refresh(c)
    return CommentOut(
        comment_id=c.comment_id, session_id=c.session_id,
        question_id=c.question_id, teacher_id=c.teacher_id,
        body=c.body, created_at=c.created_at,
    )


@router.get("/sessions/{session_id}/comments", response_model=list[CommentOut])
async def list_comments(
    session_id: int,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> list[CommentOut]:
    await _ensure_teacher_owns_session(session, user.id, session_id)
    rows = (await session.execute(
        select(AnswerComment).where(AnswerComment.session_id == session_id).order_by(AnswerComment.created_at)
    )).scalars().all()
    return [
        CommentOut(
            comment_id=c.comment_id, session_id=c.session_id,
            question_id=c.question_id, teacher_id=c.teacher_id,
            body=c.body, created_at=c.created_at,
        ) for c in rows
    ]


@router.post("/sessions/{session_id}/comment", response_model=SessionCommentOut)
async def add_session_comment(
    session_id: int,
    payload: SessionCommentIn,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> SessionCommentOut:
    sess = await _ensure_teacher_owns_session(session, user.id, session_id)
    body = payload.body.strip()
    sess.comment = body if body else None

    discipline_name = (await session.execute(
        select(Discipline.name).where(Discipline.discipline_id == sess.discipline_id)
    )).scalar_one_or_none() or "Тест"
    
    topic_name = None
    if sess.topic_id is not None:
        topic_name = (await session.execute(
            select(DisciplineTopic.name).where(DisciplineTopic.topic_id == sess.topic_id)
        )).scalar_one_or_none()

    if body:
        await store_and_publish(
            session,
            "student",
            sess.student_id,
            "comment_added",
            {
                "title": "Новый комментарий к попытке",
                "body": f"{discipline_name}{f' — {topic_name}' if topic_name else ''}",
                "link": f"/student/results/{session_id}",
                "meta": {
                    "session_id": session_id,
                    "discipline_id": sess.discipline_id,
                    "topic_id": sess.topic_id,
                    "updated": False,
                },
            },
        )
    
    await session.commit()
    return SessionCommentOut(session_id=session_id, comment=sess.comment)
