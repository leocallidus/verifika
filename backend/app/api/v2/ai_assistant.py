from __future__ import annotations

import json
import html
import io
from datetime import datetime, timezone, time, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, update, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.core.deps import CurrentUser, get_current_user
from app.db.models import AiChat, AiMessage, AnswerOption, Discipline, DisciplineTopic, Question, TestSession
from app.db.session import get_session, SessionLocal
from app.core.config import get_settings
from app.services.ai_client import AiClient
from app.services.student_access import student_can_access_discipline
from app.schemas.ai import (
    AiChatCreateIn,
    AiChatMessageIn,
    AiStudentPreparationIn,
    AiStudentPreparationOut,
    AiChatTitlePatch,
    AiChatOut,
    AiMessageOut,
    AiStatusOut,
    AiUsageOut,
)


router = APIRouter(prefix="/ai", tags=["v2.ai_assistant"])


STUDENT_PREPARATION_SYSTEM_PROMPT = """Ты — учебный ИИ-помощник платформы Верифика в режиме подготовки к теме.
Помогай студенту понять тему до старта теста: объясняй понятия, связи, типичные ошибки, давай учебные примеры и тренировочные вопросы.
Нельзя раскрывать правильные ответы, ключи, порядок правильных вариантов, решения активного теста или утверждать, какой вариант в банке вопросов правильный.
Если студент просит ответ на тестовый вопрос или просит выбрать вариант, объясни подход и материал, но не называй готовый ответ."""


def _preview_text(value: str | None, limit: int = 220) -> str:
    text = " ".join((value or "").split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def check_ai_access(user: CurrentUser = Depends(get_current_user)):
    settings = get_settings()
    if not settings.ai_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI-модуль отключён",
        )
    if user.role == "student" and not settings.ai_student_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ИИ-Ассистент недоступен для студентов",
        )
    return user


async def _get_chat_or_raise(chat_id: int, user: CurrentUser, session: AsyncSession) -> AiChat:
    res = await session.execute(
        select(AiChat).where(AiChat.chat_id == chat_id)
    )
    chat = res.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Чат не найден")
    if chat.user_role != user.role or chat.user_id != user.id:
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    if chat.archived_at is not None:
        raise HTTPException(status_code=404, detail="Чат архивирован")
    return chat


async def get_user_daily_usage(user_id: int, user_role: str, session: AsyncSession):
    now_utc = datetime.now(timezone.utc)
    today_start = datetime.combine(now_utc.date(), time.min, tzinfo=timezone.utc)
    next_day_start = today_start + timedelta(days=1)
    
    stmt = (
        select(
            func.count(AiMessage.message_id).label("msg_count"),
            func.sum(AiMessage.tokens_used).label("total_tokens")
        )
        .join(AiChat, AiChat.chat_id == AiMessage.chat_id)
        .where(
            AiChat.user_id == user_id,
            AiChat.user_role == user_role,
            AiMessage.created_at >= today_start
        )
    )
    res = await session.execute(stmt)
    row = res.first()
    
    messages_today = row.msg_count if row and row.msg_count else 0
    tokens_today = int(row.total_tokens) if row and row.total_tokens and row.total_tokens is not None else 0
    
    settings = get_settings()
    if user_role == "student":
        limit_tokens = settings.ai_daily_token_limit_student
        limit_messages = settings.ai_daily_message_limit_student
    else:
        limit_tokens = 0
        limit_messages = 0
        
    return {
        "tokens_today": tokens_today,
        "messages_today": messages_today,
        "limit_tokens": limit_tokens,
        "limit_messages": limit_messages,
        "reset_at": next_day_start,
    }


async def _build_student_topic_preparation_context(
    topic_id: int,
    student_id: int,
    session: AsyncSession,
) -> tuple[DisciplineTopic, str]:
    topic = (await session.execute(
        select(DisciplineTopic).where(
            DisciplineTopic.topic_id == topic_id,
            DisciplineTopic.archived_at.is_(None),
        )
    )).scalar_one_or_none()
    if topic is None:
        raise HTTPException(status_code=404, detail="topic not found")

    if not await student_can_access_discipline(session, student_id, topic.discipline_id):
        raise HTTPException(status_code=404, detail="topic not found")

    active_session_id = (await session.execute(
        select(TestSession.session_id).where(
            TestSession.student_id == student_id,
            TestSession.topic_id == topic.topic_id,
            TestSession.completed_at.is_(None),
        ).limit(1)
    )).scalar_one_or_none()
    if active_session_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="AI-помощник доступен только до старта теста по теме",
        )

    discipline_name = (await session.execute(
        select(Discipline.name).where(Discipline.discipline_id == topic.discipline_id)
    )).scalar_one()

    questions = (await session.execute(
        select(Question)
        .where(
            Question.topic_id == topic.topic_id,
            Question.archived_at.is_(None),
        )
        .order_by(Question.question_id.asc())
        .limit(12)
    )).scalars().all()

    lines = [
        f"Дисциплина: {discipline_name}",
        f"Тема: {topic.name}",
    ]
    if topic.description:
        lines.append(f"Описание темы: {_preview_text(topic.description, 600)}")

    if questions:
        lines.append("Безопасный учебный контекст из банка вопросов без ключей ответов:")
    for idx, question in enumerate(questions, start=1):
        lines.append(f"{idx}. Тип: {question.qtype}. Формулировка: {_preview_text(question.text, 260)}")
        options = (await session.execute(
            select(AnswerOption.option_number, AnswerOption.text)
            .where(AnswerOption.question_id == question.question_id)
            .order_by(AnswerOption.option_number.asc())
        )).all()
        if options:
            options_text = "; ".join(
                f"{number}. {_preview_text(text, 120)}" for number, text in options[:8]
            )
            lines.append(f"   Варианты без отметок правильности: {options_text}")

    lines.append(
        "Не используй и не выдумывай правильные ответы. Если нужно разобрать пример, делай это как учебное объяснение без выбора ответа из теста."
    )
    return topic, "\n".join(lines)


def simple_markdown_to_html(text: str) -> str:
    escaped = html.escape(text)
    lines = escaped.split("\n")
    html_lines = []
    in_code_block = False
    
    for line in lines:
        if line.startswith("```"):
            if in_code_block:
                html_lines.append("</pre>")
                in_code_block = False
            else:
                html_lines.append("<pre style='background: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto;'>")
                in_code_block = True
            continue
            
        if in_code_block:
            html_lines.append(line + "\n")
            continue
            
        if line.startswith("# "):
            html_lines.append(f"<h1>{line[2:]}</h1>")
        elif line.startswith("## "):
            html_lines.append(f"<h2>{line[3:]}</h2>")
        elif line.startswith("### "):
            html_lines.append(f"<h3>{line[4:]}</h3>")
        elif line.startswith("- ") or line.startswith("* "):
            html_lines.append(f"<ul><li>{line[2:]}</li></ul>")
        elif line.strip() == "":
            html_lines.append("<br/>")
        else:
            processed = line
            parts = processed.split("**")
            if len(parts) > 1:
                new_parts = []
                for idx, part in enumerate(parts):
                    if idx % 2 == 1:
                        new_parts.append(f"<strong>{part}</strong>")
                    else:
                        new_parts.append(part)
                processed = "".join(new_parts)
            html_lines.append(f"<p>{processed}</p>")
            
    return "".join(html_lines)



@router.get("/status", response_model=AiStatusOut)
async def get_ai_status(user: CurrentUser = Depends(get_current_user)):
    settings = get_settings()
    student_access = settings.ai_student_enabled if user.role in ("admin", "teacher") else None
    
    enabled = settings.ai_enabled
    if user.role == "student" and not settings.ai_student_enabled:
        enabled = False

    return AiStatusOut(
        enabled=enabled,
        student_access_enabled=student_access,
        chat_model=settings.ai_chat_model if enabled else None,
        generation_model=settings.ai_generation_model if enabled else None,
        generation_models_allowed=settings.ai_generation_models_allowed if (enabled and user.role in ("admin", "teacher")) else None,
        chat_models_allowed=settings.ai_chat_models_allowed if enabled else None,
    )


@router.post("/student/topics/{topic_id}/prepare", response_model=AiStudentPreparationOut)
async def student_topic_preparation(
    topic_id: int,
    payload: AiStudentPreparationIn,
    user: CurrentUser = Depends(check_ai_access),
    session: AsyncSession = Depends(get_session),
):
    if user.role != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступно только студенту")

    settings = get_settings()
    usage = await get_user_daily_usage(user.id, user.role, session)
    if usage["limit_messages"] > 0 and usage["messages_today"] >= usage["limit_messages"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Дневной лимит сообщений исчерпан. Попробуйте завтра.",
        )
    if usage["limit_tokens"] > 0 and usage["tokens_today"] >= usage["limit_tokens"]:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Дневной лимит токенов исчерпан. Попробуйте завтра.",
        )

    topic, safe_context = await _build_student_topic_preparation_context(topic_id, user.id, session)
    prompt = payload.prompt.strip()
    model_to_use = (
        payload.model
        if payload.model and payload.model in settings.ai_chat_models_allowed
        else settings.ai_chat_model
    )

    chat = AiChat(
        user_role=user.role,
        user_id=user.id,
        title=f"Подготовка: {_preview_text(topic.name, 80)}",
        is_pinned=False,
    )
    session.add(chat)
    await session.flush()

    user_message = AiMessage(
        chat_id=chat.chat_id,
        role="user",
        content=f"Подготовка к теме «{topic.name}»: {prompt}",
    )
    session.add(user_message)
    await session.flush()

    ai_client = AiClient(settings)
    messages = [
        {"role": "system", "content": STUDENT_PREPARATION_SYSTEM_PROMPT},
        {"role": "system", "content": safe_context},
        {"role": "user", "content": prompt},
    ]

    assistant_content = ""
    tokens_used = None
    model_used = model_to_use
    async for chunk in ai_client.chat_stream(
        messages=messages,
        model=model_to_use,
        temperature=settings.ai_chat_temperature,
        max_tokens=settings.ai_chat_max_tokens,
    ):
        if chunk["type"] == "delta":
            assistant_content += chunk["content"]
        elif chunk["type"] == "done":
            tokens_used = chunk.get("tokens_used")
            model_used = chunk.get("model", model_used)
        elif chunk["type"] == "error":
            await session.rollback()
            raise HTTPException(status_code=502, detail=chunk.get("message") or "Ошибка AI-провайдера")

    if not assistant_content.strip():
        await session.rollback()
        raise HTTPException(status_code=502, detail="AI-провайдер вернул пустой ответ")

    assistant_msg = AiMessage(
        chat_id=chat.chat_id,
        role="assistant",
        content=assistant_content,
        tokens_used=tokens_used,
        model_used=model_used,
    )
    session.add(assistant_msg)
    chat.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(assistant_msg)

    return AiStudentPreparationOut(
        topic_id=topic.topic_id,
        chat_id=chat.chat_id,
        message_id=assistant_msg.message_id,
        answer=assistant_content,
        model_used=model_used,
        tokens_used=tokens_used,
    )


@router.post("/chats", response_model=AiChatOut)
async def create_chat(
    payload: AiChatCreateIn,
    user: CurrentUser = Depends(check_ai_access),
    session: AsyncSession = Depends(get_session),
):
    chat = AiChat(
        user_role=user.role,
        user_id=user.id,
        title=None,
        is_pinned=False,
    )
    session.add(chat)
    await session.commit()
    await session.refresh(chat)

    if payload.first_message:
        msg = AiMessage(
            chat_id=chat.chat_id,
            role="user",
            content=payload.first_message,
        )
        session.add(msg)
        chat.title = payload.first_message[:40] + "..." if len(payload.first_message) > 40 else payload.first_message
        await session.commit()
        await session.refresh(chat)

    return AiChatOut(
        chat_id=chat.chat_id,
        title=chat.title,
        is_pinned=chat.is_pinned,
        created_at=chat.created_at,
        updated_at=chat.updated_at,
        last_message_preview=payload.first_message[:120] if payload.first_message else None,
        messages_count=1 if payload.first_message else 0,
    )


@router.get("/chats", response_model=List[AiChatOut])
async def list_chats(
    user: CurrentUser = Depends(check_ai_access),
    session: AsyncSession = Depends(get_session),
):
    stmt = (
        select(AiChat)
        .where(
            AiChat.user_role == user.role,
            AiChat.user_id == user.id,
            AiChat.archived_at.is_(None),
        )
        .order_by(AiChat.is_pinned.desc(), AiChat.updated_at.desc())
    )
    res = await session.execute(stmt)
    chats = res.scalars().all()

    out = []
    for chat in chats:
        msg_count_stmt = select(func.count(AiMessage.message_id)).where(AiMessage.chat_id == chat.chat_id)
        msg_count = (await session.execute(msg_count_stmt)).scalar() or 0

        last_msg_stmt = (
            select(AiMessage.content)
            .where(AiMessage.chat_id == chat.chat_id)
            .order_by(AiMessage.created_at.desc())
            .limit(1)
        )
        last_msg = (await session.execute(last_msg_stmt)).scalar()
        preview = last_msg[:120] if last_msg else None

        out.append(
            AiChatOut(
                chat_id=chat.chat_id,
                title=chat.title,
                is_pinned=chat.is_pinned,
                created_at=chat.created_at,
                updated_at=chat.updated_at,
                last_message_preview=preview,
                messages_count=msg_count,
            )
        )
    return out


@router.delete("/chats/{chat_id}", status_code=204)
async def delete_chat(
    chat_id: int,
    user: CurrentUser = Depends(check_ai_access),
    session: AsyncSession = Depends(get_session),
):
    chat = await _get_chat_or_raise(chat_id, user, session)
    chat.archived_at = datetime.now(timezone.utc)
    await session.commit()


@router.patch("/chats/{chat_id}/title", response_model=AiChatOut)
async def rename_chat(
    chat_id: int,
    payload: AiChatTitlePatch,
    user: CurrentUser = Depends(check_ai_access),
    session: AsyncSession = Depends(get_session),
):
    chat = await _get_chat_or_raise(chat_id, user, session)
    chat.title = payload.title
    chat.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(chat)

    msg_count_stmt = select(func.count(AiMessage.message_id)).where(AiMessage.chat_id == chat.chat_id)
    msg_count = (await session.execute(msg_count_stmt)).scalar() or 0

    last_msg_stmt = (
        select(AiMessage.content)
        .where(AiMessage.chat_id == chat.chat_id)
        .order_by(AiMessage.created_at.desc())
        .limit(1)
    )
    last_msg = (await session.execute(last_msg_stmt)).scalar()
    preview = last_msg[:120] if last_msg else None

    return AiChatOut(
        chat_id=chat.chat_id,
        title=chat.title,
        is_pinned=chat.is_pinned,
        created_at=chat.created_at,
        updated_at=chat.updated_at,
        last_message_preview=preview,
        messages_count=msg_count,
    )


@router.patch("/chats/{chat_id}/pin", response_model=AiChatOut)
async def toggle_pin_chat(
    chat_id: int,
    user: CurrentUser = Depends(check_ai_access),
    session: AsyncSession = Depends(get_session),
):
    chat = await _get_chat_or_raise(chat_id, user, session)
    chat.is_pinned = not chat.is_pinned
    chat.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(chat)

    msg_count_stmt = select(func.count(AiMessage.message_id)).where(AiMessage.chat_id == chat.chat_id)
    msg_count = (await session.execute(msg_count_stmt)).scalar() or 0

    last_msg_stmt = (
        select(AiMessage.content)
        .where(AiMessage.chat_id == chat.chat_id)
        .order_by(AiMessage.created_at.desc())
        .limit(1)
    )
    last_msg = (await session.execute(last_msg_stmt)).scalar()
    preview = last_msg[:120] if last_msg else None

    return AiChatOut(
        chat_id=chat.chat_id,
        title=chat.title,
        is_pinned=chat.is_pinned,
        created_at=chat.created_at,
        updated_at=chat.updated_at,
        last_message_preview=preview,
        messages_count=msg_count,
    )



@router.get("/chats/{chat_id}/messages", response_model=List[AiMessageOut])
async def list_chat_messages(
    chat_id: int,
    user: CurrentUser = Depends(check_ai_access),
    session: AsyncSession = Depends(get_session),
):
    await _get_chat_or_raise(chat_id, user, session)
    stmt = (
        select(AiMessage)
        .where(AiMessage.chat_id == chat_id)
        .order_by(AiMessage.created_at.asc())
    )
    res = await session.execute(stmt)
    messages = res.scalars().all()
    return messages


@router.post("/chats/{chat_id}/stream")
async def stream_chat(
    chat_id: int,
    payload: AiChatMessageIn,
    regenerate: bool = Query(False),
    user: CurrentUser = Depends(check_ai_access),
    session: AsyncSession = Depends(get_session),
):
    chat = await _get_chat_or_raise(chat_id, user, session)

    settings = get_settings()

    # F-6: Daily token and message limits check for students
    if user.role == "student":
        usage = await get_user_daily_usage(user.id, user.role, session)
        if usage["limit_messages"] > 0 and usage["messages_today"] >= usage["limit_messages"]:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Дневной лимит сообщений исчерпан. Попробуйте завтра."
            )
        if usage["limit_tokens"] > 0 and usage["tokens_today"] >= usage["limit_tokens"]:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Дневной лимит токенов исчерпан. Попробуйте завтра."
            )

    if regenerate:
        # find the last assistant message in this chat
        last_ast_stmt = (
            select(AiMessage)
            .where(AiMessage.chat_id == chat_id, AiMessage.role == "assistant")
            .order_by(AiMessage.created_at.desc())
            .limit(1)
        )
        last_ast = (await session.execute(last_ast_stmt)).scalar_one_or_none()
        if not last_ast:
            raise HTTPException(status_code=400, detail="Нечего регенерировать")
        
        # delete this assistant message and any messages after it
        await session.execute(
            delete(AiMessage).where(
                AiMessage.chat_id == chat_id,
                AiMessage.created_at >= last_ast.created_at
            )
        )
        chat.updated_at = datetime.now(timezone.utc)
        await session.commit()

        # now find the last user message to use as payload content
        last_usr_stmt = (
            select(AiMessage.content)
            .where(AiMessage.chat_id == chat_id, AiMessage.role == "user")
            .order_by(AiMessage.created_at.desc())
            .limit(1)
        )
        user_content = (await session.execute(last_usr_stmt)).scalar()
        if not user_content:
            raise HTTPException(status_code=400, detail="Нет сообщения пользователя для регенерации")
        
        # Override payload content
        payload.content = user_content
    else:
        if not payload.content:
            raise HTTPException(status_code=400, detail="Текст сообщения обязателен")

        # Save user message to database
        user_msg = AiMessage(
            chat_id=chat_id,
            role="user",
            content=payload.content,
        )
        session.add(user_msg)
        chat.updated_at = datetime.now(timezone.utc)
        await session.commit()

    # Determine context
    context = [{"role": "system", "content": settings.ai_system_prompt}]
    msg_stmt = (
        select(AiMessage)
        .where(AiMessage.chat_id == chat_id)
        .order_by(AiMessage.created_at.desc())
        .limit(settings.ai_context_window)
    )
    res = await session.execute(msg_stmt)
    history = list(res.scalars().all())
    history.reverse()

    for hm in history:
        context.append({"role": hm.role, "content": hm.content})

    # Determine if it's the first message (only 1 user message in the chat so far)
    count_stmt = select(func.count(AiMessage.message_id)).where(AiMessage.chat_id == chat_id)
    msg_count = (await session.execute(count_stmt)).scalar() or 0
    is_first_msg = (msg_count <= 1) and (not chat.title)

    ai_client = AiClient(settings)

    model_to_use = payload.model if (payload.model and payload.model in settings.ai_chat_models_allowed) else settings.ai_chat_model

    async def sse_generator():
        assistant_content = ""
        tokens_used = None
        model_used = model_to_use

        try:
            async for chunk in ai_client.chat_stream(
                messages=context,
                model=model_to_use,
                temperature=settings.ai_chat_temperature,
                max_tokens=settings.ai_chat_max_tokens,
            ):
                if chunk["type"] == "delta":
                    assistant_content += chunk["content"]
                    yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                elif chunk["type"] == "done":
                    tokens_used = chunk.get("tokens_used")
                    model_used = chunk.get("model", model_used)
                elif chunk["type"] == "error":
                    yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                    return

            # Title generation on first message
            generated_title = None
            if is_first_msg:
                generated_title = await ai_client.generate_title(payload.content, model_used)
                yield f"data: {json.dumps({'type': 'title', 'title': generated_title}, ensure_ascii=False)}\n\n"

            # Save response using separate session
            async with SessionLocal() as db_session:
                assistant_msg = AiMessage(
                    chat_id=chat_id,
                    role="assistant",
                    content=assistant_content,
                    tokens_used=tokens_used,
                    model_used=model_used,
                )
                db_session.add(assistant_msg)
                
                # Update chat record
                chat_update_vals = {"updated_at": datetime.now(timezone.utc)}
                if is_first_msg and generated_title:
                    chat_update_vals["title"] = generated_title
                
                await db_session.execute(
                    update(AiChat)
                    .where(AiChat.chat_id == chat_id)
                    .values(**chat_update_vals)
                )
                await db_session.commit()

            # Signal end of stream
            yield f"data: {json.dumps({'type': 'done', 'tokens_used': tokens_used, 'model': model_used}, ensure_ascii=False)}\n\n"

        except Exception as err:
            logger.error(f"Error in SSE generator: {err}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(err)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(sse_generator(), media_type="text/event-stream")


@router.delete("/chats/{chat_id}/messages/{message_id}", status_code=204)
async def delete_message_cascade(
    chat_id: int,
    message_id: int,
    cascade: str = Query("after"),
    user: CurrentUser = Depends(check_ai_access),
    session: AsyncSession = Depends(get_session),
):
    chat = await _get_chat_or_raise(chat_id, user, session)
    msg = (await session.execute(
        select(AiMessage).where(AiMessage.message_id == message_id, AiMessage.chat_id == chat_id)
    )).scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    
    if cascade == "after":
        await session.execute(
            delete(AiMessage).where(
                AiMessage.chat_id == chat_id,
                AiMessage.created_at >= msg.created_at
            )
        )
    else:
        await session.execute(
            delete(AiMessage).where(AiMessage.message_id == message_id)
        )
    chat.updated_at = datetime.now(timezone.utc)
    await session.commit()


@router.get("/chats/{chat_id}/export")
async def export_chat(
    chat_id: int,
    fmt: str = Query("md", pattern="^(md|pdf)$"),
    user: CurrentUser = Depends(check_ai_access),
    session: AsyncSession = Depends(get_session),
):
    chat = await _get_chat_or_raise(chat_id, user, session)
    msg_stmt = (
        select(AiMessage)
        .where(AiMessage.chat_id == chat_id)
        .order_by(AiMessage.created_at.asc())
    )
    res = await session.execute(msg_stmt)
    messages = res.scalars().all()

    if len(messages) > 500:
        messages = messages[:500]

    if fmt == "md":
        md_content = f"# Экспорт диалога: {chat.title or 'Без названия'}\n\n"
        for msg in messages:
            role_name = "Пользователь" if msg.role == "user" else "ИИ-Ассистент"
            md_content += f"### {role_name} ({msg.created_at.strftime('%Y-%m-%d %H:%M:%S')})\n\n{msg.content}\n\n---\n\n"
        
        bio = io.BytesIO(md_content.encode("utf-8"))
        headers = {
            "Content-Disposition": f"attachment; filename=chat_{chat_id}.md"
        }
        return StreamingResponse(bio, media_type="text/markdown", headers=headers)
        
    elif fmt == "pdf":
        html_body = f"""
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: DejaVu Sans, Arial, sans-serif; margin: 40px; color: #333; }}
                h1 {{ color: #4f46e5; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }}
                .message {{ margin-bottom: 25px; padding: 15px; border-radius: 8px; }}
                .user {{ background-color: #f3f4f6; border-left: 4px solid #9ca3af; }}
                .assistant {{ background-color: #f5f3ff; border-left: 4px solid #8b5cf6; }}
                .meta {{ font-size: 0.85em; color: #6b7280; margin-bottom: 10px; }}
                .content {{ line-height: 1.5; }}
            </style>
        </head>
        <body>
            <h1>Диалог: {html.escape(chat.title or 'Без названия')}</h1>
        """
        for msg in messages:
            role_name = "Пользователь" if msg.role == "user" else "ИИ-Ассистент"
            class_name = "user" if msg.role == "user" else "assistant"
            time_str = msg.created_at.strftime('%Y-%m-%d %H:%M:%S')
            formatted_content = simple_markdown_to_html(msg.content)
            html_body += f"""
            <div class="message {class_name}">
                <div class="meta"><strong>{role_name}</strong> • {time_str}</div>
                <div class="content">{formatted_content}</div>
            </div>
            """
        html_body += """
        </body>
        </html>
        """
        
        from weasyprint import HTML
        pdf_bytes = HTML(string=html_body).write_pdf()
        bio = io.BytesIO(pdf_bytes)
        headers = {
            "Content-Disposition": f"attachment; filename=chat_{chat_id}.pdf"
        }
        return StreamingResponse(bio, media_type="application/pdf", headers=headers)


@router.get("/chats/search", response_model=List[AiChatOut])
async def search_chats(
    q: str = Query(min_length=1),
    user: CurrentUser = Depends(check_ai_access),
    session: AsyncSession = Depends(get_session),
):
    stmt = (
        select(AiChat)
        .join(AiMessage, AiMessage.chat_id == AiChat.chat_id)
        .where(
            AiChat.user_role == user.role,
            AiChat.user_id == user.id,
            AiChat.archived_at.is_(None),
            AiMessage.content.ilike(f"%{q}%")
        )
        .distinct()
        .order_by(AiChat.is_pinned.desc(), AiChat.updated_at.desc())
    )
    res = await session.execute(stmt)
    chats = res.scalars().all()

    out = []
    for chat in chats:
        msg_count_stmt = select(func.count(AiMessage.message_id)).where(AiMessage.chat_id == chat.chat_id)
        msg_count = (await session.execute(msg_count_stmt)).scalar() or 0

        last_msg_stmt = (
            select(AiMessage.content)
            .where(AiMessage.chat_id == chat.chat_id)
            .order_by(AiMessage.created_at.desc())
            .limit(1)
        )
        last_msg = (await session.execute(last_msg_stmt)).scalar()
        preview = last_msg[:120] if last_msg else None

        out.append(
            AiChatOut(
                chat_id=chat.chat_id,
                title=chat.title,
                is_pinned=chat.is_pinned,
                created_at=chat.created_at,
                updated_at=chat.updated_at,
                last_message_preview=preview,
                messages_count=msg_count,
            )
        )
    return out


@router.get("/usage", response_model=AiUsageOut)
async def get_usage_endpoint(
    user: CurrentUser = Depends(check_ai_access),
    session: AsyncSession = Depends(get_session),
):
    usage = await get_user_daily_usage(user.id, user.role, session)
    return usage


from fastapi import Request
from fastapi.responses import JSONResponse


@router.post("/mock-ai/chat/completions")
async def mock_chat_completions(request: Request):
    body = await request.json()
    stream = body.get("stream", False)
    response_format = body.get("response_format")
    messages = body.get("messages", [])
    
    # Check if this is for structured output / question generation
    is_structured = False
    if response_format and response_format.get("type") == "json_schema":
        is_structured = True
    
    # Check if this is for title generation
    is_title_gen = False
    if messages and messages[0].get("content", "").startswith("Ты — полезный ассистент"):
        is_title_gen = True

    if is_structured:
        # Return a structured JSON matching QuestionInV2
        mock_questions = {
            "questions": [
                {
                    "text": "Какая СУБД является реляционной?",
                    "difficulty": 2,
                    "qtype": "single",
                    "explanation": "PostgreSQL — это свободная объектно-реляционная система управления базами данных.",
                    "options": [
                        {"option_number": 1, "text": "PostgreSQL", "is_correct": True},
                        {"option_number": 2, "text": "MongoDB", "is_correct": False},
                        {"option_number": 3, "text": "Redis", "is_correct": False},
                        {"option_number": 4, "text": "Cassandra", "is_correct": False}
                    ]
                }
            ]
        }
        resp_data = {
            "choices": [
                {
                    "message": {
                        "content": json.dumps(mock_questions)
                    }
                }
            ]
        }
        return JSONResponse(content=resp_data)
        
    elif is_title_gen:
        resp_data = {
            "choices": [
                {
                    "message": {
                        "content": "Тестовый чат об SQL"
                    }
                }
            ]
        }
        return JSONResponse(content=resp_data)
        
    elif stream:
        async def mock_sse_generator():
            chunks = [
                "Привет! ",
                "Я тестовый ",
                "ИИ-ассистент, ",
                "интегрированный в ",
                "систему тестирования студентов. ",
                "Чем могу помочь?"
            ]
            for chunk in chunks:
                data = {
                    "choices": [
                        {
                            "delta": {
                                "content": chunk
                            }
                        }
                    ]
                }
                yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
                
            # Usage data
            usage_data = {
                "usage": {
                    "total_tokens": 15
                },
                "model": "mock-gpt-4o"
            }
            yield f"data: {json.dumps(usage_data, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
            
        return StreamingResponse(mock_sse_generator(), media_type="text/event-stream")
        
    else:
        # Non-streaming fallback
        resp_data = {
            "choices": [
                {
                    "message": {
                        "content": "Привет! Чем я могу помочь?"
                    }
                }
            ]
        }
        return JSONResponse(content=resp_data)
