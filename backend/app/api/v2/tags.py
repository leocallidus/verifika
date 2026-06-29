from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, insert, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, require_teacher
from app.db.models import QuestionTag, QuestionTagMap
from app.db.session import get_session
from app.schemas.v2 import TagCreate, TagOut, TagPatch

router = APIRouter(prefix="/teacher/tags", tags=["v2.tags"])


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


async def _tag_with_count(session: AsyncSession, tag: QuestionTag) -> TagOut:
    q_count = (await session.execute(text(
        "SELECT COUNT(*) FROM question_tag_map WHERE tag_id = :t"
    ), {"t": tag.tag_id})).scalar() or 0
    return TagOut(tag_id=tag.tag_id, name=tag.name, question_count=int(q_count), archived=tag.archived_at is not None)


@router.get("", response_model=list[TagOut])
async def list_tags(
    q: str | None = Query(default=None),
    archived: bool = Query(default=False),
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> list[TagOut]:
    stmt = select(QuestionTag).where(
        QuestionTag.archived_at.is_not(None) if archived else QuestionTag.archived_at.is_(None)
    )
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(text("LOWER(name) LIKE :q").bindparams(q=like))
    stmt = stmt.order_by(QuestionTag.name)
    rows = (await session.execute(stmt)).scalars().all()
    return [await _tag_with_count(session, t) for t in rows]


@router.post("", response_model=TagOut, status_code=201)
async def create_tag(
    payload: TagCreate,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> TagOut:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="empty tag")
    existing = (await session.execute(
        select(QuestionTag).where(QuestionTag.name == name, QuestionTag.archived_at.is_(None))
    )).scalar_one_or_none()
    if existing:
        return await _tag_with_count(session, existing)
    archived_match = (await session.execute(
        select(QuestionTag).where(QuestionTag.name == name, QuestionTag.archived_at.is_not(None))
    )).scalar_one_or_none()
    if archived_match is not None:
        await session.execute(
            update(QuestionTag).where(QuestionTag.tag_id == archived_match.tag_id).values(archived_at=None)
        )
        await session.commit()
        await session.refresh(archived_match)
        return await _tag_with_count(session, archived_match)
    tag = QuestionTag(name=name)
    session.add(tag)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        existing = (await session.execute(
            select(QuestionTag).where(QuestionTag.name == name)
        )).scalar_one()
        return await _tag_with_count(session, existing)
    await session.refresh(tag)
    return await _tag_with_count(session, tag)


@router.patch("/{tag_id}", response_model=TagOut)
async def patch_tag(
    tag_id: int,
    payload: TagPatch,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="empty tag")
    tag = (await session.execute(
        select(QuestionTag).where(QuestionTag.tag_id == tag_id)
    )).scalar_one_or_none()
    if tag is None:
        raise HTTPException(status_code=404, detail="tag not found")
    if tag.archived_at is not None:
        raise HTTPException(status_code=409, detail="tag is archived; restore first")
    try:
        await session.execute(
            update(QuestionTag).where(QuestionTag.tag_id == tag_id).values(name=name)
        )
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status_code=409, detail="tag with this name already exists")
    tag = (await session.execute(
        select(QuestionTag).where(QuestionTag.tag_id == tag_id)
    )).scalar_one()
    return await _tag_with_count(session, tag)


@router.delete("/{tag_id}", status_code=204)
async def delete_tag(tag_id: int, user: CurrentUser = Depends(require_teacher), session: AsyncSession = Depends(get_session)):
    tag = (await session.execute(
        select(QuestionTag).where(QuestionTag.tag_id == tag_id)
    )).scalar_one_or_none()
    if tag is None or tag.archived_at is not None:
        raise HTTPException(status_code=404, detail="tag not found")
    await session.execute(
        update(QuestionTag).where(QuestionTag.tag_id == tag_id).values(archived_at=_now_utc())
    )
    await session.commit()
    return None


@router.post("/{tag_id}/restore", response_model=TagOut)
async def restore_tag(tag_id: int, user: CurrentUser = Depends(require_teacher), session: AsyncSession = Depends(get_session)):
    tag = (await session.execute(
        select(QuestionTag).where(QuestionTag.tag_id == tag_id)
    )).scalar_one_or_none()
    if tag is None:
        raise HTTPException(status_code=404, detail="tag not found")
    if tag.archived_at is None:
        return await _tag_with_count(session, tag)
    conflict = (await session.execute(
        select(QuestionTag).where(
            QuestionTag.name == tag.name,
            QuestionTag.tag_id != tag_id,
            QuestionTag.archived_at.is_(None),
        )
    )).scalar_one_or_none()
    if conflict:
        raise HTTPException(status_code=409, detail="активный тег с таким именем уже существует")
    await session.execute(
        update(QuestionTag).where(QuestionTag.tag_id == tag_id).values(archived_at=None)
    )
    await session.commit()
    await session.refresh(tag)
    return await _tag_with_count(session, tag)
