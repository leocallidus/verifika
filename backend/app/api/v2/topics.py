from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user, require_teacher
from app.db.models import (
    Discipline,
    DisciplineImage,
    DisciplineTopic,
    DisciplineTopicImage,
    Question,
    TeacherDiscipline,
    TeacherTopicTest,
    Group,
    TeacherTopicTestGroupRule,
    GroupDiscipline,
)
from app.db.session import get_session
from app.schemas.v2 import (
    AssetImageOut,
    DisciplineTopicIn,
    DisciplineTopicOut,
    DisciplineTopicPatch,
    QuestionBankDisciplineOut,
    TopicTestBriefOut,
    TopicTestIn,
    TopicTestOut,
    TopicTestGroupRuleIn,
    TopicTestGroupRuleOut,
)
from app.services.question_images import (
    ImageValidationError,
    delete_storage_file,
    discipline_image_url,
    save_discipline_image,
    save_topic_image,
    storage_path,
    topic_image_url,
)
from app.services.audit_trail import client_ip
from app.services.teacher_audit import audit as teacher_audit_log
from app.services.test_publication_validator import (
    format_publication_issues,
    validate_topic_test_publication,
)
from app.services.versioning import ensure_topic_policy_version

router = APIRouter(tags=["v2.topics"])


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _asset_out(image: DisciplineImage | DisciplineTopicImage, url: str) -> AssetImageOut:
    return AssetImageOut(
        image_id=image.image_id,
        url=url,
        content_type=image.content_type,
        size_bytes=image.size_bytes,
        width_px=image.width_px,
        height_px=image.height_px,
        original_name=image.original_name,
    )


def _topic_snapshot(topic: DisciplineTopic) -> dict:
    return {
        "topic_id": topic.topic_id,
        "discipline_id": topic.discipline_id,
        "name": topic.name,
        "description": topic.description,
        "sort_order": topic.sort_order,
        "archived_at": topic.archived_at,
    }


def _topic_test_snapshot(test: TeacherTopicTest) -> dict:
    return {
        "teacher_id": test.teacher_id,
        "topic_id": test.topic_id,
        "is_enabled": test.is_enabled,
        "question_count": test.question_count,
        "time_limit_minutes": test.time_limit_minutes,
        "attempts_allowed": test.attempts_allowed,
        "available_from": test.available_from,
        "available_until": test.available_until,
        "shuffle_seed": test.shuffle_seed,
        "show_correct_after_finish": test.show_correct_after_finish,
        "passing_score_percent": test.passing_score_percent,
        "grading_method": test.grading_method,
        "show_question_points": test.show_question_points,
        "attempt_delay_minutes": test.attempt_delay_minutes,
        "grade_scale": test.grade_scale,
        "allow_study": test.allow_study,
    }


async def _ensure_own_discipline(
    session: AsyncSession,
    teacher_id: int,
    discipline_id: int,
) -> Discipline:
    row = (await session.execute(
        select(Discipline)
        .join(TeacherDiscipline, TeacherDiscipline.discipline_id == Discipline.discipline_id)
        .where(
            TeacherDiscipline.teacher_id == teacher_id,
            Discipline.discipline_id == discipline_id,
        )
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=403, detail="not your discipline")
    return row


async def _get_owned_topic(
    session: AsyncSession,
    teacher_id: int,
    topic_id: int,
    include_archived: bool = False,
) -> DisciplineTopic:
    topic = (await session.execute(
        select(DisciplineTopic).where(DisciplineTopic.topic_id == topic_id)
    )).scalar_one_or_none()
    if topic is None or (topic.archived_at is not None and not include_archived):
        raise HTTPException(status_code=404, detail="topic not found")
    await _ensure_own_discipline(session, teacher_id, topic.discipline_id)
    return topic


def _is_unique_violation(exc: IntegrityError) -> bool:
    orig = exc.orig
    candidates = (orig, getattr(orig, "__cause__", None), getattr(orig, "__context__", None))
    return any(
        (getattr(candidate, "sqlstate", None) or getattr(candidate, "pgcode", None)) == "23505"
        for candidate in candidates
    )


async def _topic_out(
    session: AsyncSession,
    topic: DisciplineTopic,
    teacher_id: int,
) -> DisciplineTopicOut:
    questions_count = (await session.execute(
        select(func.count()).select_from(Question).where(
            Question.topic_id == topic.topic_id,
            Question.archived_at.is_(None),
        )
    )).scalar_one() or 0
    image = (await session.execute(
        select(DisciplineTopicImage).where(DisciplineTopicImage.topic_id == topic.topic_id)
    )).scalar_one_or_none()
    test = (await session.execute(
        select(TeacherTopicTest).where(
            TeacherTopicTest.teacher_id == teacher_id,
            TeacherTopicTest.topic_id == topic.topic_id,
        )
    )).scalar_one_or_none()
    return DisciplineTopicOut(
        topic_id=topic.topic_id,
        discipline_id=topic.discipline_id,
        name=topic.name,
        description=topic.description,
        sort_order=topic.sort_order,
        image=_asset_out(image, topic_image_url(image.image_id)) if image else None,
        questions_count=int(questions_count),
        test=TopicTestBriefOut(
            is_enabled=test.is_enabled,
            question_count=test.question_count,
            time_limit_minutes=test.time_limit_minutes,
            available_from=test.available_from,
            available_until=test.available_until,
            grade_scale=test.grade_scale,
        ) if test else None,
        archived=topic.archived_at is not None,
    )


@router.get("/teacher/question-bank/disciplines", response_model=List[QuestionBankDisciplineOut])
async def question_bank_disciplines(
    q: Optional[str] = Query(default=None),
    archived: bool = Query(default=False),
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> list[QuestionBankDisciplineOut]:
    stmt = (
        select(Discipline)
        .join(TeacherDiscipline, TeacherDiscipline.discipline_id == Discipline.discipline_id)
        .where(TeacherDiscipline.teacher_id == user.id)
    )
    stmt = stmt.where(Discipline.archived_at.is_not(None) if archived else Discipline.archived_at.is_(None))
    if q:
        stmt = stmt.where(
            text("(LOWER(disciplines.name) LIKE :q OR LOWER(COALESCE(disciplines.description,'')) LIKE :q)")
            .bindparams(q=f"%{q.lower()}%")
        )
    disciplines = (await session.execute(stmt.order_by(Discipline.name))).scalars().all()
    result: list[QuestionBankDisciplineOut] = []
    for d in disciplines:
        topics_count = (await session.execute(
            select(func.count()).select_from(DisciplineTopic).where(
                DisciplineTopic.discipline_id == d.discipline_id,
                DisciplineTopic.archived_at.is_(None),
            )
        )).scalar_one() or 0
        questions_count = (await session.execute(
            select(func.count()).select_from(Question).where(
                Question.discipline_id == d.discipline_id,
                Question.archived_at.is_(None),
            )
        )).scalar_one() or 0
        untopiced_count = (await session.execute(
            select(func.count()).select_from(Question).where(
                Question.discipline_id == d.discipline_id,
                Question.topic_id.is_(None),
                Question.archived_at.is_(None),
            )
        )).scalar_one() or 0
        enabled_topic_tests_count = (await session.execute(
            select(func.count())
            .select_from(TeacherTopicTest)
            .join(DisciplineTopic, DisciplineTopic.topic_id == TeacherTopicTest.topic_id)
            .where(
                TeacherTopicTest.teacher_id == user.id,
                TeacherTopicTest.is_enabled.is_(True),
                DisciplineTopic.discipline_id == d.discipline_id,
                DisciplineTopic.archived_at.is_(None),
            )
        )).scalar_one() or 0
        image = (await session.execute(
            select(DisciplineImage).where(DisciplineImage.discipline_id == d.discipline_id)
        )).scalar_one_or_none()
        result.append(QuestionBankDisciplineOut(
            discipline_id=d.discipline_id,
            name=d.name,
            description=d.description,
            image=_asset_out(image, discipline_image_url(image.image_id)) if image else None,
            topics_count=int(topics_count),
            questions_count=int(questions_count),
            untopiced_questions_count=int(untopiced_count),
            enabled_topic_tests_count=int(enabled_topic_tests_count),
        ))
    return result


@router.get("/teacher/disciplines/{discipline_id}/topics", response_model=List[DisciplineTopicOut])
async def list_topics(
    discipline_id: int,
    include_archived: bool = False,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> list[DisciplineTopicOut]:
    await _ensure_own_discipline(session, user.id, discipline_id)
    stmt = select(DisciplineTopic).where(DisciplineTopic.discipline_id == discipline_id)
    if not include_archived:
        stmt = stmt.where(DisciplineTopic.archived_at.is_(None))
    topics = (await session.execute(
        stmt.order_by(DisciplineTopic.sort_order.asc(), DisciplineTopic.name.asc())
    )).scalars().all()
    return [await _topic_out(session, topic, user.id) for topic in topics]


@router.post("/teacher/disciplines/{discipline_id}/topics", response_model=DisciplineTopicOut, status_code=201)
async def create_topic(
    discipline_id: int,
    payload: DisciplineTopicIn,
    request: Request,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> DisciplineTopicOut:
    discipline = await _ensure_own_discipline(session, user.id, discipline_id)
    if discipline.archived_at is not None:
        raise HTTPException(status_code=404, detail="discipline not found")
    topic = DisciplineTopic(
        discipline_id=discipline_id,
        name=payload.name.strip(),
        description=payload.description,
        sort_order=payload.sort_order,
        created_by=user.id,
    )
    try:
        session.add(topic)
        await session.flush()
        await teacher_audit_log(
            session,
            teacher_id=user.id,
            action="topic_created",
            target_type="topic",
            target_id=topic.topic_id,
            before=None,
            after=_topic_snapshot(topic),
            ip_addr=client_ip(request),
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        if _is_unique_violation(exc):
            raise HTTPException(status_code=409, detail="topic already exists")
        raise HTTPException(status_code=400, detail="invalid topic data")
    await session.refresh(topic)
    return await _topic_out(session, topic, user.id)


@router.patch("/teacher/topics/{topic_id}", response_model=DisciplineTopicOut)
async def patch_topic(
    topic_id: int,
    payload: DisciplineTopicPatch,
    request: Request,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> DisciplineTopicOut:
    topic = await _get_owned_topic(session, user.id, topic_id)
    before = _topic_snapshot(topic)
    values = payload.model_dump(exclude_unset=True)
    if "name" in values and values["name"] is not None:
        topic.name = values["name"].strip()
    if "description" in values:
        topic.description = values["description"]
    if "sort_order" in values and values["sort_order"] is not None:
        topic.sort_order = values["sort_order"]
    topic.updated_at = _now_utc()
    try:
        await teacher_audit_log(
            session,
            teacher_id=user.id,
            action="topic_updated",
            target_type="topic",
            target_id=topic_id,
            before=before,
            after=_topic_snapshot(topic),
            ip_addr=client_ip(request),
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        if _is_unique_violation(exc):
            raise HTTPException(status_code=409, detail="topic already exists")
        raise HTTPException(status_code=400, detail="invalid topic data")
    await session.refresh(topic)
    return await _topic_out(session, topic, user.id)


@router.delete("/teacher/topics/{topic_id}", status_code=204)
async def delete_topic(
    topic_id: int,
    request: Request,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> None:
    topic = await _get_owned_topic(session, user.id, topic_id)
    before = _topic_snapshot(topic)
    # Учитываем только активные вопросы: архивные преподаватель не
    # считает «живыми», и UI-карточка показывает счётчик без них.
    # Иначе после архивирования всех вопросов тема всё равно не удаляется
    # — это расхождение ловится у пользователя явно.
    count = (await session.execute(
        select(func.count()).select_from(Question).where(
            Question.topic_id == topic_id,
            Question.archived_at.is_(None),
        )
    )).scalar_one() or 0
    if count:
        raise HTTPException(
            status_code=409,
            detail="В теме есть вопросы — сначала переместите или удалите их",
        )
    topic.archived_at = _now_utc()
    topic.updated_at = _now_utc()
    await teacher_audit_log(
        session,
        teacher_id=user.id,
        action="topic_archived",
        target_type="topic",
        target_id=topic_id,
        before=before,
        after=_topic_snapshot(topic),
        ip_addr=client_ip(request),
    )
    await session.commit()
    return None


@router.post("/teacher/topics/{topic_id}/restore", response_model=DisciplineTopicOut)
async def restore_topic(
    topic_id: int,
    request: Request,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> DisciplineTopicOut:
    topic = await _get_owned_topic(session, user.id, topic_id, include_archived=True)
    if topic.archived_at is None:
        return await _topic_out(session, topic, user.id)
    before = _topic_snapshot(topic)
    topic.archived_at = None
    topic.updated_at = _now_utc()
    try:
        await teacher_audit_log(
            session,
            teacher_id=user.id,
            action="topic_restored",
            target_type="topic",
            target_id=topic_id,
            before=before,
            after=_topic_snapshot(topic),
            ip_addr=client_ip(request),
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        if _is_unique_violation(exc):
            raise HTTPException(status_code=409, detail="topic name conflicts with existing topic")
        raise HTTPException(status_code=400, detail="invalid topic data")
    await session.refresh(topic)
    return await _topic_out(session, topic, user.id)


def _topic_test_out(test: TeacherTopicTest) -> TopicTestOut:
    return TopicTestOut(
        teacher_id=test.teacher_id,
        topic_id=test.topic_id,
        is_enabled=test.is_enabled,
        question_count=test.question_count,
        time_limit_minutes=test.time_limit_minutes,
        attempts_allowed=test.attempts_allowed,
        available_from=test.available_from,
        available_until=test.available_until,
        shuffle_seed=test.shuffle_seed,
        show_correct_after_finish=test.show_correct_after_finish,
        passing_score_percent=test.passing_score_percent,
        grading_method=test.grading_method,
        show_question_points=test.show_question_points,
        attempt_delay_minutes=test.attempt_delay_minutes,
        grade_scale=test.grade_scale,
        allow_study=test.allow_study,
        updated_at=test.updated_at,
    )


@router.get("/teacher/topics/{topic_id}/test", response_model=TopicTestOut)
async def get_topic_test(
    topic_id: int,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> TopicTestOut:
    await _get_owned_topic(session, user.id, topic_id)
    test = (await session.execute(
        select(TeacherTopicTest).where(
            TeacherTopicTest.teacher_id == user.id,
            TeacherTopicTest.topic_id == topic_id,
        )
    )).scalar_one_or_none()
    if test is None:
        test = TeacherTopicTest(teacher_id=user.id, topic_id=topic_id)
        session.add(test)
        await session.commit()
        await session.refresh(test)
    return _topic_test_out(test)


@router.put("/teacher/topics/{topic_id}/test", response_model=TopicTestOut)
async def put_topic_test(
    topic_id: int,
    payload: TopicTestIn,
    request: Request,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> TopicTestOut:
    await _get_owned_topic(session, user.id, topic_id)
    if payload.available_from and payload.available_until and payload.available_until <= payload.available_from:
        raise HTTPException(status_code=400, detail="available_until must be later than available_from")
    if payload.is_enabled:
        issues = await validate_topic_test_publication(
            session,
            topic_id=topic_id,
            question_count=payload.question_count,
        )
        if issues:
            raise HTTPException(status_code=400, detail=format_publication_issues(issues))
    test = (await session.execute(
        select(TeacherTopicTest).where(
            TeacherTopicTest.teacher_id == user.id,
            TeacherTopicTest.topic_id == topic_id,
        )
    )).scalar_one_or_none()
    before = _topic_test_snapshot(test) if test is not None else None
    if test is None:
        test = TeacherTopicTest(teacher_id=user.id, topic_id=topic_id)
        session.add(test)
    test.is_enabled = payload.is_enabled
    test.question_count = payload.question_count
    test.time_limit_minutes = payload.time_limit_minutes
    test.attempts_allowed = payload.attempts_allowed
    test.available_from = payload.available_from
    test.available_until = payload.available_until
    test.shuffle_seed = payload.shuffle_seed
    test.show_correct_after_finish = payload.show_correct_after_finish
    test.passing_score_percent = payload.passing_score_percent
    test.grading_method = payload.grading_method
    test.show_question_points = payload.show_question_points
    test.attempt_delay_minutes = payload.attempt_delay_minutes
    test.grade_scale = payload.grade_scale
    test.allow_study = payload.allow_study
    test.updated_at = _now_utc()
    await session.flush()
    await ensure_topic_policy_version(session, test, created_by_teacher_id=user.id)
    await teacher_audit_log(
        session,
        teacher_id=user.id,
        action="topic_test_created" if before is None else "topic_test_updated",
        target_type="topic_test",
        target_id=topic_id,
        before=before,
        after=_topic_test_snapshot(test),
        ip_addr=client_ip(request),
    )
    await session.commit()
    await session.refresh(test)
    return _topic_test_out(test)


@router.get("/teacher/topics/{topic_id}/test/group-rules", response_model=List[TopicTestGroupRuleOut])
async def get_topic_test_group_rules(
    topic_id: int,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> List[TopicTestGroupRuleOut]:
    topic = await _get_owned_topic(session, user.id, topic_id)
    stmt = (
        select(Group, TeacherTopicTestGroupRule)
        .join(GroupDiscipline, GroupDiscipline.group_id == Group.group_id)
        .outerjoin(
            TeacherTopicTestGroupRule,
            (TeacherTopicTestGroupRule.group_id == Group.group_id) & (TeacherTopicTestGroupRule.topic_id == topic_id)
        )
        .where(
            GroupDiscipline.discipline_id == topic.discipline_id,
            Group.archived_at.is_(None)
        )
        .order_by(Group.name.asc())
    )
    rows = (await session.execute(stmt)).all()
    
    result = []
    for group, rule in rows:
        result.append(
            TopicTestGroupRuleOut(
                group_id=group.group_id,
                group_name=group.name,
                topic_id=topic_id,
                available_from=rule.available_from if rule else None,
                available_until=rule.available_until if rule else None,
                updated_at=rule.updated_at if rule else _now_utc()
            )
        )
    return result


@router.put("/teacher/topics/{topic_id}/test/group-rules", response_model=List[TopicTestGroupRuleOut])
async def put_topic_test_group_rules(
    topic_id: int,
    payload: List[TopicTestGroupRuleIn],
    request: Request,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> List[TopicTestGroupRuleOut]:
    topic = await _get_owned_topic(session, user.id, topic_id)
    
    for r in payload:
        if r.available_from and r.available_until and r.available_until <= r.available_from:
            raise HTTPException(status_code=400, detail=f"Группа {r.group_id}: дата окончания должна быть позже даты начала")

    # Delete existing rules for this topic
    await session.execute(
        text("DELETE FROM teacher_topic_test_group_rules WHERE topic_id = :topic_id"),
        {"topic_id": topic_id}
    )

    # Insert new rules
    for r in payload:
        if r.available_from is not None or r.available_until is not None:
            rule = TeacherTopicTestGroupRule(
                topic_id=topic_id,
                group_id=r.group_id,
                available_from=r.available_from,
                available_until=r.available_until,
                updated_at=_now_utc()
            )
            session.add(rule)

    await session.commit()

    # Log action
    await teacher_audit_log(
        session,
        teacher_id=user.id,
        action="topic_test_group_rules_updated",
        target_type="topic_test_group_rules",
        target_id=topic_id,
        before=None,
        after=[{
            "group_id": r.group_id,
            "available_from": r.available_from.isoformat() if r.available_from else None,
            "available_until": r.available_until.isoformat() if r.available_until else None
        } for r in payload],
        ip_addr=client_ip(request),
    )

    # Return refreshed rules
    stmt = (
        select(Group, TeacherTopicTestGroupRule)
        .join(GroupDiscipline, GroupDiscipline.group_id == Group.group_id)
        .outerjoin(
            TeacherTopicTestGroupRule,
            (TeacherTopicTestGroupRule.group_id == Group.group_id) & (TeacherTopicTestGroupRule.topic_id == topic_id)
        )
        .where(
            GroupDiscipline.discipline_id == topic.discipline_id,
            Group.archived_at.is_(None)
        )
        .order_by(Group.name.asc())
    )
    rows = (await session.execute(stmt)).all()
    
    result = []
    for group, rule in rows:
        result.append(
            TopicTestGroupRuleOut(
                group_id=group.group_id,
                group_name=group.name,
                topic_id=topic_id,
                available_from=rule.available_from if rule else None,
                available_until=rule.available_until if rule else None,
                updated_at=rule.updated_at if rule else _now_utc()
            )
        )
    return result


@router.post("/teacher/disciplines/{discipline_id}/topics/bulk-test-schedule")
async def bulk_update_topics_schedule(
    discipline_id: int,
    payload: dict,
    request: Request,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    await _ensure_own_discipline(session, user.id, discipline_id)
    available_from = payload.get("available_from")
    available_until = payload.get("available_until")
    
    from_dt = None
    if available_from:
        from_dt = datetime.fromisoformat(available_from.replace("Z", "+00:00"))
    until_dt = None
    if available_until:
        until_dt = datetime.fromisoformat(available_until.replace("Z", "+00:00"))
        
    if from_dt and until_dt and until_dt <= from_dt:
        raise HTTPException(status_code=400, detail="available_until must be later than available_from")
        
    topics = (await session.execute(
        select(DisciplineTopic).where(DisciplineTopic.discipline_id == discipline_id, DisciplineTopic.archived_at.is_(None))
    )).scalars().all()
    
    updated = 0
    touched_topic_ids: list[int] = []
    for topic in topics:
        test = (await session.execute(
            select(TeacherTopicTest).where(
                TeacherTopicTest.teacher_id == user.id,
                TeacherTopicTest.topic_id == topic.topic_id,
            )
        )).scalar_one_or_none()
        if test:
            if test.is_enabled:
                issues = await validate_topic_test_publication(
                    session,
                    topic_id=topic.topic_id,
                    question_count=test.question_count,
                )
                if issues:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Тема «{topic.name}»: {format_publication_issues(issues)}",
                    )
            test.available_from = from_dt
            test.available_until = until_dt
            test.updated_at = _now_utc()
            await session.flush()
            await ensure_topic_policy_version(session, test, created_by_teacher_id=user.id)
            updated += 1
            touched_topic_ids.append(topic.topic_id)
        else:
            issues = await validate_topic_test_publication(
                session,
                topic_id=topic.topic_id,
                question_count=10,
            )
            if issues:
                raise HTTPException(
                    status_code=400,
                    detail=f"Тема «{topic.name}»: {format_publication_issues(issues)}",
                )
            test = TeacherTopicTest(
                teacher_id=user.id,
                topic_id=topic.topic_id,
                available_from=from_dt,
                available_until=until_dt,
                is_enabled=True,
                question_count=10,
                time_limit_minutes=20,
                updated_at=_now_utc(),
            )
            session.add(test)
            await session.flush()
            await ensure_topic_policy_version(session, test, created_by_teacher_id=user.id)
            updated += 1
            touched_topic_ids.append(topic.topic_id)
            
    if updated:
        await teacher_audit_log(
            session,
            teacher_id=user.id,
            action="topic_tests_schedule_bulk_updated",
            target_type="discipline",
            target_id=discipline_id,
            before=None,
            after={
                "discipline_id": discipline_id,
                "topic_ids": touched_topic_ids,
                "available_from": from_dt,
                "available_until": until_dt,
                "count": updated,
            },
            ip_addr=client_ip(request),
        )
    await session.commit()
    return {"ok": True, "count": updated}


@router.post("/teacher/disciplines/{discipline_id}/image", response_model=AssetImageOut)
async def upload_discipline_image(
    discipline_id: int,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> AssetImageOut:
    await _ensure_own_discipline(session, user.id, discipline_id)
    data = await file.read()
    try:
        stored = save_discipline_image(discipline_id, data, file.filename, file.content_type)
    except ImageValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    existing = (await session.execute(
        select(DisciplineImage).where(DisciplineImage.discipline_id == discipline_id)
    )).scalar_one_or_none()
    old_storage_key = existing.storage_key if existing else None
    try:
        if existing is None:
            image = DisciplineImage(
                discipline_id=discipline_id,
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
    return _asset_out(image, discipline_image_url(image.image_id))


@router.delete("/teacher/disciplines/{discipline_id}/image", status_code=204)
async def delete_discipline_image(
    discipline_id: int,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> None:
    await _ensure_own_discipline(session, user.id, discipline_id)
    existing = (await session.execute(
        select(DisciplineImage).where(DisciplineImage.discipline_id == discipline_id)
    )).scalar_one_or_none()
    if existing is None:
        return None
    storage_key = existing.storage_key
    await session.delete(existing)
    await session.commit()
    delete_storage_file(storage_key)
    return None


@router.post("/teacher/topics/{topic_id}/image", response_model=AssetImageOut)
async def upload_topic_image(
    topic_id: int,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> AssetImageOut:
    await _get_owned_topic(session, user.id, topic_id)
    data = await file.read()
    try:
        stored = save_topic_image(topic_id, data, file.filename, file.content_type)
    except ImageValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    existing = (await session.execute(
        select(DisciplineTopicImage).where(DisciplineTopicImage.topic_id == topic_id)
    )).scalar_one_or_none()
    old_storage_key = existing.storage_key if existing else None
    try:
        if existing is None:
            image = DisciplineTopicImage(
                topic_id=topic_id,
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
    return _asset_out(image, topic_image_url(image.image_id))


@router.delete("/teacher/topics/{topic_id}/image", status_code=204)
async def delete_topic_image(
    topic_id: int,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> None:
    await _get_owned_topic(session, user.id, topic_id)
    existing = (await session.execute(
        select(DisciplineTopicImage).where(DisciplineTopicImage.topic_id == topic_id)
    )).scalar_one_or_none()
    if existing is None:
        return None
    storage_key = existing.storage_key
    await session.delete(existing)
    await session.commit()
    delete_storage_file(storage_key)
    return None


async def _can_read_discipline_image(session: AsyncSession, user: CurrentUser, discipline_id: int) -> bool:
    if user.role == "teacher":
        count = (await session.execute(
            text(
                "SELECT COUNT(*) FROM teacher_disciplines "
                "WHERE teacher_id = :uid AND discipline_id = :did"
            ),
            {"uid": user.id, "did": discipline_id},
        )).scalar_one()
        return bool(count)
    if user.role == "student":
        count = (await session.execute(
            text("SELECT COUNT(*) FROM teacher_disciplines WHERE discipline_id = :did"),
            {"did": discipline_id},
        )).scalar_one()
        return bool(count)
    return False


@router.get("/discipline-images/{image_id}")
async def get_discipline_image(
    image_id: int,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> FileResponse:
    image = (await session.execute(
        select(DisciplineImage).where(DisciplineImage.image_id == image_id)
    )).scalar_one_or_none()
    if image is None:
        raise HTTPException(status_code=404, detail="image not found")
    if not await _can_read_discipline_image(session, user, image.discipline_id):
        raise HTTPException(status_code=403, detail="image access denied")
    path = storage_path(image.storage_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="image file not found")
    return FileResponse(
        path,
        media_type=image.content_type,
        filename=image.original_name,
        headers={"Cache-Control": "private, max-age=86400", "ETag": image.sha256_hex},
    )


@router.get("/topic-images/{image_id}")
async def get_topic_image(
    image_id: int,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> FileResponse:
    image = (await session.execute(
        select(DisciplineTopicImage).where(DisciplineTopicImage.image_id == image_id)
    )).scalar_one_or_none()
    if image is None:
        raise HTTPException(status_code=404, detail="image not found")
    topic = (await session.execute(
        select(DisciplineTopic).where(DisciplineTopic.topic_id == image.topic_id)
    )).scalar_one_or_none()
    if topic is None or not await _can_read_discipline_image(session, user, topic.discipline_id):
        raise HTTPException(status_code=403, detail="image access denied")
    path = storage_path(image.storage_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="image file not found")
    return FileResponse(
        path,
        media_type=image.content_type,
        filename=image.original_name,
        headers={"Cache-Control": "private, max-age=86400", "ETag": image.sha256_hex},
    )


def censor_qmeta(meta: dict | None) -> dict | None:
    if not meta:
        return None
    import copy
    censored = copy.deepcopy(meta)
    censored.pop("correct_bool", None)
    censored.pop("explanation", None)
    censored.pop("acceptable_answers", None)
    censored.pop("short_pattern", None)
    if "cloze_blanks" in censored:
        for b in censored["cloze_blanks"]:
            b.pop("correct_index", None)
            b.pop("acceptable_answers", None)
    if "options_meta" in censored:
        for o in censored["options_meta"]:
            o.pop("is_correct", None)
            o.pop("correct_position", None)
    return censored


async def build_preview_session(
    session: AsyncSession,
    q_ids: list[int],
    time_limit_minutes: int,
    proctor_min_level: int,
    topic_metadata: TopicTestMetadata,
) -> ResumeOut:
    from datetime import timedelta
    from app.db.models import AnswerOption, QuestionClozeBlank, QuestionImage, Question
    from app.services.question_images import question_image_url
    from app.services.randomization import OptionDTO, QuestionDTO, shuffle_options
    from app.schemas.student import QuestionOut, OptionOut

    # 1. Fetch questions with details
    candidate_stmt = (
        select(Question.question_id, Question.text, Question.qtype,
               Question.short_pattern, Question.numeric_tolerance, Question.match_pairs,
               Question.correct_bool, Question.explanation,
               Question.case_sensitive, Question.trim_whitespace,
               Question.normalize_universal, Question.text_mode, Question.allow_partial)
        .where(Question.question_id.in_(q_ids))
        .order_by(Question.question_id)
    )
    candidate_rows = (await session.execute(candidate_stmt)).all()
    q_meta = {row[0]: tuple(row[1:]) for row in candidate_rows}

    # 2. Fetch options
    o_rows = (await session.execute(
        select(AnswerOption).where(AnswerOption.question_id.in_(q_ids))
    )).scalars().all()
    grouped: dict[int, list[AnswerOption]] = {}
    for o in o_rows:
        grouped.setdefault(o.question_id, []).append(o)

    # 3. Fetch acceptable answers
    acceptable_by_q: dict[int, list[str]] = {qid: [] for qid in q_ids}
    aa_rows = (await session.execute(
        text("SELECT question_id, answer FROM question_acceptable_answers WHERE question_id = ANY(:ids) ORDER BY question_id, ord")
        .bindparams(ids=q_ids)
    )).all()
    for qid, ans in aa_rows:
        acceptable_by_q.setdefault(qid, []).append(ans)

    # 4. Fetch cloze blanks
    cloze_by_q: dict[int, list[dict]] = {qid: [] for qid in q_ids}
    cloze_rows = (await session.execute(
        select(QuestionClozeBlank).where(QuestionClozeBlank.question_id.in_(q_ids))
    )).scalars().all()
    for b in cloze_rows:
        cloze_by_q.setdefault(b.question_id, []).append({
            "index": b.blank_index,
            "kind": b.kind,
            "options": b.options,
            "correct_index": b.correct_index,
            "acceptable_answers": b.acceptable_answers,
        })

    # 5. Build extra_meta
    extra_meta: dict[int, dict] = {}
    for qid in q_ids:
        meta = q_meta.get(qid)
        if not meta:
            continue
        opts = grouped.get(qid, [])
        extra_meta[qid] = {
            "qtype": meta[1],
            "short_pattern": meta[2],
            "numeric_tolerance": float(meta[3]) if meta[3] is not None else None,
            "match_pairs": meta[4] or [],
            "acceptable_answers": acceptable_by_q.get(qid, []),
            "correct_bool": meta[5],
            "explanation": meta[6],
            "case_sensitive": bool(meta[7]),
            "trim_whitespace": bool(meta[8]),
            "normalize_universal": bool(meta[9]),
            "text_mode": meta[10] or "string",
            "allow_partial": bool(meta[11]),
            "cloze_blanks": cloze_by_q.get(qid, []),
            "options_meta": [
                {
                    "option_id": o.option_id,
                    "text": o.text,
                    "is_correct": o.is_correct,
                    "match_left": o.match_left,
                    "match_right": o.match_right,
                    "correct_position": o.correct_position,
                }
                for o in opts
            ],
        }

    # 6. Fetch images
    image_urls: dict[int, str] = {}
    image_rows = (await session.execute(
        select(QuestionImage.image_id, QuestionImage.question_id)
        .where(QuestionImage.question_id.in_(q_ids))
    )).all()
    for image_id, qid in image_rows:
        image_urls[qid] = question_image_url(image_id)

    # 7. Fetch points
    rows = (await session.execute(
        select(Question.question_id, Question.points).where(Question.question_id.in_(q_ids))
    )).all()
    points_map = {qid: float(pts) if pts is not None else 1.0 for qid, pts in rows}

    # 8. Construct QuestionOut list
    questions_out = []
    for qid in q_ids:
        meta = q_meta.get(qid)
        if not meta:
            continue
        opts = grouped.get(qid, [])

        q_dto = QuestionDTO(
            question_id=qid,
            text=meta[0],
            options=[OptionDTO(option_id=o.option_id, option_number=o.option_number, text=o.text, is_correct=o.is_correct) for o in opts],
        )
        q_dto = shuffle_options(q_dto, seed=42)

        questions_out.append(QuestionOut(
            question_id=qid,
            question_text=meta[0],
            options=[
                OptionOut(
                    option_id=o.option_id,
                    option_number=idx + 1,
                    option_text=o.text,
                    match_left=getattr(o, "match_left", None),
                    match_right=getattr(o, "match_right", None),
                )
                for idx, o in enumerate(q_dto.options)
            ],
            qtype=meta[1],
            qmeta=censor_qmeta(extra_meta.get(qid)),
            image_url=image_urls.get(qid),
            points=points_map.get(qid, 1.0),
        ))

    started_at = datetime.now(timezone.utc)
    expires_at = started_at + timedelta(minutes=time_limit_minutes)

    return ResumeOut(
        session_id=-1,
        started_at=started_at,
        time_limit_minutes=time_limit_minutes,
        expires_at=expires_at,
        questions=questions_out,
        saved_answers={},
        saved_extras={},
        proctor_min_level=proctor_min_level,
        topic_metadata=topic_metadata,
    )


from app.schemas.student import AnswerIn, StudentSessionDetailOut, StudentSessionAnswerDetailOut, ResumeOut, TopicTestMetadata
from pydantic import BaseModel


class PreviewGradeIn(BaseModel):
    topic_id: Optional[int] = None
    discipline_id: Optional[int] = None
    question_ids: List[int]
    answers: List[AnswerIn]


@router.get("/teacher/topics/{topic_id}/preview", response_model=ResumeOut)
async def preview_topic_test(
    topic_id: int,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    topic = (await session.execute(
        select(DisciplineTopic).where(
            DisciplineTopic.topic_id == topic_id,
            DisciplineTopic.archived_at.is_(None),
        )
    )).scalar_one_or_none()
    if topic is None:
        raise HTTPException(status_code=404, detail="topic not found")

    td = (await session.execute(
        select(TeacherDiscipline).where(
            TeacherDiscipline.discipline_id == topic.discipline_id,
            TeacherDiscipline.teacher_id == user.id,
        )
    )).scalar_one_or_none()
    if td is None:
        raise HTTPException(status_code=403, detail="not your discipline")

    test = (await session.execute(
        select(TeacherTopicTest).where(
            TeacherTopicTest.topic_id == topic_id,
            TeacherTopicTest.teacher_id == user.id,
        )
    )).scalar_one_or_none()

    time_limit_minutes = test.time_limit_minutes if test else 30
    question_count = test.question_count if test else 10
    shuffle_questions = test.shuffle_questions if test else False
    grade_scale = test.grade_scale if test else "5_point"
    passing_score_percent = test.passing_score_percent if test else 60

    candidate_stmt = (
        select(Question.question_id)
        .where(Question.topic_id == topic_id, Question.archived_at.is_(None))
        .order_by(Question.question_id)
    )
    candidate_ids = (await session.execute(candidate_stmt)).scalars().all()
    if not candidate_ids:
        raise HTTPException(status_code=400, detail="В этой теме нет вопросов")

    import random as _r
    pool = list(candidate_ids)
    if shuffle_questions:
        _r.shuffle(pool)
    picked_ids = pool[:question_count]

    disc_name = (await session.execute(
        select(Discipline.name).where(Discipline.discipline_id == topic.discipline_id)
    )).scalar_one_or_none() or "Дисциплина"

    topic_metadata = TopicTestMetadata(
        discipline_title=disc_name,
        topic_title=topic.name,
        max_attempts=1,
        current_attempt=1,
        time_limit_minutes=time_limit_minutes,
        passing_score_percent=passing_score_percent,
        show_question_points=True,
        grading_method="best",
        shuffle_questions=shuffle_questions,
        grade_scale=grade_scale,
    )

    return await build_preview_session(
        session=session,
        q_ids=picked_ids,
        time_limit_minutes=time_limit_minutes,
        proctor_min_level=0,
        topic_metadata=topic_metadata,
    )


@router.get("/teacher/disciplines/{discipline_id}/preview", response_model=ResumeOut)
async def preview_discipline_test(
    discipline_id: int,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    from app.db.models import AttemptsPolicy
    discipline = (await session.execute(
        select(Discipline).where(
            Discipline.discipline_id == discipline_id,
            Discipline.archived_at.is_(None),
        )
    )).scalar_one_or_none()
    if discipline is None:
        raise HTTPException(status_code=404, detail="discipline not found")

    td = (await session.execute(
        select(TeacherDiscipline).where(
            TeacherDiscipline.discipline_id == discipline_id,
            TeacherDiscipline.teacher_id == user.id,
        )
    )).scalar_one_or_none()
    if td is None:
        raise HTTPException(status_code=403, detail="not your discipline")

    time_limit_minutes = td.time_limit_minutes if td else 30
    question_count = td.question_count if td else 10

    policy = (await session.execute(
        select(AttemptsPolicy).where(
            AttemptsPolicy.teacher_id == user.id,
            AttemptsPolicy.discipline_id == discipline_id,
        )
    )).scalar_one_or_none()
    proctor_min_level = policy.proctor_min_level if policy else 0

    candidate_stmt = (
        select(Question.question_id)
        .where(Question.discipline_id == discipline_id, Question.archived_at.is_(None))
        .order_by(Question.question_id)
    )
    candidate_ids = (await session.execute(candidate_stmt)).scalars().all()
    if not candidate_ids:
        raise HTTPException(status_code=400, detail="В этой дисциплине нет вопросов")

    import random as _r
    pool = list(candidate_ids)
    _r.shuffle(pool)
    picked_ids = pool[:question_count]

    topic_metadata = TopicTestMetadata(
        discipline_title=discipline.name,
        topic_title="Общий тест по дисциплине",
        max_attempts=1,
        current_attempt=1,
        time_limit_minutes=time_limit_minutes,
        passing_score_percent=None,
        show_question_points=True,
        grading_method="best",
        shuffle_questions=True,
        grade_scale="5_point",
    )

    return await build_preview_session(
        session=session,
        q_ids=picked_ids,
        time_limit_minutes=time_limit_minutes,
        proctor_min_level=proctor_min_level,
        topic_metadata=topic_metadata,
    )


@router.post("/teacher/test/preview-grade", response_model=StudentSessionDetailOut)
async def preview_grade(
    payload: PreviewGradeIn,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    from datetime import timedelta
    from app.services.versioning import (
        question_snapshot,
        score_snapshot_answer,
        snapshot_correct_answer,
        snapshot_correct_answer_render,
        snapshot_student_answer_text,
        snapshot_student_answer_render,
    )
    from app.db.models import Discipline, DisciplineTopic, TeacherTopicTest, TeacherDiscipline, AttemptsPolicy
    from app.schemas.student import StudentSessionAnswerDetailOut

    topic_name = None
    discipline_name = "Дисциплина"
    discipline_id_val = None
    grade_scale = "5_point"
    passing_score_percent = None

    if payload.topic_id is not None:
        topic = (await session.execute(
            select(DisciplineTopic).where(DisciplineTopic.topic_id == payload.topic_id)
        )).scalar_one_or_none()
        if topic is None:
            raise HTTPException(status_code=404, detail="topic not found")
        topic_name = topic.name
        discipline_id_val = topic.discipline_id

        disc = (await session.execute(
            select(Discipline).where(Discipline.discipline_id == topic.discipline_id)
        )).scalar_one_or_none()
        if disc:
            discipline_name = disc.name

        test_settings = (await session.execute(
            select(TeacherTopicTest).where(
                TeacherTopicTest.topic_id == payload.topic_id,
                TeacherTopicTest.teacher_id == user.id,
            )
        )).scalar_one_or_none()
        if test_settings:
            grade_scale = test_settings.grade_scale
            passing_score_percent = test_settings.passing_score_percent
    elif payload.discipline_id is not None:
        discipline_id_val = payload.discipline_id
        disc = (await session.execute(
            select(Discipline).where(Discipline.discipline_id == payload.discipline_id)
        )).scalar_one_or_none()
        if disc is None:
            raise HTTPException(status_code=404, detail="discipline not found")
        discipline_name = disc.name

        td = (await session.execute(
            select(TeacherDiscipline).where(
                TeacherDiscipline.discipline_id == payload.discipline_id,
                TeacherDiscipline.teacher_id == user.id,
            )
        )).scalar_one_or_none()
        if td:
            policy = (await session.execute(
                select(AttemptsPolicy).where(
                    AttemptsPolicy.teacher_id == user.id,
                    AttemptsPolicy.discipline_id == payload.discipline_id,
                )
            )).scalar_one_or_none()
            if policy:
                passing_score_percent = None
    else:
        raise HTTPException(status_code=400, detail="Either topic_id or discipline_id must be provided")

    submitted_by_q = {ans.question_id: ans for ans in payload.answers}
    detail_answers = []
    total_score = 0.0

    for qid in payload.question_ids:
        snapshot = await question_snapshot(session, qid)
        ans = submitted_by_q.get(qid)

        selected_option_id = ans.chosen_option_id if ans else None
        short_answer_raw = None
        match_pairs = None

        qtype = snapshot.get("qtype") or "single"
        if qtype == "single":
            selected_option_id = ans.chosen_option_id if ans else None
        elif qtype == "multi":
            if ans and ans.match_answer:
                match_pairs = ans.match_answer
            elif ans and ans.chosen_option_id is not None:
                match_pairs = [ans.chosen_option_id]
        elif qtype in ("short", "text", "numeric"):
            if ans:
                short_answer_raw = ans.short_answer or ans.text_answer or (str(ans.numeric_answer) if ans.numeric_answer is not None else None)
        elif qtype == "bool":
            if ans and ans.bool_answer is not None:
                short_answer_raw = "true" if ans.bool_answer else "false"
        elif qtype == "order":
            if ans and ans.order_answer:
                short_answer_raw = ",".join(str(x) for x in ans.order_answer)
        elif qtype == "cloze":
            if ans and ans.cloze_answer:
                import json
                short_answer_raw = json.dumps(ans.cloze_answer)

        ok, earned = score_snapshot_answer(
            snapshot=snapshot,
            selected_option_id=selected_option_id,
            short_answer_raw=short_answer_raw,
            match_pairs=match_pairs,
        )
        total_score += earned

        from app.services.question_images import question_image_url
        detail_answers.append(StudentSessionAnswerDetailOut(
            question_id=qid,
            question_text=str(snapshot.get("text") or ""),
            question_type=qtype,
            question_image_url=question_image_url(snapshot["image_id"]) if snapshot.get("image_id") else None,
            student_answer=snapshot_student_answer_text(
                snapshot=snapshot,
                selected_option_id=selected_option_id,
                short_answer_raw=short_answer_raw,
                match_pairs=match_pairs,
            ),
            student_answer_render=snapshot_student_answer_render(
                snapshot=snapshot,
                selected_option_id=selected_option_id,
                short_answer_raw=short_answer_raw,
                match_pairs=match_pairs,
            ),
            correct_answer=snapshot_correct_answer(snapshot),
            correct_answer_render=snapshot_correct_answer_render(snapshot),
            is_correct=ok,
            explanation=snapshot.get("explanation"),
            comment=None,
            score=int(round(earned)),
            max_score=1,
        ))

    final_score = int(round(total_score))
    max_score = len(payload.question_ids)
    percent = (final_score / max_score * 100.0) if max_score > 0 else 0.0
    is_passed = (percent >= passing_score_percent) if (passing_score_percent is not None and passing_score_percent > 0) else True

    started_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    completed_at = datetime.now(timezone.utc)

    return StudentSessionDetailOut(
        session_id=-1,
        discipline_id=discipline_id_val or -1,
        discipline_name=discipline_name,
        topic_id=payload.topic_id,
        topic_name=topic_name,
        started_at=started_at,
        completed_at=completed_at,
        score=final_score,
        max_score=max_score,
        percent=percent,
        attempt_number=1,
        status="completed",
        show_correctness=True,
        passing_score_percent=passing_score_percent,
        is_passed=is_passed,
        duration_seconds=300,
        answers=detail_answers,
        grade_scale=grade_scale,
    )

