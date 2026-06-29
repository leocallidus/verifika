from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy import select, update, func, text, delete
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.core.deps import CurrentUser, require_teacher
from app.db.models import (
    Question,
    AnswerOption,
    QuestionAcceptableAnswer,
    AiGenerationTask,
    Discipline,
    DisciplineTopic,
)
from app.db.session import get_session, SessionLocal
from app.core.config import get_settings
from app.services.ai_client import AiClient
from app.services.teacher_notifications import notify_teacher_once
from app.schemas.ai import (
    AiGenerationRequest,
    AiGenerationTaskOut,
    AiQuestionRegenerateIn,
    AiBatchPendingQuestionsIn,
)
from app.schemas.v2 import QuestionInV2, QuestionOutV2, OptionV2

router = APIRouter(prefix="/ai", tags=["v2.ai_generation"])



async def _ensure_own_discipline(session: AsyncSession, teacher_id: int, discipline_id: int):
    stmt = text("SELECT 1 FROM teacher_disciplines WHERE teacher_id = :t AND discipline_id = :d")
    res = await session.execute(stmt.bindparams(t=teacher_id, d=discipline_id))
    if not res.scalar():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Дисциплина не принадлежит преподавателю",
        )


QUESTIONS_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "description": "Массив сгенерированных вопросов",
            "items": {
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "Текст вопроса"
                    },
                    "difficulty": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 5,
                        "description": "Сложность вопроса"
                    },
                    "qtype": {
                        "type": "string",
                        "enum": ["single", "multi", "short", "numeric", "match", "bool"],
                        "description": "Тип вопроса"
                    },
                    "explanation": {
                        "type": "string",
                        "description": "Объяснение правильного ответа (обязательно)"
                    },
                    "options": {
                        "type": "array",
                        "description": "Варианты ответа (для single/multi — 4 шт.)",
                        "items": {
                            "type": "object",
                            "properties": {
                                "option_number": { "type": "integer" },
                                "text":          { "type": "string"  },
                                "is_correct":    { "type": "boolean" }
                            },
                            "required": ["option_number", "text", "is_correct"],
                            "additionalProperties": False
                        }
                    },
                    "short_pattern":       { "type": ["string", "null"] },
                    "numeric_tolerance":   { "type": ["number", "null"] },
                    "correct_bool":        { "type": ["boolean", "null"] },
                    "acceptable_answers":  {
                        "type": ["array", "null"],
                        "items": { "type": "string" }
                    },
                    "match_pairs": {
                        "type": ["array", "null"],
                        "items": {
                            "type": "object",
                            "properties": {
                                "left":  { "type": "string" },
                                "right": { "type": "string" }
                            },
                            "required": ["left", "right"],
                            "additionalProperties": False
                        }
                    }
                },
                "required": [
                    "text",
                    "difficulty",
                    "qtype",
                    "explanation",
                    "options",
                    "short_pattern",
                    "numeric_tolerance",
                    "correct_bool",
                    "acceptable_answers",
                    "match_pairs"
                ],
                "additionalProperties": False
            }
        }
    },
    "required": ["questions"],
    "additionalProperties": False
}


async def run_question_generation(task_id: str, payload: AiGenerationRequest, teacher_id: int, settings):
    async with SessionLocal() as db_session:
        try:
            disp = (await db_session.execute(
                select(Discipline).where(Discipline.discipline_id == payload.discipline_id)
            )).scalar_one_or_none()
            if not disp:
                raise ValueError(f"Discipline {payload.discipline_id} not found")
            disp_name = disp.name

            topic_name = None
            if payload.topic_id:
                topic = (await db_session.execute(
                    select(DisciplineTopic).where(DisciplineTopic.topic_id == payload.topic_id)
                )).scalar_one_or_none()
                if topic:
                    topic_name = topic.name

            topic_name_or_hint = topic_name or payload.topic_name_hint or "Общая тема по дисциплине"
            additional_context_block = f"\nДополнительный контекст/требования: {payload.additional_context}" if payload.additional_context else ""

            material_block = ""
            if payload.material:
                max_chars = settings.ai_gen_material_max_chars
                truncated_material = payload.material[:max_chars]
                material_block = f"\nМатериал для генерации (сгенерируй вопросы строго по этому тексту):\n--- START MATERIAL ---\n{truncated_material}\n--- END MATERIAL ---\n"

            system_prompt = f"""Ты — эксперт по составлению тестовых вопросов для высшей школы.
Генерируй вопросы строго в заданном JSON-формате.

Правила:
1. Язык вопросов: {payload.language}
2. Дисциплина: {disp_name}
3. Тема: {topic_name_or_hint}
4. Уровень сложности: {payload.difficulty_min}–{payload.difficulty_max} (шкала 1–5)
5. Типы вопросов для генерации: {payload.question_types}
6. Для single/multi — ровно 4 варианта ответа, минимум 1 правильный. Располагай правильный вариант на случайной позиции.
7. Для numeric — указывай numeric_tolerance (допустимую погрешность)
8. explanation ОБЯЗАТЕЛЕН — объясни, почему ответ правильный
9. Не повторяй вопросы, делай их разнообразными{additional_context_block}{material_block}"""

            ai_client = AiClient(settings)
            user_message = f"Сгенерируй ровно {payload.count} тестовых вопросов по теме."
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ]

            logger.info(f"Starting structured generation for task {task_id}")
            model_to_use = payload.model if (payload.model and payload.model in settings.ai_generation_models_allowed) else settings.ai_generation_model
            result = await ai_client.generate_structured(
                messages=messages,
                model=model_to_use,
                json_schema=QUESTIONS_JSON_SCHEMA,
                temperature=settings.ai_gen_temperature,
                max_tokens=settings.ai_gen_max_tokens,
            )

            generated_questions = result.get("questions", [])
            logger.info(f"Generated {len(generated_questions)} questions for task {task_id}")

            for idx, q_data in enumerate(generated_questions):
                q = Question(
                    discipline_id=payload.discipline_id,
                    topic_id=payload.topic_id,
                    text=q_data["text"],
                    difficulty=q_data["difficulty"],
                    qtype=q_data["qtype"],
                    explanation=q_data.get("explanation"),
                    ai_status="pending_review",
                    ai_model_used=model_to_use,
                    ai_generated_at=datetime.now(timezone.utc),
                    short_pattern=q_data.get("short_pattern"),
                    numeric_tolerance=q_data.get("numeric_tolerance"),
                    correct_bool=q_data.get("correct_bool"),
                    match_pairs=q_data.get("match_pairs"),
                )
                db_session.add(q)
                await db_session.flush()

                if q_data["qtype"] in ("single", "multi") and "options" in q_data:
                    import random
                    opts_list = list(q_data["options"])
                    random.shuffle(opts_list)
                    for i, opt_data in enumerate(opts_list):
                        opt = AnswerOption(
                            question_id=q.question_id,
                            option_number=i + 1,
                            text=opt_data["text"],
                            is_correct=opt_data["is_correct"],
                        )
                        db_session.add(opt)
                elif q_data["qtype"] in ("short", "numeric"):
                    ans_text = str(q_data.get("short_pattern") or "").strip()
                    if ans_text:
                        opt = AnswerOption(
                            question_id=q.question_id,
                            option_number=1,
                            text=ans_text,
                            is_correct=True,
                        )
                        db_session.add(opt)

                if q_data["qtype"] in ("short", "numeric") and q_data.get("acceptable_answers"):
                    for ord_idx, ans_val in enumerate(q_data["acceptable_answers"]):
                        ans = QuestionAcceptableAnswer(
                            question_id=q.question_id,
                            ord=ord_idx + 1,
                            answer=str(ans_val),
                        )
                        db_session.add(ans)
                
                # Update task generated count incrementally
                await db_session.execute(
                    update(AiGenerationTask)
                    .where(AiGenerationTask.task_id == task_id)
                    .values(generated_count=idx + 1)
                )
                await db_session.commit()

            await db_session.execute(
                update(AiGenerationTask)
                .where(AiGenerationTask.task_id == task_id)
                .values(
                    status="done",
                    completed_at=datetime.now(timezone.utc),
                )
            )
            await db_session.commit()
            logger.info(f"Task {task_id} successfully completed")

        except Exception as e:
            logger.exception(f"Error in run_question_generation background task {task_id}")
            error_message = str(e)
            await db_session.execute(
                update(AiGenerationTask)
                .where(AiGenerationTask.task_id == task_id)
                .values(
                    status="error",
                    error_message=error_message,
                    completed_at=datetime.now(timezone.utc),
                )
            )
            discipline_name = (await db_session.execute(
                select(Discipline.name).where(Discipline.discipline_id == payload.discipline_id)
            )).scalar_one_or_none()
            topic_name = None
            if payload.topic_id is not None:
                topic_name = (await db_session.execute(
                    select(DisciplineTopic.name).where(DisciplineTopic.topic_id == payload.topic_id)
                )).scalar_one_or_none()
            await notify_teacher_once(
                db_session,
                teacher_id,
                "ai_generation_failed",
                title="Сбой генерации ИИ",
                body=f"{discipline_name or f'Дисциплина #{payload.discipline_id}'}: {error_message}",
                link="/teacher/ai-review",
                meta={
                    "task_id": task_id,
                    "discipline_id": payload.discipline_id,
                    "discipline_name": discipline_name,
                    "topic_id": payload.topic_id,
                    "topic_name": topic_name,
                    "error_message": error_message,
                },
                severity=2,
                dedupe_key=f"ai_generation_failed:{teacher_id}:{task_id}",
            )
            await db_session.commit()



@router.post("/generate/questions", status_code=202)
async def start_generation(
    payload: AiGenerationRequest,
    background_tasks: BackgroundTasks,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    settings = get_settings()
    if not settings.ai_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI-модуль отключён",
        )

    await _ensure_own_discipline(session, user.id, payload.discipline_id)

    if payload.count > settings.ai_max_questions_per_request:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Количество вопросов превышает допустимый лимит ({settings.ai_max_questions_per_request})",
        )

    task_id = str(uuid.uuid4())

    task = AiGenerationTask(
        task_id=task_id,
        teacher_id=user.id,
        discipline_id=payload.discipline_id,
        topic_id=payload.topic_id,
        status="processing",
        generated_count=0,
        total_requested=payload.count,
    )
    session.add(task)
    await session.commit()

    background_tasks.add_task(run_question_generation, task_id, payload, user.id, settings)

    return {"task_id": task_id}


@router.get("/generate/tasks/{task_id}", response_model=AiGenerationTaskOut)
async def get_task_status(
    task_id: str,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    task = (await session.execute(
        select(AiGenerationTask).where(AiGenerationTask.task_id == task_id)
    )).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    if task.teacher_id != user.id:
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    return task


@router.get("/pending-questions", response_model=List[QuestionOutV2])
async def get_pending_questions(
    discipline_id: Optional[int] = None,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    stmt = (
        select(Question)
        .where(Question.ai_status == "pending_review")
        .where(Question.archived_at.is_(None))
    )

    stmt = stmt.where(
        Question.discipline_id.in_(
            select(text("discipline_id")).select_from(
                text("teacher_disciplines")
            ).where(text("teacher_id = :tid").bindparams(tid=user.id))
        )
    )

    if discipline_id is not None:
        stmt = stmt.where(Question.discipline_id == discipline_id)

    res = await session.execute(stmt)
    questions = res.scalars().all()

    return await _serialize_questions(session, questions)


@router.post("/pending-questions/{id}/approve", response_model=QuestionOutV2)
async def approve_question(
    id: int,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    q = (await session.execute(
        select(Question).where(Question.question_id == id)
    )).scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Вопрос не найден")
    await _ensure_own_discipline(session, user.id, q.discipline_id)

    q.ai_status = "approved"
    q.ai_reviewed_by = user.id
    q.ai_reviewed_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(q)

    serialized = await _serialize_questions(session, [q])
    return serialized[0]


@router.post("/pending-questions/{id}/reject", status_code=204)
async def reject_question(
    id: int,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    q = (await session.execute(
        select(Question).where(Question.question_id == id)
    )).scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Вопрос не найден")
    await _ensure_own_discipline(session, user.id, q.discipline_id)

    q.archived_at = datetime.now(timezone.utc)
    await session.commit()


@router.patch("/pending-questions/{id}", response_model=QuestionOutV2)
async def edit_pending_question(
    id: int,
    payload: QuestionInV2,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    from sqlalchemy import delete

    q = (await session.execute(
        select(Question).where(Question.question_id == id)
    )).scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Вопрос не найден")
    await _ensure_own_discipline(session, user.id, q.discipline_id)
    if payload.discipline_id != q.discipline_id:
        await _ensure_own_discipline(session, user.id, payload.discipline_id)

    qtype = payload.qtype or "single"
    if qtype == "single":
        if len(payload.options) != 4:
            raise HTTPException(status_code=400, detail="single: exactly 4 options")
        if sum(1 for o in payload.options if o.is_correct) != 1:
            raise HTTPException(status_code=400, detail="single: exactly one option must be correct")
    elif qtype == "multi":
        if len(payload.options) != 4:
            raise HTTPException(status_code=400, detail="multi: exactly 4 options")

    q.discipline_id = payload.discipline_id
    q.topic_id = payload.topic_id
    q.text = payload.text
    q.difficulty = payload.difficulty
    q.qtype = qtype
    q.short_pattern = payload.short_pattern
    q.numeric_tolerance = payload.numeric_tolerance
    q.match_pairs = payload.match_pairs
    q.correct_bool = payload.correct_bool
    q.explanation = payload.explanation
    q.case_sensitive = bool(payload.case_sensitive) if payload.case_sensitive is not None else False
    q.trim_whitespace = True if payload.trim_whitespace is None else bool(payload.trim_whitespace)
    q.normalize_universal = True if payload.normalize_universal is None else bool(payload.normalize_universal)
    q.text_mode = payload.text_mode or "string"
    q.allow_partial = bool(payload.allow_partial) if payload.allow_partial is not None else False

    await session.execute(delete(AnswerOption).where(AnswerOption.question_id == q.question_id))
    for opt_data in payload.options:
        opt = AnswerOption(
            question_id=q.question_id,
            option_number=opt_data.option_number,
            text=opt_data.text,
            is_correct=opt_data.is_correct,
            match_left=opt_data.match_left,
            match_right=opt_data.match_right,
        )
        session.add(opt)

    await session.execute(
        text("DELETE FROM question_acceptable_answers WHERE question_id = :qid").bindparams(qid=q.question_id)
    )
    if payload.acceptable_answers:
        for ord_idx, ans_val in enumerate(payload.acceptable_answers):
            ans = QuestionAcceptableAnswer(
                question_id=q.question_id,
                ord=ord_idx + 1,
                answer=str(ans_val),
            )
            session.add(ans)

    await session.commit()
    await session.refresh(q)

    serialized = await _serialize_questions(session, [q])
    return serialized[0]


async def _serialize_questions(session: AsyncSession, questions: List[Question]) -> List[QuestionOutV2]:
    from app.db.models import AnswerOption, DisciplineTopic, QuestionImage, QuestionClozeBlank
    from app.schemas.v2 import OptionV2
    from app.services.question_images import image_out

    q_ids = [q.question_id for q in questions]
    if not q_ids:
        return []

    grouped = {}
    opt_rows = (await session.execute(
        select(AnswerOption).where(AnswerOption.question_id.in_(q_ids)).order_by(
            AnswerOption.question_id, AnswerOption.option_number
        )
    )).scalars().all()
    for o in opt_rows:
        grouped.setdefault(o.question_id, []).append(o)

    tags_by_q = {}
    tag_rows = (await session.execute(
        text("SELECT qtm.question_id, t.name FROM question_tag_map qtm JOIN question_tags t ON qtm.tag_id = t.tag_id WHERE qtm.question_id = ANY(:ids)")
        .bindparams(ids=q_ids)
    )).all()
    for qid, tname in tag_rows:
        tags_by_q.setdefault(qid, []).append(tname)

    images_by_q = {}
    image_rows = (await session.execute(
        select(QuestionImage).where(QuestionImage.question_id.in_(q_ids))
    )).scalars().all()
    images_by_q = {img.question_id: img for img in image_rows}

    topic_names = {}
    topic_ids = sorted({qq.topic_id for qq in questions if qq.topic_id is not None})
    if topic_ids:
        topic_rows = (await session.execute(
            select(DisciplineTopic.topic_id, DisciplineTopic.name).where(DisciplineTopic.topic_id.in_(topic_ids))
        )).all()
        topic_names = {tid: name for tid, name in topic_rows}

    acceptable_by_q = {qid: [] for qid in q_ids}
    aa_rows = (await session.execute(
        text("SELECT question_id, answer FROM question_acceptable_answers WHERE question_id = ANY(:ids) ORDER BY question_id, ord")
        .bindparams(ids=q_ids)
    )).all()
    for qid, ans in aa_rows:
        acceptable_by_q.setdefault(qid, []).append(ans)

    cloze_by_q = {qid: [] for qid in q_ids}
    cloze_rows = (await session.execute(
        select(QuestionClozeBlank).where(QuestionClozeBlank.question_id.in_(q_ids)).order_by(
            QuestionClozeBlank.question_id, QuestionClozeBlank.blank_index
        )
    )).scalars().all()
    for b in cloze_rows:
        cloze_by_q.setdefault(b.question_id, []).append({
            "index": b.blank_index,
            "kind": b.kind,
            "options": b.options,
            "correct_index": b.correct_index,
            "acceptable_answers": b.acceptable_answers,
            "case_sensitive": b.case_sensitive,
            "trim_whitespace": b.trim_whitespace,
            "normalize_universal": b.normalize_universal,
        })

    return [
        QuestionOutV2(
            question_id=qq.question_id,
            discipline_id=qq.discipline_id,
            topic_id=qq.topic_id,
            topic_name=topic_names.get(qq.topic_id) if qq.topic_id is not None else None,
            text=qq.text,
            difficulty=qq.difficulty,
            qtype=qq.qtype,
            options=[
                OptionV2(
                    option_number=o.option_number,
                    text=o.text,
                    is_correct=o.is_correct,
                    match_left=o.match_left,
                    match_right=o.match_right,
                )
                for o in grouped.get(qq.question_id, [])
            ],
            tags=tags_by_q.get(qq.question_id, []),
            short_pattern=qq.short_pattern,
            numeric_tolerance=float(qq.numeric_tolerance) if qq.numeric_tolerance is not None else None,
            match_pairs=qq.match_pairs or [],
            image=image_out(images_by_q[qq.question_id]) if qq.question_id in images_by_q else None,
            archived=qq.archived_at is not None,
            correct_bool=qq.correct_bool,
            explanation=qq.explanation,
            case_sensitive=qq.case_sensitive,
            trim_whitespace=qq.trim_whitespace,
            normalize_universal=qq.normalize_universal,
            text_mode=qq.text_mode,
            allow_partial=qq.allow_partial,
            acceptable_answers=acceptable_by_q.get(qq.question_id, []),
            cloze_blanks=cloze_by_q.get(qq.question_id, []),
            created_at=qq.created_at,
            archived_at=qq.archived_at,
            ai_status=qq.ai_status,
            ai_model_used=qq.ai_model_used,
            ai_reviewed_by=qq.ai_reviewed_by,
            ai_reviewed_at=qq.ai_reviewed_at,
            ai_generated_at=qq.ai_generated_at,
        )
        for qq in questions
    ]


@router.post("/pending-questions/{id}/regenerate", response_model=QuestionOutV2)
async def regenerate_pending_question(
    id: int,
    payload: AiQuestionRegenerateIn,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    settings = get_settings()
    if not settings.ai_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI-модуль отключён",
        )

    # find old question
    q = (await session.execute(
        select(Question).where(Question.question_id == id)
    )).scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Вопрос не найден")
    await _ensure_own_discipline(session, user.id, q.discipline_id)

    # serialize old question to JSON
    options = (await session.execute(
        select(AnswerOption).where(AnswerOption.question_id == id).order_by(AnswerOption.option_number)
    )).scalars().all()
    
    aa_rows = (await session.execute(
        text("SELECT answer FROM question_acceptable_answers WHERE question_id = :qid ORDER BY ord").bindparams(qid=id)
    )).all()
    acceptable_answers = [row.answer for row in aa_rows]

    old_q_dict = {
        "text": q.text,
        "difficulty": q.difficulty,
        "qtype": q.qtype,
        "explanation": q.explanation,
        "options": [
            {"option_number": o.option_number, "text": o.text, "is_correct": o.is_correct}
            for o in options
        ],
        "short_pattern": q.short_pattern,
        "numeric_tolerance": float(q.numeric_tolerance) if q.numeric_tolerance is not None else None,
        "correct_bool": q.correct_bool,
        "acceptable_answers": acceptable_answers,
        "match_pairs": q.match_pairs,
    }

    system_prompt = """Ты — эксперт по составлению тестовых вопросов для высшей школы.
Твоя задача — переписать/доработать предложенный тестовый вопрос на основе инструкции пользователя.
Верни результат строго в заданном JSON-формате."""

    user_prompt = f"""Исходный вопрос:
{json.dumps(old_q_dict, ensure_ascii=False, indent=2)}

Инструкция по изменению:
{payload.instruction}

Сгенерируй изменённый вопрос."""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

    ai_client = AiClient(settings)
    result = await ai_client.generate_structured(
        messages=messages,
        model=settings.ai_generation_model,
        json_schema=QUESTIONS_JSON_SCHEMA,
        temperature=settings.ai_gen_temperature,
        max_tokens=settings.ai_gen_max_tokens,
    )

    generated_questions = result.get("questions", [])
    if not generated_questions:
        raise HTTPException(status_code=502, detail="Не удалось сгенерировать вопрос")

    q_data = generated_questions[0]
    
    new_q = Question(
        discipline_id=q.discipline_id,
        topic_id=q.topic_id,
        text=q_data["text"],
        difficulty=q_data["difficulty"],
        qtype=q_data["qtype"],
        explanation=q_data.get("explanation"),
        ai_status="pending_review",
        ai_model_used=settings.ai_generation_model,
        ai_generated_at=datetime.now(timezone.utc),
        short_pattern=q_data.get("short_pattern"),
        numeric_tolerance=q_data.get("numeric_tolerance"),
        correct_bool=q_data.get("correct_bool"),
        match_pairs=q_data.get("match_pairs"),
    )
    session.add(new_q)
    await session.flush()

    if q_data["qtype"] in ("single", "multi") and "options" in q_data:
        import random
        opts_list = list(q_data["options"])
        random.shuffle(opts_list)
        for i, opt_data in enumerate(opts_list):
            opt = AnswerOption(
                question_id=new_q.question_id,
                option_number=i + 1,
                text=opt_data["text"],
                is_correct=opt_data["is_correct"],
            )
            session.add(opt)
    elif q_data["qtype"] in ("short", "numeric"):
        ans_text = str(q_data.get("short_pattern") or "").strip()
        if ans_text:
            opt = AnswerOption(
                question_id=new_q.question_id,
                option_number=1,
                text=ans_text,
                is_correct=True,
            )
            session.add(opt)

    if q_data["qtype"] in ("short", "numeric") and q_data.get("acceptable_answers"):
        for ord_idx, ans_val in enumerate(q_data["acceptable_answers"]):
            ans = QuestionAcceptableAnswer(
                question_id=new_q.question_id,
                ord=ord_idx + 1,
                answer=str(ans_val),
            )
            session.add(ans)

    # Archive old question
    q.archived_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(new_q)

    serialized = await _serialize_questions(session, [new_q])
    return serialized[0]


@router.post("/pending-questions/batch-approve", response_model=List[QuestionOutV2])
async def batch_approve_questions(
    payload: AiBatchPendingQuestionsIn,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    if not payload.ids:
        return []
    
    res = await session.execute(
        select(Question).where(Question.question_id.in_(payload.ids))
    )
    questions = res.scalars().all()
    
    approved_questions = []
    for q in questions:
        await _ensure_own_discipline(session, user.id, q.discipline_id)
        if q.ai_status == "pending_review":
            q.ai_status = "approved"
            q.ai_reviewed_by = user.id
            q.ai_reviewed_at = datetime.now(timezone.utc)
            approved_questions.append(q)
            
    await session.commit()
    
    if approved_questions:
        for q in approved_questions:
            await session.refresh(q)
        return await _serialize_questions(session, approved_questions)
    return []


@router.post("/pending-questions/batch-reject", status_code=204)
async def batch_reject_questions(
    payload: AiBatchPendingQuestionsIn,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    if not payload.ids:
        return
    
    res = await session.execute(
        select(Question).where(Question.question_id.in_(payload.ids))
    )
    questions = res.scalars().all()
    
    for q in questions:
        await _ensure_own_discipline(session, user.id, q.discipline_id)
        if q.ai_status == "pending_review":
            q.archived_at = datetime.now(timezone.utc)
            
    await session.commit()
