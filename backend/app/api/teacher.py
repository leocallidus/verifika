from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse
from sqlalchemy import case, delete, func, select, text
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, require_teacher
from app.core.rate_limit import bulk_archive_limiter
from app.db.models import (
    AnswerOption,
    Discipline,
    DisciplineTopic,
    Group,
    Question,
    QuestionImage,
    Student,
    StudentAnswer,
    Teacher,
    TeacherDiscipline,
    TestSession,
    AnswerFileUpload,
    FileUploadGrade,
)
from app.db.session import get_session
from app.schemas.teacher import (
    BulkArchiveQuestionsIn,
    BulkArchiveQuestionsOut,
    BulkArchiveSkip,
    DisciplineRow,
    GroupOut,
    GroupStudentRow,
    GroupStudentsOut,
    OptionIn,
    QuestionIn,
    QuestionOut,
    QuestionWithOptions,
    StudentAnswerDetail,
    StudentDetailDiscipline,
    StudentDetailOut,
    StudentDetailSession,
    TeacherStudentActivityOut,
    TeacherDisciplinesOut,
    TeacherDiagnosticsOut,
    TestConfigIn,
    TestConfigOut,
    PendingFileReviewsOut,
    PendingFileReviewItem,
    SessionFileAnswersOut,
    StudentBriefOut,
    AnswerFileUploadOut,
    FileUploadGradeOut,
    FileUploadGradeIn,
    FileAnswerQuestionOut,
)
from app.services.question_images import delete_storage_file, image_out
from app.services.audit_trail import client_ip
from app.services.teacher_audit import audit as teacher_audit_log  # TZ tz-teacher-production-ready.md § 3.9
from app.services.teacher_diagnostics import build_teacher_diagnostics
from app.services.student_activity import (
    build_student_activity,
    student_activity_summary,
    teacher_can_view_student_activity,
)
from app.services.versioning import ensure_discipline_policy_version, ensure_question_version, session_question_snapshots, snapshot_question_meta
from app.services.grading_v2 import grade_session
from app.services.file_storage import delete_student_file
from app.services.notifications_helpers import store_and_publish
from app.services.teacher_notifications import notify_teacher

router = APIRouter(prefix="/api/teacher", tags=["teacher"])


def _teacher_discipline_ids_subquery(teacher_id: int):
    return select(TeacherDiscipline.discipline_id).where(TeacherDiscipline.teacher_id == teacher_id)


async def _ensure_topic_for_question(
    session: AsyncSession,
    discipline_id: int,
    topic_id: int | None,
) -> DisciplineTopic | None:
    if topic_id is None:
        return None
    topic = (await session.execute(
        select(DisciplineTopic).where(DisciplineTopic.topic_id == topic_id)
    )).scalar_one_or_none()
    if topic is None or topic.archived_at is not None:
        raise HTTPException(status_code=404, detail="topic not found")
    if topic.discipline_id != discipline_id:
        raise HTTPException(status_code=400, detail="topic does not belong to discipline")
    return topic


@router.get("/disciplines", response_model=TeacherDisciplinesOut)
async def my_disciplines(
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> TeacherDisciplinesOut:
    rows = (await session.execute(
        select(
            Discipline.discipline_id,
            Discipline.name,
            Discipline.description,
            TeacherDiscipline.time_limit_minutes,
            TeacherDiscipline.question_count,
        )
        .join(TeacherDiscipline, TeacherDiscipline.discipline_id == Discipline.discipline_id)
        .where(TeacherDiscipline.teacher_id == user.id)
        .order_by(Discipline.name)
    )).all()
    return TeacherDisciplinesOut(disciplines=[
        DisciplineRow(
            discipline_id=did, name=name, description=desc,
            time_limit_minutes=tl, question_count=qc,
        ) for did, name, desc, tl, qc in rows
    ])


@router.get("/diagnostics/disciplines", response_model=TeacherDiagnosticsOut)
async def discipline_diagnostics(
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> TeacherDiagnosticsOut:
    data = await build_teacher_diagnostics(session, teacher_id=user.id)
    return TeacherDiagnosticsOut(**data)


@router.put("/disciplines/{discipline_id}/config", response_model=TestConfigOut)
async def update_test_config(
    discipline_id: int,
    cfg: TestConfigIn,
    request: Request,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> TestConfigOut:
    td = (await session.execute(
        select(TeacherDiscipline).where(
            TeacherDiscipline.teacher_id == user.id,
            TeacherDiscipline.discipline_id == discipline_id,
        )
    )).scalar_one_or_none()
    if td is None:
        after = {
            "discipline_id": discipline_id,
            "time_limit_minutes": cfg.time_limit_minutes,
            "question_count": cfg.question_count,
        }
        session.add(TeacherDiscipline(
            teacher_id=user.id,
            discipline_id=discipline_id,
            time_limit_minutes=cfg.time_limit_minutes,
            question_count=cfg.question_count,
        ))
        await session.flush()
        await ensure_discipline_policy_version(
            session,
            teacher_id=user.id,
            discipline_id=discipline_id,
            created_by_teacher_id=user.id,
        )
        await teacher_audit_log(
            session,
            teacher_id=user.id,
            action="test_config_created",
            target_type="discipline",
            target_id=discipline_id,
            before=None,
            after=after,
            ip_addr=client_ip(request),
        )
        await session.commit()
        return TestConfigOut(
            teacher_id=user.id,
            discipline_id=discipline_id,
            time_limit_minutes=cfg.time_limit_minutes,
            question_count=cfg.question_count,
        )
    before = {
        "discipline_id": discipline_id,
        "time_limit_minutes": td.time_limit_minutes,
        "question_count": td.question_count,
    }
    td.time_limit_minutes = cfg.time_limit_minutes
    td.question_count = cfg.question_count
    await ensure_discipline_policy_version(
        session,
        teacher_id=user.id,
        discipline_id=discipline_id,
        created_by_teacher_id=user.id,
    )
    await teacher_audit_log(
        session,
        teacher_id=user.id,
        action="test_config_updated",
        target_type="discipline",
        target_id=discipline_id,
        before=before,
        after={
            "discipline_id": discipline_id,
            "time_limit_minutes": td.time_limit_minutes,
            "question_count": td.question_count,
        },
        ip_addr=client_ip(request),
    )
    await session.commit()
    return TestConfigOut(
        teacher_id=user.id,
        discipline_id=discipline_id,
        time_limit_minutes=cfg.time_limit_minutes,
        question_count=cfg.question_count,
    )


@router.get("/questions", response_model=List[QuestionWithOptions])
async def list_questions(
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
    discipline_id: int | None = None,
):
    q = select(Question).where(Question.discipline_id.in_(_teacher_discipline_ids_subquery(user.id)))
    if discipline_id is not None:
        q = q.where(Question.discipline_id == discipline_id)
    q = q.order_by(Question.discipline_id, Question.question_id)
    questions = (await session.execute(q)).scalars().all()
    if not questions:
        return []
    q_ids = [q.question_id for q in questions]
    opts = (await session.execute(
        select(AnswerOption).where(AnswerOption.question_id.in_(q_ids)).order_by(
            AnswerOption.question_id, AnswerOption.option_number
        )
    )).scalars().all()
    grouped: dict[int, list[AnswerOption]] = {}
    for o in opts:
        grouped.setdefault(o.question_id, []).append(o)
    image_rows = (await session.execute(
        select(QuestionImage).where(QuestionImage.question_id.in_(q_ids))
    )).scalars().all()
    images_by_q = {img.question_id: img for img in image_rows}
    topic_ids = sorted({qq.topic_id for qq in questions if qq.topic_id is not None})
    topic_names: dict[int, str] = {}
    if topic_ids:
        topic_rows = (await session.execute(
            select(DisciplineTopic.topic_id, DisciplineTopic.name).where(DisciplineTopic.topic_id.in_(topic_ids))
        )).all()
        topic_names = {tid: name for tid, name in topic_rows}
    return [
        QuestionWithOptions(
            question_id=qq.question_id,
            discipline_id=qq.discipline_id,
            topic_id=qq.topic_id,
            topic_name=topic_names.get(qq.topic_id) if qq.topic_id is not None else None,
            text=qq.text,
            difficulty=qq.difficulty,
            options=[
                OptionIn(option_number=o.option_number, text=o.text, is_correct=o.is_correct)
                for o in grouped.get(qq.question_id, [])
            ],
            image=image_out(images_by_q[qq.question_id]) if qq.question_id in images_by_q else None,
        ) for qq in questions
    ]


@router.post("/questions", response_model=QuestionOut, status_code=201)
async def create_question(
    payload: QuestionIn,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> QuestionOut:
    own = (await session.execute(_teacher_discipline_ids_subquery(user.id))).scalars().all()
    if payload.discipline_id not in own:
        raise HTTPException(status_code=403, detail="not your discipline")
    await _ensure_topic_for_question(session, payload.discipline_id, payload.topic_id)

    qtype = getattr(payload, "qtype", None) or "single"

    _validate_question_payload(qtype, payload)
    import json
    q = Question(
        discipline_id=payload.discipline_id,
        topic_id=payload.topic_id,
        text=payload.text,
        difficulty=payload.difficulty,
        qtype=qtype,
        short_pattern=getattr(payload, "short_pattern", None),
        numeric_tolerance=getattr(payload, "numeric_tolerance", None),
        match_pairs=getattr(payload, "match_pairs", None),
        correct_bool=getattr(payload, "correct_bool", None),
        explanation=getattr(payload, "explanation", None),
        case_sensitive=getattr(payload, "case_sensitive", False) or False,
        trim_whitespace=getattr(payload, "trim_whitespace", True) if getattr(payload, "trim_whitespace", None) is not None else True,
        normalize_universal=getattr(payload, "normalize_universal", True) if getattr(payload, "normalize_universal", None) is not None else True,
        text_mode=getattr(payload, "text_mode", None) or "string",
        allow_partial=getattr(payload, "allow_partial", False) or False,
        file_allowed_types=json.dumps(payload.file_allowed_types) if payload.file_allowed_types else None,
        file_max_size_bytes=payload.file_max_size_bytes,
        file_max_count=payload.file_max_count,
        points=payload.points if payload.points is not None else 1.0,
    )
    session.add(q)
    await session.flush()
    _persist_options(session, q.question_id, qtype, payload.options)
    _persist_acceptable_answers(session, q.question_id, qtype, getattr(payload, "acceptable_answers", None))
    _persist_cloze_blanks(session, q.question_id, getattr(payload, "cloze_blanks", None))
    tag_ids = getattr(payload, "tag_ids", []) or []
    for tid in tag_ids:
        await session.execute(
            __import__("sqlalchemy").text(
                "INSERT INTO question_tag_map (question_id, tag_id) VALUES (:q, :t) ON CONFLICT DO NOTHING"
            ).bindparams(q=q.question_id, t=tid),
        )
    await ensure_question_version(session, q.question_id, created_by_teacher_id=user.id)
    await teacher_audit_log(
        session,
        teacher_id=user.id,
        action="question_created",
        target_type="question",
        target_id=q.question_id,
        before=None,
        after={"qtype": qtype, "discipline_id": payload.discipline_id, "topic_id": payload.topic_id},
    )
    await session.commit()
    await session.refresh(q)
    return await _serialize_question(session, q)


@router.put("/questions/{question_id}", response_model=QuestionOut)
async def update_question(
    question_id: int,
    payload: QuestionIn,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> QuestionOut:
    q = (await session.execute(select(Question).where(Question.question_id == question_id))).scalar_one_or_none()
    if q is None:
        raise HTTPException(status_code=404, detail="question not found")
    own = (await session.execute(_teacher_discipline_ids_subquery(user.id))).scalars().all()
    if q.discipline_id not in own:
        raise HTTPException(status_code=403, detail="not your discipline")
    if payload.discipline_id not in own:
        raise HTTPException(status_code=403, detail="not your discipline")
    await _ensure_topic_for_question(session, payload.discipline_id, payload.topic_id)

    qtype = getattr(payload, "qtype", None) or "single"
    _validate_question_payload(qtype, payload)

    import json
    q.discipline_id = payload.discipline_id
    q.topic_id = payload.topic_id
    q.text = payload.text
    q.difficulty = payload.difficulty
    q.qtype = qtype
    q.short_pattern = getattr(payload, "short_pattern", None)
    q.numeric_tolerance = getattr(payload, "numeric_tolerance", None)
    q.match_pairs = getattr(payload, "match_pairs", None)
    q.correct_bool = getattr(payload, "correct_bool", None)
    q.explanation = getattr(payload, "explanation", None)
    q.case_sensitive = bool(getattr(payload, "case_sensitive", False))
    q.trim_whitespace = True if getattr(payload, "trim_whitespace", None) is None else bool(getattr(payload, "trim_whitespace"))
    q.normalize_universal = True if getattr(payload, "normalize_universal", None) is None else bool(getattr(payload, "normalize_universal"))
    q.text_mode = getattr(payload, "text_mode", None) or "string"
    q.allow_partial = bool(getattr(payload, "allow_partial", False))
    q.file_allowed_types = json.dumps(payload.file_allowed_types) if payload.file_allowed_types else None
    q.file_max_size_bytes = payload.file_max_size_bytes
    q.file_max_count = payload.file_max_count
    q.points = payload.points if payload.points is not None else 1.0

    await session.execute(delete(AnswerOption).where(AnswerOption.question_id == q.question_id))
    _persist_options(session, q.question_id, qtype, payload.options)
    await session.execute(text("DELETE FROM question_acceptable_answers WHERE question_id = :qid").bindparams(qid=q.question_id))
    _persist_acceptable_answers(session, q.question_id, qtype, getattr(payload, "acceptable_answers", None))
    await session.execute(text("DELETE FROM question_cloze_blanks WHERE question_id = :qid").bindparams(qid=q.question_id))
    _persist_cloze_blanks(session, q.question_id, getattr(payload, "cloze_blanks", None))
    await ensure_question_version(session, q.question_id, created_by_teacher_id=user.id)
    await session.commit()
    return await _serialize_question(session, q)


def _validate_question_payload(qtype: str, payload) -> None:
    if qtype == "single":
        if len(payload.options) != 4:
            raise HTTPException(status_code=400, detail="single: exactly 4 options")
        nums = sorted(o.option_number for o in payload.options)
        if nums != [1, 2, 3, 4]:
            raise HTTPException(status_code=400, detail="single: option_number must be 1..4 unique")
        if sum(1 for o in payload.options if o.is_correct) != 1:
            raise HTTPException(status_code=400, detail="single: exactly one option must be correct")
    elif qtype == "multi":
        if len(payload.options) != 4:
            raise HTTPException(status_code=400, detail="multi: exactly 4 options")
        if sorted(o.option_number for o in payload.options) != [1, 2, 3, 4]:
            raise HTTPException(status_code=400, detail="multi: option_number must be 1..4 unique")
        n_correct = sum(1 for o in payload.options if o.is_correct)
        if n_correct < 1 or n_correct > 3:
            raise HTTPException(status_code=400, detail="multi: 1..3 options must be correct")
    elif qtype in ("short", "numeric"):
        if len(payload.options) != 4:
            raise HTTPException(status_code=400, detail=f"{qtype}: exactly 4 options")
        if sorted(o.option_number for o in payload.options) != [1, 2, 3, 4]:
            raise HTTPException(status_code=400, detail=f"{qtype}: option_number 1..4 unique")
        if sum(1 for o in payload.options if o.is_correct) != 1:
            raise HTTPException(status_code=400, detail=f"{qtype}: 1 correct option")
    elif qtype == "match":
        if not getattr(payload, "match_pairs", None):
            raise HTTPException(status_code=400, detail="match: match_pairs required")
    elif qtype == "text":
        answers = getattr(payload, "acceptable_answers", None) or []
        if not any((a or "").strip() for a in answers):
            raise HTTPException(status_code=400, detail="text: acceptable_answer required")
        if (getattr(payload, "text_mode", None) or "string") not in ("string", "number"):
            raise HTTPException(status_code=400, detail="text: text_mode must be 'string' or 'number'")
    elif qtype == "order":
        if len(payload.options) < 4 or len(payload.options) > 15:
            raise HTTPException(400, detail="order: 4..15 options required")
        positions = [o.correct_position for o in payload.options if o.correct_position is not None]
        if len(set(positions)) != len(positions):
            raise HTTPException(400, detail="order: correct_position must be unique")
        if sorted(positions) != list(range(1, len(payload.options) + 1)):
            raise HTTPException(
                400, detail=f"order: correct_position must cover 1..{len(payload.options)}",
            )
    elif qtype == "bool":
        if getattr(payload, "correct_bool", None) is None:
            raise HTTPException(400, detail="bool: correct_bool required")
    elif qtype == "cloze":
        blanks = getattr(payload, "cloze_blanks", None) or []
        if not blanks:
            raise HTTPException(400, detail="cloze: cloze_blanks required")
        for b in blanks:
            if b.kind == "select":
                if not b.options:
                    raise HTTPException(400, detail="cloze: select blank requires options")
                if b.correct_index is None or b.correct_index < 0 or b.correct_index >= len(b.options):
                    raise HTTPException(400, detail="cloze: correct_index out of range")
            elif b.kind == "input":
                if not (b.acceptable_answers or []):
                    raise HTTPException(400, detail="cloze: input blank requires acceptable_answers")
            else:
                raise HTTPException(400, detail=f"cloze: unknown blank kind {b.kind}")
    elif qtype == "file_upload":
        points = getattr(payload, "points", None)
        if points is not None and points <= 0:
            raise HTTPException(status_code=400, detail="file_upload: points must be > 0")
        max_count = getattr(payload, "file_max_count", 1) or 1
        if not (1 <= max_count <= 5):
            raise HTTPException(status_code=400, detail="file_upload: file_max_count must be 1..5")
        max_size = getattr(payload, "file_max_size_bytes", 10485760) or 10485760
        if max_size > 52_428_800:
            raise HTTPException(status_code=400, detail="file_upload: file_max_size_bytes must be <= 50 MB")
    else:
        raise HTTPException(status_code=400, detail=f"unknown qtype: {qtype}")


def _persist_options(session, qid: int, qtype: str, options) -> None:
    for idx, o in enumerate(options or [], start=1):
        correct_position = (
            o.correct_position if hasattr(o, "correct_position") and o.correct_position is not None
            else idx if qtype == "order" else None
        )
        if qtype == "order":
            # ignore is_correct for ordering questions; only correct_position is meaningful
            session.add(AnswerOption(
                question_id=qid,
                option_number=o.option_number,
                text=o.text,
                is_correct=False,
                correct_position=o.correct_position,
            ))
        else:
            session.add(AnswerOption(
                question_id=qid,
                option_number=o.option_number,
                text=o.text,
                is_correct=o.is_correct,
                match_left=o.match_left,
                match_right=o.match_right,
            ))


def _persist_acceptable_answers(session, qid: int, qtype: str, answers) -> None:
    if qtype != "text":
        return
    from app.db.models import QuestionAcceptableAnswer
    for idx, raw in enumerate(answers or [], start=1):
        if raw is None:
            continue
        text_value = str(raw)
        if not text_value.strip():
            continue
        session.add(QuestionAcceptableAnswer(
            question_id=qid, ord=idx, answer=text_value,
        ))


def _persist_cloze_blanks(session, qid: int, blanks) -> None:
    from app.db.models import QuestionClozeBlank
    for b in blanks or []:
        session.add(QuestionClozeBlank(
            question_id=qid,
            blank_index=b.index,
            kind=b.kind,
            options=b.options,
            correct_index=b.correct_index,
            acceptable_answers=b.acceptable_answers,
            case_sensitive=bool(b.case_sensitive),
            trim_whitespace=bool(b.trim_whitespace),
            normalize_universal=bool(b.normalize_universal),
        ))


@router.post("/questions/{question_id}/duplicate", response_model=QuestionOut, status_code=201)
async def duplicate_question(
    question_id: int,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> QuestionOut:
    """TZ tz-teacher-production-ready.md § 3.5.2 — копирование вопроса.

    Создаёт новый вопрос-копию с пометкой «(копия)» в тексте и теми же
    настройками, что и оригинал. Возвращает его в режиме редактирования.
    """
    src = (await session.execute(
        select(Question)
        .options(
            selectinload(Question.options),
            selectinload(Question.tags),
        )
        .where(Question.question_id == question_id)
    )).scalar_one_or_none()
    if src is None:
        raise HTTPException(status_code=404, detail="question not found")
    own = (await session.execute(_teacher_discipline_ids_subquery(user.id))).scalars().all()
    if src.discipline_id not in own:
        raise HTTPException(status_code=403, detail="not your discipline")

    cloned_text = (src.text or "").rstrip()
    suffix = " (копия)"
    if not cloned_text.endswith(suffix):
        cloned_text = f"{cloned_text}{suffix}" if cloned_text else "(копия)"

    copy = Question(
        discipline_id=src.discipline_id,
        topic_id=src.topic_id,
        text=cloned_text,
        difficulty=src.difficulty,
        qtype=src.qtype,
        short_pattern=src.short_pattern,
        numeric_tolerance=src.numeric_tolerance,
        match_pairs=list(src.match_pairs) if src.match_pairs else None,
        correct_bool=src.correct_bool,
        explanation=src.explanation,
        case_sensitive=src.case_sensitive,
        trim_whitespace=src.trim_whitespace,
        normalize_universal=src.normalize_universal,
        text_mode=src.text_mode,
        allow_partial=src.allow_partial,
    )
    session.add(copy)
    await session.flush()

    # Копируем опции, сохраняя текст/правильность, но даём новые id.
    from app.db.models import AnswerOption
    for o in (src.options or []):
        copt = AnswerOption(
            question_id=copy.question_id,
            option_number=o.option_number,
            text=o.text,
            is_correct=o.is_correct,
            match_left=o.match_left,
            match_right=o.match_right,
            correct_position=o.correct_position,
        )
        session.add(copt)
    await session.flush()

    # Копируем acceptable_answers (text-тип).
    from sqlalchemy.sql import text as _sql_text
    rows = (await session.execute(
        _sql_text("SELECT answer, ord FROM question_acceptable_answers WHERE question_id = :q ORDER BY ord")
        .bindparams(q=src.question_id)
    )).all()
    for ans, ord in rows:
        await session.execute(
            _sql_text(
                "INSERT INTO question_acceptable_answers (question_id, answer, ord) "
                "VALUES (:q, :a, :o)"
            ).bindparams(q=copy.question_id, a=ans, o=ord)
        )

    await ensure_question_version(session, copy.question_id, created_by_teacher_id=user.id)
    await teacher_audit_log(
        session,
        teacher_id=user.id,
        action="question_duplicated",
        target_type="question",
        target_id=copy.question_id,
        before={"source_question_id": src.question_id},
        after={"new_question_id": copy.question_id, "discipline_id": copy.discipline_id},
    )
    await session.commit()
    await session.refresh(copy)
    return await _serialize_question(session, copy)


async def _serialize_question(session, q) -> QuestionOut:
    from app.db.models import QuestionAcceptableAnswer, QuestionClozeBlank
    from sqlalchemy import select

    answers: list[str] = []
    cloze: list[dict] = []
    if q.qtype == "text":
        rows = (await session.execute(
            select(QuestionAcceptableAnswer.answer)
            .where(QuestionAcceptableAnswer.question_id == q.question_id)
            .order_by(QuestionAcceptableAnswer.ord)
        )).all()
        answers = [r[0] for r in rows]
    if q.qtype == "cloze":
        blanks = (await session.execute(
            select(QuestionClozeBlank).where(QuestionClozeBlank.question_id == q.question_id).order_by(QuestionClozeBlank.blank_index)
        )).scalars().all()
        cloze = [
            {
                "index": b.blank_index,
                "kind": b.kind,
                "options": b.options,
                "correct_index": b.correct_index,
                "acceptable_answers": b.acceptable_answers,
                "case_sensitive": b.case_sensitive,
                "trim_whitespace": b.trim_whitespace,
                "normalize_universal": b.normalize_universal,
            }
            for b in blanks
        ]
    import json
    return QuestionOut(
        question_id=q.question_id,
        discipline_id=q.discipline_id,
        topic_id=q.topic_id,
        text=q.text,
        difficulty=q.difficulty,
        qtype=q.qtype,
        short_pattern=q.short_pattern,
        numeric_tolerance=float(q.numeric_tolerance) if q.numeric_tolerance is not None else None,
        match_pairs=q.match_pairs or [],
        acceptable_answers=answers,
        correct_bool=q.correct_bool,
        explanation=q.explanation,
        case_sensitive=q.case_sensitive,
        trim_whitespace=q.trim_whitespace,
        normalize_universal=q.normalize_universal,
        text_mode=q.text_mode,
        allow_partial=q.allow_partial,
        cloze_blanks=cloze,
        file_allowed_types=json.loads(q.file_allowed_types) if q.file_allowed_types else None,
        file_max_size_bytes=q.file_max_size_bytes,
        file_max_count=q.file_max_count,
        points=float(q.points) if q.points is not None else 1.0,
    )


def _now_utc():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc)


@router.delete("/questions/{question_id}", status_code=204)
async def delete_question(
    question_id: int,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    q = (await session.execute(
        select(Question).where(
            Question.question_id == question_id,
            Question.archived_at.is_(None),
        )
    )).scalar_one_or_none()
    if q is None:
        raise HTTPException(status_code=404, detail="question not found")
    own = (await session.execute(_teacher_discipline_ids_subquery(user.id))).scalars().all()
    if q.discipline_id not in own:
        raise HTTPException(status_code=403, detail="not your discipline")
    used = (await session.execute(
        select(func.count()).select_from(StudentAnswer).where(StudentAnswer.question_id == question_id)
    )).scalar_one()
    if used > 0:
        raise HTTPException(status_code=409, detail="question already used in attempts")
    q.archived_at = _now_utc()
    await ensure_question_version(session, q.question_id, created_by_teacher_id=user.id)
    await teacher_audit_log(
        session,
        teacher_id=user.id,
        action="question_archived",
        target_type="question",
        target_id=question_id,
        before={"archived_at": None},
        after={"archived_at": q.archived_at.isoformat() if q.archived_at else None},
    )
    await session.commit()
    return None


@router.post("/questions/{question_id}/restore", status_code=204)
async def restore_question(
    question_id: int,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    q = (await session.execute(
        select(Question).where(Question.question_id == question_id)
    )).scalar_one_or_none()
    if q is None:
        raise HTTPException(status_code=404, detail="question not found")
    own = (await session.execute(_teacher_discipline_ids_subquery(user.id))).scalars().all()
    if q.discipline_id not in own:
        raise HTTPException(status_code=403, detail="not your discipline")
    before_archived_at = q.archived_at
    q.archived_at = None
    await ensure_question_version(session, q.question_id, created_by_teacher_id=user.id)
    await teacher_audit_log(
        session,
        teacher_id=user.id,
        action="question_restored",
        target_type="question",
        target_id=question_id,
        before={"archived_at": before_archived_at.isoformat() if before_archived_at else None},
        after={"archived_at": None},
    )
    await session.commit()
    return None


@router.post("/questions/{question_id}/topic")
async def change_question_topic(
    question_id: int,
    payload: dict,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Меняет только тему (topic_id) у вопроса — отдельный мини-endpoint
    специально для UX-сценария «из банка перетащить вопрос в другую тему».

    Полный PUT /questions/{id} требует полный payload (qtype, options и т.д.),
    и для типов вроде bool/order/cloze что-то часто не подгружается → 400 →
    «Не удалось связаться с сервером». Этот endpoint принимает только `topic_id`,
    валидирует только членство темы в той же дисциплине, и сразу сохраняет.
    """
    new_topic_id = payload.get("topic_id")
    # NULL допустимо: «Без темы».
    if new_topic_id is not None and not isinstance(new_topic_id, int):
        raise HTTPException(status_code=422, detail="topic_id must be int or null")
    q = (await session.execute(
        select(Question).where(
            Question.question_id == question_id,
            Question.archived_at.is_(None),
        )
    )).scalar_one_or_none()
    if q is None:
        raise HTTPException(status_code=404, detail="question not found")
    own = (await session.execute(_teacher_discipline_ids_subquery(user.id))).scalars().all()
    if q.discipline_id not in own:
        raise HTTPException(status_code=403, detail="not your discipline")
    if new_topic_id is not None:
        topic = (await session.execute(
            select(DisciplineTopic).where(DisciplineTopic.topic_id == new_topic_id)
        )).scalar_one_or_none()
        if topic is None:
            raise HTTPException(status_code=404, detail="topic not found")
        if topic.discipline_id != q.discipline_id:
            raise HTTPException(
                status_code=409,
                detail="topic does not belong to discipline",
            )
    prev_topic_id = q.topic_id
    q.topic_id = new_topic_id
    await ensure_question_version(session, q.question_id, created_by_teacher_id=user.id)
    await teacher_audit_log(
        session,
        teacher_id=user.id,
        action="topic_changed",
        target_type="question",
        target_id=question_id,
        before={"topic_id": prev_topic_id},
        after={"topic_id": new_topic_id},
    )
    await session.commit()
    return {"ok": True, "question_id": question_id, "topic_id": new_topic_id}


@router.post("/questions/bulk-topic")
async def bulk_change_questions_topic(
    payload: dict,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> dict:
    question_ids = payload.get("question_ids")
    new_topic_id = payload.get("topic_id")
    if not isinstance(question_ids, list):
        raise HTTPException(status_code=422, detail="question_ids must be a list of ints")
    if new_topic_id is not None and not isinstance(new_topic_id, int):
        raise HTTPException(status_code=422, detail="topic_id must be int or null")
        
    own = (await session.execute(_teacher_discipline_ids_subquery(user.id))).scalars().all()
    own_set = set(int(x) for x in own)
    
    rows = (await session.execute(
        select(Question).where(Question.question_id.in_(question_ids), Question.archived_at.is_(None))
    )).scalars().all()
    
    if not rows:
        return {"ok": True, "count": 0}
        
    if new_topic_id is not None:
        topic = (await session.execute(
            select(DisciplineTopic).where(DisciplineTopic.topic_id == new_topic_id)
        )).scalar_one_or_none()
        if topic is None:
            raise HTTPException(status_code=404, detail="topic not found")
        if topic.discipline_id not in own_set:
            raise HTTPException(status_code=403, detail="not your discipline's topic")
            
    updated = 0
    for q in rows:
        if q.discipline_id not in own_set:
            continue
        if new_topic_id is not None:
            if q.discipline_id != topic.discipline_id:
                continue
        q.topic_id = new_topic_id
        await ensure_question_version(session, q.question_id, created_by_teacher_id=user.id)
        updated += 1
        
    if updated:
        await teacher_audit_log(
            session,
            teacher_id=user.id,
            action="bulk_topic_change",
            target_type="question",
            target_id=None,
            before={"count": updated},
            after={"question_ids": [q.question_id for q in rows], "topic_id": new_topic_id},
        )
        await session.commit()
        
    return {"ok": True, "count": updated}


@router.post("/questions/bulk-archive", response_model=BulkArchiveQuestionsOut, dependencies=[Depends(bulk_archive_limiter)])
async def bulk_archive_questions(
    payload: BulkArchiveQuestionsIn,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> BulkArchiveQuestionsOut:
    """
    Архивирует сразу несколько вопросов (soft-delete — ставит `archived_at`).

    Используется двумя сценариями UI:
      1. Множественный выбор в банке вопросов (CTRL+click).
      2. Кнопка «Удалить все вопросы» — вызывает этот же эндпоинт
         со всем списком id'ов текущего фильтра.

    Не возвращает 4xx, если часть вопросов нельзя архивировать
    (уже архивные / чужая дисциплина / id не существует):
    эти id попадают в `errors[]` с понятной `reason`. UI их показывает списком.
    """
    own = (await session.execute(_teacher_discipline_ids_subquery(user.id))).scalars().all()
    own_set = set(int(x) for x in own)

    # Снимаем дубли и сохраняем порядок — это важно для UX («нельзя удалить 3 и 7»).
    seen: set[int] = set()
    uniq_ids: list[int] = []
    for qid in payload.question_ids:
        if qid in seen:
            continue
        seen.add(qid)
        uniq_ids.append(qid)

    rows = (await session.execute(
        select(Question).where(Question.question_id.in_(uniq_ids))
    )).scalars().all()

    by_id = {q.question_id: q for q in rows}
    archived = 0
    skipped = 0
    errors: list[BulkArchiveSkip] = []

    for qid in uniq_ids:
        q = by_id.get(qid)
        if q is None:
            errors.append(BulkArchiveSkip(question_id=qid, reason="not found"))
            skipped += 1
            continue
        if q.discipline_id not in own_set:
            errors.append(BulkArchiveSkip(question_id=qid, reason="not your discipline"))
            skipped += 1
            continue
        
        if payload.archived:
            if q.archived_at is not None:
                errors.append(BulkArchiveSkip(question_id=qid, reason="already archived"))
                skipped += 1
                continue
            q.archived_at = _now_utc()
            await ensure_question_version(session, q.question_id, created_by_teacher_id=user.id)
            archived += 1
        else:
            if q.archived_at is None:
                errors.append(BulkArchiveSkip(question_id=qid, reason="already active"))
                skipped += 1
                continue
            q.archived_at = None
            await ensure_question_version(session, q.question_id, created_by_teacher_id=user.id)
            archived += 1

    if archived:
        await teacher_audit_log(
            session,
            teacher_id=user.id,
            action="bulk_archive" if payload.archived else "bulk_restore",
            target_type="question",
            target_id=None,
            before={"count": archived},
            after={
                "question_ids": [
                    qid for qid in uniq_ids
                    if qid in by_id and (
                        by_id[qid].archived_at is not None if payload.archived else by_id[qid].archived_at is None
                    )
                ],
                "skipped": skipped,
            },
        )
        await session.commit()

    return BulkArchiveQuestionsOut(archived=archived, skipped=skipped, errors=errors)


@router.get("/groups", response_model=List[GroupOut])
async def list_groups(
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    rows = (await session.execute(text(
        """
        SELECT g.group_id, g.name,
               (
                 SELECT COUNT(*) FROM students s
                  WHERE s.group_id = g.group_id
               ) AS student_count
          FROM groups g
         WHERE EXISTS (
             SELECT 1 FROM students s
              JOIN test_sessions ts ON ts.student_id = s.student_id
              WHERE s.group_id = g.group_id
                AND ts.discipline_id IN (
                    SELECT discipline_id FROM teacher_disciplines WHERE teacher_id = :tid
                )
         )
         ORDER BY g.name
        """
    ).bindparams(tid=user.id))).all()
    return [GroupOut(group_id=gid, name=name, student_count=sc) for gid, name, sc in rows]


@router.get("/groups/{group_id}/students", response_model=GroupStudentsOut)
async def list_group_students(
    group_id: int,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    g = (await session.execute(select(Group).where(Group.group_id == group_id))).scalar_one_or_none()
    if g is None:
        raise HTTPException(status_code=404, detail="group not found")
    rows = (await session.execute(text(
        """
        SELECT s.student_id, s.last_name, s.first_name, s.middle_name, s.email,
               COALESCE(AVG((ts.score::float / NULLIF(ts.max_score, 0)) * 100), 0) AS avg_pct,
               COALESCE(COUNT(ts.session_id) FILTER (WHERE ts.completed_at IS NOT NULL), 0) AS sessions_count
          FROM students s
          LEFT JOIN test_sessions ts
            ON ts.student_id = s.student_id
           AND ts.completed_at IS NOT NULL
           AND ts.discipline_id IN (SELECT discipline_id FROM teacher_disciplines WHERE teacher_id = :tid)
         WHERE s.group_id = :gid
         GROUP BY s.student_id, s.last_name, s.first_name, s.middle_name, s.email
         ORDER BY s.last_name, s.first_name
        """
    ).bindparams(tid=user.id, gid=group_id))).all()
    students = [
        GroupStudentRow(
            student_id=sid,
            full_name=f"{ln} {fn} {mn or ''}".strip(),
            email=em,
            average_score=round(float(avg), 2) if avg is not None else None,
            sessions_count=sc,
        ) for sid, ln, fn, mn, em, avg, sc in rows
    ]
    return GroupStudentsOut(group_id=group_id, group_name=g.name, students=students)


@router.get("/students/{student_id}", response_model=StudentDetailOut)
async def student_detail(
    student_id: int,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    st = (await session.execute(select(Student).where(Student.student_id == student_id))).scalar_one_or_none()
    if st is None:
        raise HTTPException(status_code=404, detail="student not found")
    g = None
    if st.group_id is not None:
        g = (await session.execute(select(Group).where(Group.group_id == st.group_id))).scalar_one_or_none()

    own_discs = (await session.execute(
        select(Discipline.discipline_id, Discipline.name)
        .join(TeacherDiscipline, TeacherDiscipline.discipline_id == Discipline.discipline_id)
        .where(TeacherDiscipline.teacher_id == user.id)
        .order_by(Discipline.name)
    )).all()

    rows = (await session.execute(text(
        """
        SELECT
            d.discipline_id,
            d.name AS discipline_name,
            ts.session_id,
            ts.started_at,
            ts.completed_at,
            ts.score,
            ts.max_score,
            q.text AS question_text,
            ao.text AS chosen_option_text,
            ao.is_correct AS is_answer_correct,
            sa.question_id AS sa_question_id,
            ts.topic_id,
            dt.name AS topic_name,
            ts.comment AS session_comment
          FROM test_sessions ts
          JOIN disciplines d ON d.discipline_id = ts.discipline_id
          LEFT JOIN discipline_topics dt ON dt.topic_id = ts.topic_id
          LEFT JOIN student_answers sa ON sa.session_id = ts.session_id
          LEFT JOIN questions q        ON q.question_id = sa.question_id
          LEFT JOIN answer_options ao  ON ao.option_id = sa.selected_option_id
         WHERE ts.student_id = :sid
           AND ts.teacher_id = :tid
           AND ts.discipline_id IN (
               SELECT discipline_id FROM teacher_disciplines WHERE teacher_id = :tid
           )
         ORDER BY ts.started_at DESC, ts.session_id, q.question_id
        """
    ).bindparams(sid=student_id, tid=user.id))).all()

    import asyncio
    loops = (await session.execute(text("""
        SELECT session_id, override_score.score, override_score.reason
          FROM test_sessions_grade_override override_score
         WHERE session_id IN (
            SELECT ts.session_id FROM test_sessions ts
             WHERE ts.student_id = :sid AND ts.teacher_id = :tid
               AND ts.discipline_id IN (SELECT discipline_id FROM teacher_disciplines WHERE teacher_id = :tid)
         )
    """).bindparams(sid=student_id, tid=user.id))).all()
    overrides = {sid: (s, r) for sid, s, r in loops}

    comments_q = text("""
        SELECT session_id, question_id, body
          FROM answer_comments
         WHERE session_id IN (
            SELECT ts.session_id FROM test_sessions ts
             WHERE ts.student_id = :sid AND ts.teacher_id = :tid
               AND ts.discipline_id IN (SELECT discipline_id FROM teacher_disciplines WHERE teacher_id = :tid)
         )
    """).bindparams(sid=student_id, tid=user.id)
    cmt_rows = (await session.execute(comments_q)).all()
    cmt_map: dict[tuple[int, int], str] = {(s, q): body for s, q, body in cmt_rows}

    by_session_disc: dict[tuple[int, int], list[StudentAnswerDetail]] = {}
    session_meta: dict[int, dict] = {}
    for did, dname, sid, started_at, completed_at, score, max_score, qtext, ctext, is_correct, sa_qid, topic_id, topic_name, session_comment in rows:
        meta = session_meta.setdefault(sid, {
            "discipline_id": did,
            "discipline_name": dname,
            "started_at": started_at,
            "completed_at": completed_at,
            "score": score, "max_score": max_score,
            "score_overridden": False, "override_reason": None,
            "topic_id": topic_id,
            "topic_name": topic_name,
            "answers": [],
            "comment": session_comment,
        })
        meta["discipline_id"] = did
        meta["discipline_name"] = dname
        meta["topic_id"] = topic_id
        meta["topic_name"] = topic_name
        if qtext is not None and ctext is not None:
            meta["answers"].append(StudentAnswerDetail(
                question_id=sa_qid,
                question_text=qtext,
                chosen_option_text=ctext,
                is_answer_correct=bool(is_correct),
                comment=cmt_map.get((sid, sa_qid)),
            ))
        if sid in overrides:
            meta["score"] = overrides[sid][0]
            meta["score_overridden"] = True
            meta["override_reason"] = overrides[sid][1]

    by_disc: dict[int, StudentDetailDiscipline] = {}
    for sid, meta in session_meta.items():
        d = by_disc.setdefault(meta["discipline_id"], StudentDetailDiscipline(
            discipline_id=meta["discipline_id"],
            discipline_name=meta["discipline_name"],
            sessions=[],
        ))
        d.sessions.append(StudentDetailSession(
            session_id=sid,
            started_at=meta["started_at"],
            completed_at=meta["completed_at"],
            score=meta["score"],
            max_score=meta["max_score"],
            score_overridden=meta.get("score_overridden", False),
            override_reason=meta.get("override_reason"),
            topic_id=meta.get("topic_id"),
            topic_name=meta.get("topic_name"),
            answers=meta["answers"],
            comment=meta.get("comment"),
        ))
    for d in by_disc.values():
        d.sessions.sort(key=lambda s: s.started_at, reverse=True)

    return StudentDetailOut(
        student_id=st.student_id,
        full_name=f"{st.last_name} {st.first_name} {st.middle_name or ''}".strip(),
        email=st.email,
        group_name=g.name if g else None,
        disciplines=sorted(by_disc.values(), key=lambda d: d.discipline_name),
    )


@router.get("/students/{student_id}/activity", response_model=TeacherStudentActivityOut)
async def teacher_student_activity(
    student_id: int,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    source: str | None = Query(default=None, pattern="^(audit|notification|session)$"),
) -> TeacherStudentActivityOut:
    st = (await session.execute(
        select(Student).where(Student.student_id == student_id)
    )).scalar_one_or_none()
    if st is None:
        raise HTTPException(status_code=404, detail="student not found")
    if not await teacher_can_view_student_activity(
        session,
        teacher_id=user.id,
        student_id=student_id,
    ):
        raise HTTPException(status_code=403, detail="student activity is not available")

    items, total = await build_student_activity(
        session,
        student_id=student_id,
        limit=limit,
        offset=offset,
        source=source,  # type: ignore[arg-type]
    )
    summary = await student_activity_summary(session, student_id=student_id)
    return TeacherStudentActivityOut(
        student_id=student_id,
        student_full_name=f"{st.last_name} {st.first_name} {st.middle_name or ''}".strip(),
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        **summary,
    )


@router.get("/pending-file-reviews", response_model=PendingFileReviewsOut)
async def pending_file_reviews(
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
    discipline_id: int | None = Query(default=None),
    group_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
) -> PendingFileReviewsOut:
    stmt = (
        select(
            TestSession,
            Student,
            Group,
            Discipline,
            DisciplineTopic
        )
        .join(Student, Student.student_id == TestSession.student_id)
        .join(Group, Group.group_id == Student.group_id)
        .join(Discipline, Discipline.discipline_id == TestSession.discipline_id)
        .outerjoin(DisciplineTopic, DisciplineTopic.topic_id == TestSession.topic_id)
        .where(
            TestSession.status == "pending_file_grading",
            TestSession.discipline_id.in_(_teacher_discipline_ids_subquery(user.id))
        )
    )
    if discipline_id is not None:
        stmt = stmt.where(TestSession.discipline_id == discipline_id)
    if group_id is not None:
        stmt = stmt.where(Student.group_id == group_id)

    stmt = stmt.order_by(TestSession.started_at.desc())

    # We will page this
    offset_val = (page - 1) * limit
    stmt_paged = stmt.offset(offset_val).limit(limit)

    res = (await session.execute(stmt_paged)).all()

    total = (await session.execute(
        select(func.count())
        .select_from(TestSession)
        .join(Student, Student.student_id == TestSession.student_id)
        .where(
            TestSession.status == "pending_file_grading",
            TestSession.discipline_id.in_(_teacher_discipline_ids_subquery(user.id))
        )
    )).scalar_one() or 0

    items = []
    for row in res:
        sess_obj, student_obj, group_obj, disc_obj, topic_obj = row

        # Count total file upload questions in this session
        snapshots = await session_question_snapshots(session, sess_obj.session_id)
        if snapshots:
            file_q_ids = [item.question_id for item in snapshots if item.snapshot.get("qtype") == "file_upload"]
        else:
            from app.db.models import TestSessionQuestion
            file_q_ids = (await session.execute(
                select(Question.question_id)
                .join(TestSessionQuestion, TestSessionQuestion.question_id == Question.question_id)
                .where(TestSessionQuestion.session_id == sess_obj.session_id, Question.qtype == "file_upload")
            )).scalars().all()

        file_upload_count = len(file_q_ids)

        # Count how many are graded.
        graded_count = 0
        if file_q_ids:
            answers = (await session.execute(
                select(StudentAnswer.answer_id)
                .where(StudentAnswer.session_id == sess_obj.session_id, StudentAnswer.question_id.in_(file_q_ids))
            )).scalars().all()
            if answers:
                graded_count = (await session.execute(
                    select(func.count()).select_from(FileUploadGrade).where(FileUploadGrade.answer_id.in_(answers))
                )).scalar_one() or 0

        items.append(
            PendingFileReviewItem(
                session_id=sess_obj.session_id,
                student_id=student_obj.student_id,
                student_name=f"{student_obj.last_name} {student_obj.first_name} {student_obj.middle_name or ''}".strip(),
                group_name=group_obj.name,
                discipline_name=disc_obj.name,
                topic_name=topic_obj.name if topic_obj else None,
                completed_at=sess_obj.completed_at or sess_obj.started_at,
                file_upload_count=file_upload_count,
                graded_count=graded_count
            )
        )

    return PendingFileReviewsOut(
        items=items,
        total=total
    )


@router.get("/sessions/{session_id}/file-answers", response_model=SessionFileAnswersOut)
async def get_session_file_answers(
    session_id: int,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> SessionFileAnswersOut:
    sess = (await session.execute(
        select(TestSession).where(TestSession.session_id == session_id)
    )).scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")

    # Check access (TeacherDiscipline mapping)
    own = (await session.execute(_teacher_discipline_ids_subquery(user.id))).scalars().all()
    if sess.discipline_id not in own:
        raise HTTPException(status_code=403, detail="Not your discipline")

    # Get student information
    student = (await session.execute(
        select(Student).where(Student.student_id == sess.student_id)
    )).scalar_one()
    group = (await session.execute(
        select(Group).where(Group.group_id == student.group_id)
    )).scalar_one()

    # Load session questions snapshots
    snapshots = await session_question_snapshots(session, session_id)

    # Get answers for this session
    answers = (await session.execute(
        select(StudentAnswer).where(StudentAnswer.session_id == session_id)
    )).scalars().all()
    answer_by_q = {ans.question_id: ans for ans in answers}

    file_questions = []

    if snapshots:
        for sq in snapshots:
            if sq.snapshot.get("qtype") == "file_upload":
                ans = answer_by_q.get(sq.question_id)
                uploads_out = []
                grade_out = None

                if ans:
                    uploads = (await session.execute(
                        select(AnswerFileUpload).where(AnswerFileUpload.answer_id == ans.answer_id)
                    )).scalars().all()
                    uploads_out = [
                        AnswerFileUploadOut(
                            upload_id=up.upload_id,
                            original_name=up.original_name,
                            content_type=up.content_type,
                            size_bytes=up.size_bytes,
                            download_url=f"/api/teacher/file-uploads/{up.upload_id}/download",
                            uploaded_at=up.uploaded_at
                        ) for up in uploads
                    ]

                    # Grade
                    grade = (await session.execute(
                        select(FileUploadGrade).where(FileUploadGrade.answer_id == ans.answer_id)
                    )).scalar_one_or_none()
                    if grade:
                        grade_out = FileUploadGradeOut(
                            grade_id=grade.grade_id,
                            question_id=sq.question_id,
                            points_earned=float(grade.points_earned),
                            max_points=float(sq.snapshot.get("points") or 1.0),
                            comment=grade.comment,
                            graded_at=grade.graded_at,
                            session_now_completed=(sess.status == "completed")
                        )

                file_questions.append(
                    FileAnswerQuestionOut(
                        question_id=sq.question_id,
                        question_text=sq.snapshot.get("text") or "",
                        max_points=float(sq.snapshot.get("points") or 1.0),
                        uploads=uploads_out,
                        grade=grade_out
                    )
                )
    else:
        # Fallback
        if sess.topic_id is not None:
            q_stmt = select(Question).where(
                Question.topic_id == sess.topic_id,
                Question.qtype == "file_upload",
                Question.archived_at.is_(None)
            )
        else:
            q_stmt = select(Question).where(
                Question.discipline_id == sess.discipline_id,
                Question.qtype == "file_upload",
                Question.archived_at.is_(None)
            )
        questions = (await session.execute(q_stmt)).scalars().all()
        for q in questions:
            ans = answer_by_q.get(q.question_id)
            uploads_out = []
            grade_out = None
            if ans:
                uploads = (await session.execute(
                    select(AnswerFileUpload).where(AnswerFileUpload.answer_id == ans.answer_id)
                )).scalars().all()
                uploads_out = [
                    AnswerFileUploadOut(
                        upload_id=up.upload_id,
                        original_name=up.original_name,
                        content_type=up.content_type,
                        size_bytes=up.size_bytes,
                        download_url=f"/api/teacher/file-uploads/{up.upload_id}/download",
                        uploaded_at=up.uploaded_at
                    ) for up in uploads
                ]
                grade = (await session.execute(
                    select(FileUploadGrade).where(FileUploadGrade.answer_id == ans.answer_id)
                )).scalar_one_or_none()
                if grade:
                    grade_out = FileUploadGradeOut(
                        grade_id=grade.grade_id,
                        question_id=q.question_id,
                        points_earned=float(grade.points_earned),
                        max_points=float(q.points),
                        comment=grade.comment,
                        graded_at=grade.graded_at,
                        session_now_completed=(sess.status == "completed")
                    )

            file_questions.append(
                FileAnswerQuestionOut(
                    question_id=q.question_id,
                    question_text=q.text,
                    max_points=float(q.points),
                    uploads=uploads_out,
                    grade=grade_out
                )
            )

    return SessionFileAnswersOut(
        session_id=session_id,
        student=StudentBriefOut(
            student_id=student.student_id,
            full_name=f"{student.last_name} {student.first_name} {student.middle_name or ''}".strip(),
            group_name=group.name
        ),
        file_questions=file_questions
    )


@router.get("/file-uploads/{upload_id}/download")
async def download_file_upload(
    upload_id: int,
    request: Request,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    upload = (await session.execute(
        select(AnswerFileUpload).where(AnswerFileUpload.upload_id == upload_id)
    )).scalar_one_or_none()
    if not upload:
        raise HTTPException(status_code=404, detail="File upload not found")

    ans = (await session.execute(
        select(StudentAnswer).where(StudentAnswer.answer_id == upload.answer_id)
    )).scalar_one()

    sess = (await session.execute(
        select(TestSession).where(TestSession.session_id == ans.session_id)
    )).scalar_one()

    # Check access
    own = (await session.execute(_teacher_discipline_ids_subquery(user.id))).scalars().all()
    if sess.discipline_id not in own:
        raise HTTPException(status_code=403, detail="Not your discipline")

    # Audit download
    await teacher_audit_log(
        session,
        teacher_id=user.id,
        action="file_upload_downloaded",
        target_type="file_upload",
        target_id=upload_id,
        before=None,
        after={
            "upload_id": upload_id,
            "session_id": sess.session_id,
            "original_name": upload.original_name,
        },
        ip_addr=client_ip(request)
    )
    await session.commit()

    from app.services.file_storage import _storage_path
    path = _storage_path(upload.storage_key)
    if not path.exists():
         raise HTTPException(status_code=404, detail="Physical file not found")

    return FileResponse(
        path=path,
        media_type=upload.content_type,
        filename=upload.original_name
    )


@router.post("/sessions/{session_id}/file-grades/{question_id}", response_model=FileUploadGradeOut)
async def grade_file_upload(
    session_id: int,
    question_id: int,
    payload: FileUploadGradeIn,
    request: Request,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> FileUploadGradeOut:
    sess = (await session.execute(
        select(TestSession).where(TestSession.session_id == session_id)
    )).scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")

    # Check access
    own = (await session.execute(_teacher_discipline_ids_subquery(user.id))).scalars().all()
    if sess.discipline_id not in own:
        raise HTTPException(status_code=403, detail="Not your discipline")

    # Get student answer
    ans = (await session.execute(
        select(StudentAnswer)
        .where(StudentAnswer.session_id == session_id, StudentAnswer.question_id == question_id)
    )).scalar_one_or_none()
    if not ans:
        # Create empty answer if student didn't upload anything
        ans = StudentAnswer(
            session_id=session_id,
            question_id=question_id,
            selected_option_id=None
        )
        session.add(ans)
        await session.flush()

    # Load Question max points
    snapshots = await session_question_snapshots(session, session_id)
    max_pts = 1.0
    if snapshots:
        sq = next((item for item in snapshots if item.question_id == question_id), None)
        if sq:
            max_pts = float(sq.snapshot.get("points") or 1.0)
    else:
        q = (await session.execute(
            select(Question).where(Question.question_id == question_id)
        )).scalar_one_or_none()
        if q:
            max_pts = float(q.points)

    if payload.points_earned > max_pts:
        raise HTTPException(status_code=400, detail=f"Points earned cannot exceed max points ({max_pts})")

    # Upsert grade
    grade = (await session.execute(
        select(FileUploadGrade).where(FileUploadGrade.answer_id == ans.answer_id)
    )).scalar_one_or_none()

    before_grade = None
    if grade:
        before_grade = {
            "grade_id": grade.grade_id,
            "points_earned": float(grade.points_earned),
            "comment": grade.comment,
        }
        grade.points_earned = payload.points_earned
        grade.comment = payload.comment
        grade.updated_at = _now_utc()
    else:
        grade = FileUploadGrade(
            answer_id=ans.answer_id,
            teacher_id=user.id,
            points_earned=payload.points_earned,
            comment=payload.comment
        )
        session.add(grade)
        await session.flush()

    # Log action
    await teacher_audit_log(
        session,
        teacher_id=user.id,
        action="file_upload_graded",
        target_type="grade",
        target_id=grade.grade_id,
        before=before_grade,
        after={
            "grade_id": grade.grade_id,
            "answer_id": ans.answer_id,
            "points_earned": float(grade.points_earned),
            "comment": grade.comment,
        },
        ip_addr=client_ip(request)
    )

    # Check if all file_upload questions in this session are graded
    if snapshots:
        file_q_ids = [item.question_id for item in snapshots if item.snapshot.get("qtype") == "file_upload"]
    else:
        if sess.topic_id is not None:
            file_q_ids = (await session.execute(
                select(Question.question_id)
                .where(Question.topic_id == sess.topic_id, Question.qtype == "file_upload", Question.archived_at.is_(None))
            )).scalars().all()
        else:
            file_q_ids = (await session.execute(
                select(Question.question_id)
                .where(Question.discipline_id == sess.discipline_id, Question.qtype == "file_upload", Question.archived_at.is_(None))
            )).scalars().all()

    # Load all student answers for these questions
    answers = (await session.execute(
        select(StudentAnswer)
        .where(StudentAnswer.session_id == session_id, StudentAnswer.question_id.in_(file_q_ids))
    )).scalars().all()
    answer_ids = [a.answer_id for a in answers]

    grades_count = 0
    if answer_ids:
        grades_count = (await session.execute(
            select(func.count()).select_from(FileUploadGrade).where(FileUploadGrade.answer_id.in_(answer_ids))
        )).scalar_one() or 0

    all_graded = (grades_count == len(file_q_ids))

    session_completed = False
    if all_graded:
        # Recalculate score and set completed
        breakdown = await grade_session(session, sess)
        override = (await session.execute(
            text("SELECT score FROM test_sessions_grade_override WHERE session_id = :sid")
            .bindparams(sid=session_id)
        )).first()
        final_score = override[0] if override else breakdown.score
        sess.score = final_score
        sess.max_score = breakdown.max_score
        sess.status = "completed"
        session_completed = True

        # Notify student
        discipline_name = (await session.execute(
            select(Discipline.name).where(Discipline.discipline_id == sess.discipline_id)
        )).scalar_one_or_none() or "Тест"
        topic_name = None
        if sess.topic_id is not None:
            topic_name = (await session.execute(
                select(DisciplineTopic.name).where(DisciplineTopic.topic_id == sess.topic_id)
            )).scalar_one_or_none()

        from app.services.grade_calculator import format_grade_py
        from app.db.models import TestPolicyVersion

        grade_scale = "5_point"
        if sess.policy_version_id is not None:
            policy_snapshot = (await session.execute(
                select(TestPolicyVersion.snapshot).where(TestPolicyVersion.policy_version_id == sess.policy_version_id)
            )).scalar_one_or_none()
            if isinstance(policy_snapshot, dict):
                grade_scale = policy_snapshot.get("grade_scale") or "5_point"

        grade_str = format_grade_py(final_score, breakdown.max_score, grade_scale)

        await store_and_publish(
            session,
            "student",
            sess.student_id,
            "test_graded",
            {
                "title": "Тест проверен",
                "body": f"{discipline_name} — {topic_name or 'общий тест'} проверен: оценка {grade_str}",
                "summary": f"оценка {grade_str}",
                "link": f"/student/results/{session_id}",
                "meta": {
                    "session_id": session_id,
                    "discipline_name": discipline_name,
                    "topic_name": topic_name,
                },
            },
        )

    await session.commit()
    return FileUploadGradeOut(
        grade_id=grade.grade_id,
        question_id=question_id,
        points_earned=float(grade.points_earned),
        max_points=max_pts,
        comment=grade.comment,
        graded_at=grade.graded_at,
        session_now_completed=session_completed
    )


@router.put("/sessions/{session_id}/file-grades/{question_id}", response_model=FileUploadGradeOut)
async def update_file_upload_grade(
    session_id: int,
    question_id: int,
    payload: FileUploadGradeIn,
    request: Request,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> FileUploadGradeOut:
    return await grade_file_upload(
        session_id=session_id,
        question_id=question_id,
        payload=payload,
        request=request,
        user=user,
        session=session
    )
