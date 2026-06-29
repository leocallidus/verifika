from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user, require_teacher
from app.db.models import Question, QuestionImage
from app.db.session import get_session
from app.schemas.question_image import QuestionImageOut
from app.services.question_images import (
    ImageValidationError,
    delete_storage_file,
    image_out,
    save_question_image,
    storage_path,
)
from app.services.student_access import student_can_access_discipline

router = APIRouter(tags=["v2.question_images"])


async def _ensure_teacher_owns_question(
    session: AsyncSession,
    teacher_id: int,
    question_id: int,
) -> Question:
    question = (await session.execute(
        select(Question).where(Question.question_id == question_id)
    )).scalar_one_or_none()
    if question is None:
        raise HTTPException(status_code=404, detail="question not found")
    owned = (await session.execute(
        text(
            "SELECT COUNT(*) FROM teacher_disciplines "
            "WHERE teacher_id = :teacher_id AND discipline_id = :discipline_id"
        ),
        {"teacher_id": teacher_id, "discipline_id": question.discipline_id},
    )).scalar_one()
    if not owned:
        raise HTTPException(status_code=403, detail="not your discipline")
    return question


async def _can_read_image(
    session: AsyncSession,
    user: CurrentUser,
    image: QuestionImage,
) -> bool:
    question = (await session.execute(
        select(Question).where(Question.question_id == image.question_id)
    )).scalar_one_or_none()
    if question is None:
        return False
    if user.role == "teacher":
        count = (await session.execute(
            text(
                "SELECT COUNT(*) FROM teacher_disciplines "
                "WHERE teacher_id = :teacher_id AND discipline_id = :discipline_id"
            ),
            {"teacher_id": user.id, "discipline_id": question.discipline_id},
        )).scalar_one()
        return bool(count)
    if user.role == "student":
        return await student_can_access_discipline(session, user.id, question.discipline_id)
    return False


@router.post("/teacher/questions/{question_id}/image", response_model=QuestionImageOut)
async def upload_question_image(
    question_id: int,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> QuestionImageOut:
    await _ensure_teacher_owns_question(session, user.id, question_id)
    data = await file.read()
    try:
        stored = save_question_image(question_id, data, file.filename, file.content_type)
    except ImageValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    existing = (await session.execute(
        select(QuestionImage).where(QuestionImage.question_id == question_id)
    )).scalar_one_or_none()
    old_storage_key = existing.storage_key if existing else None

    try:
        if existing is None:
            image = QuestionImage(
                question_id=question_id,
                storage_key=stored.storage_key,
                original_name=stored.original_name,
                content_type=stored.content_type,
                size_bytes=stored.size_bytes,
                width_px=stored.width_px,
                height_px=stored.height_px,
                sha256_hex=stored.sha256_hex,
            )
            session.add(image)
        else:
            image = existing
            image.storage_key = stored.storage_key
            image.original_name = stored.original_name
            image.content_type = stored.content_type
            image.size_bytes = stored.size_bytes
            image.width_px = stored.width_px
            image.height_px = stored.height_px
            image.sha256_hex = stored.sha256_hex
        await session.commit()
    except Exception:
        await session.rollback()
        delete_storage_file(stored.storage_key)
        raise

    if old_storage_key:
        delete_storage_file(old_storage_key)
    await session.refresh(image)
    return image_out(image)


@router.delete("/teacher/questions/{question_id}/image", status_code=204)
async def delete_question_image(
    question_id: int,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> None:
    await _ensure_teacher_owns_question(session, user.id, question_id)
    existing = (await session.execute(
        select(QuestionImage).where(QuestionImage.question_id == question_id)
    )).scalar_one_or_none()
    if existing is None:
        return None
    storage_key = existing.storage_key
    await session.delete(existing)
    await session.commit()
    delete_storage_file(storage_key)
    return None


@router.get("/question-images/{image_id}")
async def get_question_image(
    image_id: int,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> FileResponse:
    image = (await session.execute(
        select(QuestionImage).where(QuestionImage.image_id == image_id)
    )).scalar_one_or_none()
    if image is None:
        raise HTTPException(status_code=404, detail="image not found")
    if not await _can_read_image(session, user, image):
        raise HTTPException(status_code=403, detail="image access denied")

    path = storage_path(image.storage_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="image file not found")
    return FileResponse(
        path,
        media_type=image.content_type,
        filename=image.original_name,
        headers={
            "Cache-Control": "private, max-age=86400",
            "ETag": image.sha256_hex,
        },
    )
