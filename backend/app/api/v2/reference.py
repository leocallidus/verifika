"""Reference CRUD endpoints for the teacher: disciplines, groups, students.

Naming follows existing convention — route prefix `/api/v2/teacher/reference/*`
so that existing analytics/policies/etc routes on `/api/v2/teacher/*` keep
working unchanged.
"""
from __future__ import annotations

import secrets
import string
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import EmailStr
from sqlalchemy import delete, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, require_teacher, get_session
from app.core.rate_limit import bulk_archive_limiter
from app.core.security import hash_password
from app.db.models import (
    Discipline,
    Group,
    Question,
    Student,
    TeacherDiscipline,
    TestSession,
    UserCredential,
)
from app.schemas.reference import (
    DisciplineIn,
    DisciplineOut,
    DisciplinePatch,
    EnrollBulkIn,
    EnrollBulkOut,
    GroupIn,
    GroupOut,
    GroupPatch,
    StudentIn,
    StudentOut,
    StudentPatch,
    StudentResetPasswordOut,
    StudentWithPassword,
    TransferAllIn,
    TransferAllOut,
)
from app.services.versioning import ensure_discipline_policy_version

router = APIRouter(prefix="/teacher/reference", tags=["reference"])


# ========================= helpers =========================

def _is_unique_violation(exc: IntegrityError) -> bool:
    orig = exc.orig
    candidates = (
        orig,
        getattr(orig, "__cause__", None),
        getattr(orig, "__context__", None),
    )
    return any(
        (getattr(candidate, "sqlstate", None) or getattr(candidate, "pgcode", None)) == "23505"
        for candidate in candidates
    )


def _gen_password(n: int = 12) -> str:
    """Generate a random password incl. uppercase + digit + symbol."""
    alphabet = string.ascii_letters + string.digits + "!@#%^&*"
    # make sure required char classes are present
    base = "".join(secrets.choice(string.ascii_lowercase) for _ in range(n - 3))
    return (
        secrets.choice(string.ascii_uppercase)
        + secrets.choice(string.digits)
        + secrets.choice("!@#%^&*")
        + base
    )


async def _serialize_discipline(
    d: Discipline,
    s: AsyncSession,
    teacher_id: int | None = None,
) -> DisciplineOut:
    config_stmt = select(
        TeacherDiscipline.question_count,
        TeacherDiscipline.time_limit_minutes,
    ).where(TeacherDiscipline.discipline_id == d.discipline_id)
    if teacher_id is not None:
        config_stmt = config_stmt.where(TeacherDiscipline.teacher_id == teacher_id)
    config = (await s.execute(config_stmt.limit(1))).first()
    q_count = config.question_count if config else 0
    t_limit = config.time_limit_minutes if config else 0
    student_count = (await s.execute(
        text("SELECT COUNT(*) FROM students WHERE group_id IN "
             "(SELECT discipline_id FROM questions WHERE discipline_id = :d GROUP BY discipline_id)"),
        {"d": d.discipline_id}
    )).scalar() if False else 0  # keep simple
    # student count: disciplines have no direct students in our schema,
    # so report question_count of test-sessions instead as a useful proxy
    sess_count = (await s.execute(
        text("SELECT COUNT(*) FROM test_sessions WHERE discipline_id = :d"),
        {"d": d.discipline_id}
    )).scalar() or 0
    return DisciplineOut(
        discipline_id=d.discipline_id,
        name=d.name,
        description=d.description,
        credits=d.credits,
        total_hours=d.total_hours,
        question_count=int(q_count),
        time_limit_minutes=int(t_limit),
        archived=d.archived_at is not None,
        student_count=int(sess_count),  # ≈ "сколько попыток студентов"
        teacher_names=[],
        created_at=d.created_at if hasattr(d, "created_at") else None,
    )


# ========================= Disciplines =========================

@router.get("/disciplines", response_model=List[DisciplineOut])
async def list_disciplines(
    q: Optional[str] = Query(default=None),
    archived: bool = Query(default=False),
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    where = []
    if archived:
        where.append(Discipline.archived_at.is_not(None))
    else:
        where.append(Discipline.archived_at.is_(None))
    if q:
        like = f"%{q.lower()}%"
        where.append(text("(LOWER(name) LIKE :q OR LOWER(COALESCE(description,'')) LIKE :q)").bindparams(q=like))
    stmt = select(Discipline)
    if where:
        stmt = stmt.where(*where)
    stmt = stmt.order_by(Discipline.name.asc())
    rows = (await s.execute(stmt)).scalars().all()
    return [await _serialize_discipline(d, s, user.id) for d in rows]


@router.post("/disciplines", response_model=DisciplineOut, status_code=201)
async def create_discipline(
    payload: DisciplineIn,
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    d = Discipline(
        name=payload.name,
        description=payload.description,
        credits=payload.credits,
        total_hours=payload.total_hours,
        created_by=user.id,
    )
    try:
        s.add(d)
        await s.flush()
        s.add(TeacherDiscipline(
            teacher_id=user.id,
            discipline_id=d.discipline_id,
            time_limit_minutes=payload.time_limit_minutes,
            question_count=payload.question_count,
        ))
        await s.commit()
    except IntegrityError as exc:
        await s.rollback()
        if _is_unique_violation(exc):
            raise HTTPException(status_code=409, detail="discipline already exists")
        raise HTTPException(status_code=400, detail="invalid discipline data")
    await s.refresh(d)
    return await _serialize_discipline(d, s, user.id)


@router.get("/disciplines/{discipline_id}", response_model=DisciplineOut)
async def get_discipline(
    discipline_id: int,
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    d = (await s.execute(select(Discipline).where(Discipline.discipline_id == discipline_id))).scalar_one_or_none()
    if d is None:
        raise HTTPException(status_code=404, detail="discipline not found")
    return await _serialize_discipline(d, s, user.id)


@router.patch("/disciplines/{discipline_id}", response_model=DisciplineOut)
async def patch_discipline(
    discipline_id: int,
    payload: DisciplinePatch,
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    d = (await s.execute(select(Discipline).where(Discipline.discipline_id == discipline_id))).scalar_one_or_none()
    if d is None or d.archived_at is not None:
        raise HTTPException(status_code=404, detail="discipline not found")
    values = payload.model_dump(exclude_unset=True)
    if not values:
        return await _serialize_discipline(d, s, user.id)
    discipline_values = {
        key: values[key]
        for key in ("name", "description", "credits", "total_hours")
        if key in values
    }
    config_values = {
        key: values[key]
        for key in ("question_count", "time_limit_minutes")
        if key in values
    }
    try:
        if discipline_values:
            await s.execute(
                update(Discipline)
                .where(Discipline.discipline_id == discipline_id)
                .values(**discipline_values)
            )
        if config_values:
            existing_config = (await s.execute(
                select(TeacherDiscipline).where(
                    TeacherDiscipline.teacher_id == user.id,
                    TeacherDiscipline.discipline_id == discipline_id,
                )
            )).scalar_one_or_none()
            if existing_config is None:
                s.add(TeacherDiscipline(
                    teacher_id=user.id,
                    discipline_id=discipline_id,
                    question_count=config_values.get("question_count", 10),
                    time_limit_minutes=config_values.get("time_limit_minutes", 20),
                ))
                await s.flush()
            else:
                if "question_count" in config_values:
                    existing_config.question_count = config_values["question_count"]
                if "time_limit_minutes" in config_values:
                    existing_config.time_limit_minutes = config_values["time_limit_minutes"]
            await ensure_discipline_policy_version(
                s,
                teacher_id=user.id,
                discipline_id=discipline_id,
                created_by_teacher_id=user.id,
            )
        await s.commit()
    except IntegrityError as exc:
        await s.rollback()
        if _is_unique_violation(exc):
            raise HTTPException(status_code=409, detail="name conflict")
        raise HTTPException(status_code=400, detail="invalid discipline data")
    await s.refresh(d)
    return await _serialize_discipline(d, s, user.id)


@router.delete("/disciplines/{discipline_id}", status_code=204)
async def archive_discipline(
    discipline_id: int,
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    d = (await s.execute(select(Discipline).where(Discipline.discipline_id == discipline_id))).scalar_one_or_none()
    if d is None:
        raise HTTPException(status_code=404, detail="discipline not found")
    if d.archived_at is not None:
        return
    # block archive if active student attempts exist
    has_active = (await s.execute(text(
        "SELECT COUNT(*) FROM test_sessions WHERE discipline_id = :d AND completed_at IS NULL"
    ), {"d": discipline_id})).scalar()
    if has_active:
        raise HTTPException(
            status_code=409,
            detail="Невозможно архивировать: есть незавершённые попытки. Дождитесь их завершения.",
        )
    await s.execute(
        update(Discipline)
        .where(Discipline.discipline_id == discipline_id)
        .values(archived_at=datetime.now(timezone.utc))
    )
    await s.commit()


@router.post("/disciplines/{discipline_id}/restore", response_model=DisciplineOut)
async def restore_discipline(
    discipline_id: int,
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    d = (await s.execute(select(Discipline).where(Discipline.discipline_id == discipline_id))).scalar_one_or_none()
    if d is None:
        raise HTTPException(status_code=404, detail="discipline not found")
    await s.execute(
        update(Discipline).where(Discipline.discipline_id == discipline_id).values(archived_at=None)
    )
    await s.commit()
    await s.refresh(d)
    return await _serialize_discipline(d, s, user.id)


# ========================= Groups =========================

async def _serialize_group(g: Group, s: AsyncSession) -> GroupOut:
    student_count = (await s.execute(
        text("SELECT COUNT(*) FROM students WHERE group_id = :g AND archived_at IS NULL"),
        {"g": g.group_id}
    )).scalar() or 0
    sess_stats = (await s.execute(text(
        "SELECT COUNT(*) AS c, AVG(score) AS a FROM test_sessions ts "
        "JOIN students st ON ts.student_id = st.student_id "
        "WHERE st.group_id = :g"
    ), {"g": g.group_id})).first()
    attempts_total = int(sess_stats.c or 0) if sess_stats else 0
    avg = float(sess_stats.a) if sess_stats and sess_stats.a is not None else None
    return GroupOut(
        group_id=g.group_id,
        name=g.name,
        admission_year=g.admission_year,
        student_count=int(student_count),
        archived=g.archived_at is not None if hasattr(g, "archived_at") else False,
        attempts_total=attempts_total,
        average_score=round(avg, 1) if avg is not None else None,
        created_at=g.created_at if hasattr(g, "created_at") else None,
    )


@router.get("/groups", response_model=List[GroupOut])
async def list_groups(
    q: Optional[str] = Query(default=None),
    admission_year: Optional[int] = Query(default=None),
    archived: bool = Query(default=False),
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    stmt = select(Group)
    if archived:
        stmt = stmt.where(text("archived_at IS NOT NULL"))
    else:
        stmt = stmt.where(text("archived_at IS NULL"))
    if admission_year is not None:
        stmt = stmt.where(Group.admission_year == admission_year)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(text("LOWER(name) LIKE :q").bindparams(q=like))
    stmt = stmt.order_by(Group.name.asc())
    rows = (await s.execute(stmt)).scalars().all()
    return [await _serialize_group(g, s) for g in rows]


@router.post("/groups", response_model=GroupOut, status_code=201)
async def create_group(
    payload: GroupIn,
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    g = Group(name=payload.name, admission_year=payload.admission_year)
    s.add(g)
    try:
        await s.commit()
    except IntegrityError:
        await s.rollback()
        raise HTTPException(status_code=409, detail="group already exists")
    await s.refresh(g)
    return await _serialize_group(g, s)


@router.get("/groups/{group_id}", response_model=GroupOut)
async def get_group(
    group_id: int,
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    g = (await s.execute(select(Group).where(Group.group_id == group_id))).scalar_one_or_none()
    if g is None:
        raise HTTPException(status_code=404, detail="group not found")
    return await _serialize_group(g, s)


@router.patch("/groups/{group_id}", response_model=GroupOut)
async def patch_group(
    group_id: int,
    payload: GroupPatch,
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    g = (await s.execute(select(Group).where(Group.group_id == group_id))).scalar_one_or_none()
    if g is None:
        raise HTTPException(status_code=404, detail="group not found")
    if hasattr(g, "archived_at") and g.archived_at is not None:
        raise HTTPException(status_code=409, detail="группа в архиве")
    values = payload.model_dump(exclude_unset=True)
    if values:
        await s.execute(
            update(Group).where(Group.group_id == group_id).values(**values)
        )
        await s.commit()
    await s.refresh(g)
    return await _serialize_group(g, s)


@router.delete("/groups/{group_id}", status_code=204)
async def archive_group(
    group_id: int,
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    g = (await s.execute(select(Group).where(Group.group_id == group_id))).scalar_one_or_none()
    if g is None:
        raise HTTPException(status_code=404, detail="group not found")
    students_count = (await s.execute(text(
        "SELECT COUNT(*) FROM students WHERE group_id = :g AND archived_at IS NULL"
    ), {"g": group_id})).scalar() or 0
    if students_count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Невозможно архивировать: в группе {students_count} студентов. Сначала переведите их в другую группу.",
        )
    await s.execute(
        update(Group).where(Group.group_id == group_id).values(archived_at=datetime.now(timezone.utc))
    )
    await s.commit()


@router.post("/groups/{group_id}/restore", response_model=GroupOut)
async def restore_group(
    group_id: int,
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    g = (await s.execute(select(Group).where(Group.group_id == group_id))).scalar_one_or_none()
    if g is None:
        raise HTTPException(status_code=404, detail="group not found")
    await s.execute(
        update(Group).where(Group.group_id == group_id).values(archived_at=None)
    )
    await s.commit()
    await s.refresh(g)
    return await _serialize_group(g, s)


@router.post("/groups/{group_id}/enroll-bulk", response_model=EnrollBulkOut)
async def enroll_bulk(
    group_id: int,
    payload: EnrollBulkIn,
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    g = (await s.execute(select(Group).where(Group.group_id == group_id))).scalar_one_or_none()
    if g is None:
        raise HTTPException(status_code=404, detail="group not found")
    # ensure all students exist & not archived
    rows = (await s.execute(
        select(Student.student_id).where(
            Student.student_id.in_(payload.student_ids),
            Student.archived_at.is_(None),
        )
    )).scalars().all()
    valid = list(rows)
    if not valid:
        raise HTTPException(status_code=400, detail="no valid students")
    await s.execute(
        update(Student).where(Student.student_id.in_(valid)).values(group_id=group_id)
    )
    await s.commit()
    return EnrollBulkOut(enrolled=len(valid))


@router.get("/groups/{group_id}/available-students", response_model=List[StudentOut])
async def available_students_to_enroll(
    group_id: int,
    q: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    """Студенты, не состоящие в этой группе (или вообще без группы). Возвращает активных."""
    stmt = select(Student).where(
        Student.archived_at.is_(None),
        (Student.group_id != group_id) | Student.group_id.is_(None),
    )
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(text(
            "(LOWER(last_name) LIKE :q OR LOWER(first_name) LIKE :q OR LOWER(email) LIKE :q OR login LIKE :q)"
        ).bindparams(q=like))
    stmt = stmt.order_by(Student.last_name, Student.first_name).limit(limit)
    rows = (await s.execute(stmt)).scalars().all()
    return [_serialize_student_sync(s, st) for st in rows]


@router.post("/groups/{group_id}/unassign-bulk", response_model=EnrollBulkOut)
async def unassign_bulk(
    group_id: int,
    payload: EnrollBulkIn,
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    """Снять студентов с этой группы (вывести их в «без группы»)."""
    g = (await s.execute(select(Group).where(Group.group_id == group_id))).scalar_one_or_none()
    if g is None:
        raise HTTPException(status_code=404, detail="group not found")
    rows = (await s.execute(
        select(Student.student_id).where(
            Student.student_id.in_(payload.student_ids),
            Student.archived_at.is_(None),
            Student.group_id == group_id,
        )
    )).scalars().all()
    valid = list(rows)
    if not valid:
        raise HTTPException(status_code=400, detail="no valid students in this group")
    await s.execute(
        update(Student).where(Student.student_id.in_(valid)).values(group_id=None)
    )
    await s.commit()
    return EnrollBulkOut(enrolled=len(valid))


@router.post("/groups/{group_id}/transfer-all", response_model=TransferAllOut)
async def transfer_all(
    group_id: int,
    payload: TransferAllIn,
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    if group_id == payload.target_group_id:
        raise HTTPException(status_code=400, detail="source and target groups must differ")
    target = (await s.execute(select(Group).where(Group.group_id == payload.target_group_id))).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="target group not found")
    result = await s.execute(
        update(Student)
        .where(Student.group_id == group_id, Student.archived_at.is_(None))
        .values(group_id=payload.target_group_id)
    )
    await s.commit()
    return TransferAllOut(transferred=int(result.rowcount or 0))


# ========================= Students =========================

def _serialize_student_sync(s: AsyncSession, st: Student) -> StudentOut:
    """Quick row → Pydantic without extra aggregate queries (faster for previews)."""
    if st.group_id is None:
        return StudentOut(
            student_id=st.student_id,
            last_name=st.last_name,
            first_name=st.first_name,
            middle_name=st.middle_name,
            full_name=f"{st.last_name} {st.first_name} {st.middle_name or ''}".strip(),
            email=st.email,
            login=st.login,
            group_id=0,
            group_name=None,
            enrollment_date=st.enrollment_date,
            sessions_count=0,
            average_score=None,
            archived=st.archived_at is not None,
        )
    grp_name = s.scalar(
        select(Group.name).where(Group.group_id == st.group_id)
    ) if False else None
    return StudentOut(
        student_id=st.student_id,
        last_name=st.last_name,
        first_name=st.first_name,
        middle_name=st.middle_name,
        full_name=f"{st.last_name} {st.first_name} {st.middle_name or ''}".strip(),
        email=st.email,
        login=st.login,
        group_id=st.group_id,
        group_name=None,
        enrollment_date=st.enrollment_date,
        sessions_count=0,
        average_score=None,
        archived=st.archived_at is not None,
    )

async def _serialize_student(st: Student, s: AsyncSession) -> StudentOut:
    sess_stats = (await s.execute(text(
        "SELECT COUNT(*) AS c, AVG(score) AS a FROM test_sessions WHERE student_id = :sid"
    ), {"sid": st.student_id})).first()
    c = int(sess_stats.c or 0) if sess_stats else 0
    avg = float(sess_stats.a) if sess_stats and sess_stats.a is not None else None
    grp = (await s.execute(select(Group.name).where(Group.group_id == st.group_id))).scalar_one_or_none()
    return StudentOut(
        student_id=st.student_id,
        last_name=st.last_name,
        first_name=st.first_name,
        middle_name=st.middle_name,
        full_name=f"{st.last_name} {st.first_name} {st.middle_name or ''}".strip(),
        email=st.email,
        login=st.login,
        group_id=st.group_id if st.group_id is not None else 0,
        group_name=grp,
        enrollment_date=st.enrollment_date,
        sessions_count=c,
        average_score=round(avg, 1) if avg is not None else None,
        archived=st.archived_at is not None,
    )


async def _create_student_with_credentials(
    s: AsyncSession, payload: StudentIn,
    autogenerate_password: bool = False,
) -> tuple[Student, str]:
    email = payload.email.lower()
    login = (payload.login or email.split("@")[0]).strip().lower()
    password = payload.initial_password or _gen_password(12)

    # Validate unique constraints upfront
    if (await s.execute(select(Student.email).where(Student.email == email))).scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"email {email} уже используется")
    if (await s.execute(select(Student.login).where(Student.login == login))).scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"login {login} уже используется")

    if (await s.execute(select(Group.group_id).where(Group.group_id == payload.group_id))).scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="group not found")

    st = Student(
        last_name=payload.last_name,
        first_name=payload.first_name,
        middle_name=payload.middle_name,
        email=email,
        login=login,
        group_id=payload.group_id,
    )
    s.add(st)
    try:
        await s.flush()
    except IntegrityError:
        await s.rollback()
        raise HTTPException(status_code=409, detail="уникальность нарушена")
    cred = UserCredential(
        role="student",
        user_id=st.student_id,
        password_hash=hash_password(password),
    )
    s.add(cred)
    await s.commit()
    await s.refresh(st)
    return st, password


@router.get("/students", response_model=List[StudentOut])
async def list_students(
    q: Optional[str] = Query(default=None),
    group_id: Optional[int] = Query(default=None),
    archived: bool = Query(default=False),
    sort: Optional[str] = Query(default=None, description="-score | -attempts | -enrolled | name"),
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    stmt = select(Student)
    if archived:
        stmt = stmt.where(Student.archived_at.is_not(None))
    else:
        stmt = stmt.where(Student.archived_at.is_(None))
    if group_id is not None:
        stmt = stmt.where(Student.group_id == group_id)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(text(
            "(LOWER(last_name) LIKE :q OR LOWER(first_name) LIKE :q OR LOWER(middle_name) LIKE :q OR LOWER(email) LIKE :q OR login LIKE :q)"
        ).bindparams(q=like))

    if sort == "-score":
        stmt = stmt.order_by(text("(SELECT AVG(score) FROM test_sessions WHERE student_id = students.student_id) DESC NULLS LAST"))
    elif sort == "-attempts":
        stmt = stmt.order_by(text("(SELECT COUNT(*) FROM test_sessions WHERE student_id = students.student_id) DESC"))
    elif sort == "-enrolled":
        stmt = stmt.order_by(Student.enrollment_date.desc())
    elif sort == "name":
        stmt = stmt.order_by(Student.last_name.asc(), Student.first_name.asc())
    else:
        stmt = stmt.order_by(Student.last_name.asc(), Student.first_name.asc())

    limit_cap = 500
    rows = (await s.execute(stmt.limit(limit_cap))).scalars().all()
    return [await _serialize_student(st, s) for st in rows]


@router.post("/students", response_model=StudentWithPassword, status_code=201)
async def create_student(
    payload: StudentIn,
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    st, password = await _create_student_with_credentials(s, payload)
    out = (await _serialize_student(st, s)).model_dump()
    out["one_time_password"] = password
    return StudentWithPassword(**out)


@router.get("/students/{student_id}", response_model=StudentOut)
async def get_student(
    student_id: int,
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    st = (await s.execute(select(Student).where(Student.student_id == student_id))).scalar_one_or_none()
    if st is None:
        raise HTTPException(status_code=404, detail="student not found")
    return await _serialize_student(st, s)


@router.patch("/students/{student_id}", response_model=StudentOut)
async def patch_student(
    student_id: int,
    payload: StudentPatch,
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    st = (await s.execute(select(Student).where(Student.student_id == student_id))).scalar_one_or_none()
    if st is None or st.archived_at is not None:
        raise HTTPException(status_code=404, detail="student not found")
    values = payload.model_dump(exclude_unset=True)
    if not values:
        return await _serialize_student(st, s)
    if "email" in values:
        values["email"] = values["email"].lower()
    if "group_id" in values:
        if (await s.execute(select(Group.group_id).where(Group.group_id == values["group_id"]))).scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="group not found")
    try:
        await s.execute(
            update(Student).where(Student.student_id == student_id).values(**values)
        )
        await s.commit()
    except IntegrityError:
        await s.rollback()
        raise HTTPException(status_code=409, detail="уникальность нарушена (email/login)")
    await s.refresh(st)
    return await _serialize_student(st, s)


@router.delete("/students/{student_id}", status_code=204)
async def archive_student(
    student_id: int,
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    st = (await s.execute(select(Student).where(Student.student_id == student_id))).scalar_one_or_none()
    if st is None:
        raise HTTPException(status_code=404, detail="student not found")
    if st.archived_at is not None:
        return
    has_active = (await s.execute(
        text("SELECT COUNT(*) FROM test_sessions WHERE student_id = :sid AND completed_at IS NULL"),
        {"sid": student_id}
    )).scalar()
    if has_active:
        raise HTTPException(
            status_code=409,
            detail="У студента есть незавершённая попытка. Дождитесь завершения.",
        )
    await s.execute(
        update(Student).where(Student.student_id == student_id).values(archived_at=datetime.now(timezone.utc))
    )
    await s.commit()


@router.post("/students/{student_id}/restore", response_model=StudentOut)
async def restore_student(
    student_id: int,
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    st = (await s.execute(select(Student).where(Student.student_id == student_id))).scalar_one_or_none()
    if st is None:
        raise HTTPException(status_code=404, detail="student not found")
    await s.execute(
        update(Student).where(Student.student_id == student_id).values(archived_at=None)
    )
    await s.commit()
    await s.refresh(st)
    return await _serialize_student(st, s)


@router.post("/students/{student_id}/reset-password", response_model=StudentResetPasswordOut)
async def reset_student_password(
    student_id: int,
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    st = (await s.execute(select(Student).where(Student.student_id == student_id))).scalar_one_or_none()
    if st is None or st.archived_at is not None:
        raise HTTPException(status_code=404, detail="student not found")
    new_password = _gen_password(12)
    new_hash = hash_password(new_password)
    res = await s.execute(
        update(UserCredential)
        .where(UserCredential.role == "student", UserCredential.user_id == student_id)
        .values(password_hash=new_hash)
    )
    if not res.rowcount:
        # create credential if missing
        s.add(UserCredential(role="student", user_id=student_id, password_hash=new_hash))
    await s.commit()
    return StudentResetPasswordOut(student_id=student_id, one_time_password=new_password)


@router.post("/students/bulk-archive", dependencies=[Depends(bulk_archive_limiter)])
async def bulk_archive(
    student_ids: List[int],
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    if not student_ids:
        raise HTTPException(status_code=400, detail="empty list")
    blocked = (await s.execute(text(
        "SELECT student_id FROM test_sessions WHERE student_id = ANY(:ids) AND completed_at IS NULL"
    ), {"ids": student_ids})).scalars().all()
    if blocked:
        raise HTTPException(
            status_code=409,
            detail=f"у {len(blocked)} студентов активные попытки; сначала завершите их",
        )
    result = await s.execute(
        update(Student)
        .where(Student.student_id.in_(student_ids), Student.archived_at.is_(None))
        .values(archived_at=datetime.now(timezone.utc))
    )
    await s.commit()
    return {"archived": int(result.rowcount or 0)}

from fastapi import UploadFile, File
import re
import io
import csv

email_regex = re.compile(r"^[^@]+@[^@]+\.[^@]+$")

def _validate_student_row(row: dict, row_number: int, group_names: set) -> dict:
    errors = []
    raw = {
        "last_name": str(row.get("last_name") or "").strip(),
        "first_name": str(row.get("first_name") or "").strip(),
        "middle_name": str(row.get("middle_name") or "").strip(),
        "email": str(row.get("email") or "").strip(),
        "login": str(row.get("login") or "").strip(),
        "group_name": str(row.get("group_name") or "").strip(),
        "initial_password": str(row.get("initial_password") or "").strip(),
    }
    
    if not raw["last_name"]:
        errors.append({"field": "last_name", "reason": "Фамилия обязательна"})
    if not raw["first_name"]:
        errors.append({"field": "first_name", "reason": "Имя обязательно"})
    if not raw["email"]:
        errors.append({"field": "email", "reason": "Email обязателен"})
    elif not email_regex.match(raw["email"]):
        errors.append({"field": "email", "reason": "Неверный формат email"})
    if not raw["group_name"]:
        errors.append({"field": "group_name", "reason": "Группа обязательна"})
    elif raw["group_name"] not in group_names:
        errors.append({"field": "group_name", "reason": f"Группа «{raw["group_name"]}» не найдена"})
        
    res = {
        "row_number": row_number,
        "raw": raw,
        "errors": errors
    }
    if not errors:
        res["parsed"] = {
            "last_name": raw["last_name"],
            "first_name": raw["first_name"],
            "middle_name": raw["middle_name"] or None,
            "email": raw["email"],
            "login": raw["login"] or None,
            "group_name": raw["group_name"],
            "initial_password": raw["initial_password"] or None,
        }
    return res


@router.post("/students/import-preview")
async def import_students_preview(
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_teacher),
    s: AsyncSession = Depends(get_session),
):
    raw_data = await file.read()
    filename = (file.filename or "").lower()
    
    rows = []
    if filename.endswith(".xlsx"):
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(raw_data), data_only=True)
        ws = wb.active
        iterator = ws.iter_rows(values_only=True)
        headers = [str(h).strip().lower() for h in next(iterator, []) if h is not None]
        for idx, values in enumerate(iterator, start=2):
            row = {headers[i]: values[i] if i < len(values) else "" for i in range(len(headers))}
            if any(str(v).strip() for v in row.values() if v is not None):
                rows.append((idx, row))
    else:
        text = raw_data.decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        for idx, row in enumerate(reader, start=2):
            clean_row = {str(k).strip().lower(): v for k, v in row.items() if k is not None}
            if any(str(v).strip() for v in clean_row.values() if v is not None):
                rows.append((idx, clean_row))
                
    groups = (await s.execute(select(Group.name))).scalars().all()
    group_names = {g.strip() for g in groups}
    
    parsed_rows = []
    valid_count = 0
    invalid_count = 0
    for row_num, row in rows:
        validated = _validate_student_row(row, row_num, group_names)
        if "parsed" in validated:
            valid_count += 1
        else:
            invalid_count += 1
        parsed_rows.append(validated)
        
    return {
        "total_rows": len(rows),
        "valid_rows": valid_count,
        "invalid_rows": invalid_count,
        "rows": parsed_rows
    }
