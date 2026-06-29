from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import and_, asc, desc, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin_helpers import (
    admin_audit,
    admin_broadcast_event,
    client_ip,
    count_active_admins,
)
from app.core.deps import CurrentUser, require_admin
from app.core.security import hash_password
from app.db.models import (
    Admin,
    AnswerOption,
    AnswerComment,
    AuditLog,
    Discipline,
    DisciplineTopic,
    Group,
    GroupDiscipline,
    Notification,
    PasswordResetToken,
    Question,
    Student,
    StudentDiscipline,
    StudentAnswer,
    Teacher,
    TeacherDiscipline,
    TestSession,
    TestSessionGradeOverride,
    UserCredential,
)
from app.db.session import get_session
from app.schemas.admin import (
    AdminActiveSessionListOut,
    AdminActiveSessionOut,
    AdminAssignGroupIn,
    AdminAssignStudentIn,
    AdminAssignTeacherIn,
    AdminDisciplineAssignmentOut,
    AdminAuditListOut,
    AdminAuditOut,
    AdminDisciplineCreate,
    AdminDisciplineOut,
    AdminDisciplinePatch,
    AdminEventListOut,
    AdminEventOut,
    AdminForceFinishIn,
    AdminGroupCreate,
    AdminGroupOut,
    AdminGroupPatch,
    AdminHealthOut,
    AdminOverrideScoreIn,
    AdminStatsSummaryOut,
    AdminUserCreate,
    AdminUserCreateAdmin,
    AdminUserListOut,
    AdminUserOut,
    AdminUserPatch,
    AdminUserResetPasswordOut,
    AdminUserRoleIn,
    AdminUserSessionsOut,
    AdminUserTransferGroupIn,
)
from app.services.notifications_helpers import store_and_broadcast, store_and_publish

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ---------- helpers --------------------------------------------------------

async def _enrich_user(
    session: AsyncSession, row: Any, role: str,
) -> AdminUserOut:
    if role == "student":
        return AdminUserOut(
            id=row.student_id, role="student",
            login=row.login, email=row.email,
            first_name=row.first_name, last_name=row.last_name,
            middle_name=getattr(row, "middle_name", None),
            full_name=f"{row.last_name} {row.first_name} {row.middle_name or ''}".strip(),
            group_id=row.group_id,
            archived=row.archived_at is not None,
            created_at=row.enrollment_date,
        )
    if role == "teacher":
        return AdminUserOut(
            id=row.teacher_id, role="teacher",
            login=row.login, email=row.email,
            first_name=row.first_name, last_name=row.last_name,
            middle_name=getattr(row, "middle_name", None),
            department=row.department,
            full_name=f"{row.last_name} {row.first_name} {row.middle_name or ''}".strip(),
            archived=row.archived_at is not None,
            created_at=row.created_at,
        )
    return AdminUserOut(
        id=row.admin_id, role="admin",
        login=row.login, email=row.email,
        first_name=row.first_name, last_name=row.last_name,
        middle_name=getattr(row, "middle_name", None),
        department=getattr(row, "department", None),
        full_name=f"{row.last_name} {row.first_name} {row.middle_name or ''}".strip(),
        archived=row.archived_at is not None,
        created_at=row.created_at,
    )


async def _get_user_row(session: AsyncSession, role: str, user_id: int):
    if role == "student":
        return (await session.execute(
            select(Student).where(Student.student_id == user_id)
        )).scalar_one_or_none()
    if role == "teacher":
        return (await session.execute(
            select(Teacher).where(Teacher.teacher_id == user_id)
        )).scalar_one_or_none()
    return (await session.execute(
        select(Admin).where(Admin.admin_id == user_id)
    )).scalar_one_or_none()


def _row_to_dict(row: Any) -> dict:
    return {
        k: (v.isoformat() if isinstance(v, datetime) else
            None if hasattr(v, "is_correct") else  # noqa: keep mocks
            v)
        for k, v in vars(row).items()
        if not k.startswith("_")
    }


def _str_diff(before: Optional[dict], after: Optional[dict]) -> tuple[Optional[dict], Optional[dict]]:
    """Return (before, after) -- already dict-shaped or None."""
    return before, after


# ============================================================================
#  USERS
# ============================================================================

@router.get("/users", response_model=AdminUserListOut)
async def list_users(
    role: Optional[str] = Query(default=None, pattern="^(student|teacher|admin)$"),
    q: Optional[str] = Query(default=None),
    archived: Optional[bool] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    items: List[AdminUserOut] = []
    total = 0
    offset = (page - 1) * page_size

    def _filter_q(model, fields):
        if not q:
            return []
        filters = [getattr(model, f).ilike(f"%{q}%") for f in fields]
        return [or_(*filters)]

    if role in (None, "student"):
        stmt = select(Student)
        if archived is not None:
            stmt = stmt.where(Student.archived_at.is_not(None) if archived
                              else Student.archived_at.is_(None))
        if q:
            stmt = stmt.where(or_(
                Student.login.ilike(f"%{q}%"),
                Student.email.ilike(f"%{q}%"),
                Student.first_name.ilike(f"%{q}%"),
                Student.last_name.ilike(f"%{q}%"),
                Student.middle_name.ilike(f"%{q}%"),
            ))
        if role == "student":
            total = int((await session.execute(
                select(func.count()).select_from(stmt.subquery())
            )).scalar_one() or 0)
            rows = (await session.execute(
                stmt.order_by(asc(Student.last_name)).offset(offset).limit(page_size)
            )).scalars().all()
            for r in rows:
                items.append(await _enrich_user(session, r, "student"))
        else:
            total_sub = select(func.count()).select_from(stmt.subquery())
            total += int((await session.execute(total_sub)).scalar_one() or 0)
            rows = (await session.execute(
                stmt.order_by(asc(Student.last_name)).offset(offset).limit(page_size)
            )).scalars().all()
            for r in rows:
                items.append(await _enrich_user(session, r, "student"))

    if role in (None, "teacher"):
        stmt = select(Teacher)
        if archived is not None:
            stmt = stmt.where(Teacher.archived_at.is_not(None) if archived
                              else Teacher.archived_at.is_(None))
        if q:
            stmt = stmt.where(or_(
                Teacher.login.ilike(f"%{q}%"),
                Teacher.email.ilike(f"%{q}%"),
                Teacher.first_name.ilike(f"%{q}%"),
                Teacher.last_name.ilike(f"%{q}%"),
                Teacher.middle_name.ilike(f"%{q}%"),
            ))
        if role == "teacher":
            total = int((await session.execute(
                select(func.count()).select_from(stmt.subquery())
            )).scalar_one() or 0)
            rows = (await session.execute(
                stmt.order_by(asc(Teacher.last_name)).offset(offset).limit(page_size)
            )).scalars().all()
            for r in rows:
                items.append(await _enrich_user(session, r, "teacher"))
        else:
            total += int((await session.execute(
                select(func.count()).select_from(stmt.subquery())
            )).scalar_one() or 0)
            rows = (await session.execute(
                stmt.order_by(asc(Teacher.last_name)).offset(offset).limit(page_size)
            )).scalars().all()
            for r in rows:
                items.append(await _enrich_user(session, r, "teacher"))

    if role in (None, "admin"):
        stmt = select(Admin)
        if archived is not None:
            stmt = stmt.where(Admin.archived_at.is_not(None) if archived
                              else Admin.archived_at.is_(None))
        if q:
            stmt = stmt.where(or_(
                Admin.login.ilike(f"%{q}%"),
                Admin.email.ilike(f"%{q}%"),
                Admin.first_name.ilike(f"%{q}%"),
                Admin.last_name.ilike(f"%{q}%"),
                Admin.middle_name.ilike(f"%{q}%"),
            ))
        if role == "admin":
            total = int((await session.execute(
                select(func.count()).select_from(stmt.subquery())
            )).scalar_one() or 0)
            rows = (await session.execute(
                stmt.order_by(asc(Admin.last_name)).offset(offset).limit(page_size)
            )).scalars().all()
            for r in rows:
                items.append(await _enrich_user(session, r, "admin"))
        else:
            total += int((await session.execute(
                select(func.count()).select_from(stmt.subquery())
            )).scalar_one() or 0)
            rows = (await session.execute(
                stmt.order_by(asc(Admin.last_name)).offset(offset).limit(page_size)
            )).scalars().all()
            for r in rows:
                items.append(await _enrich_user(session, r, "admin"))

    if total > page * page_size:
        pass  # caller can paginate
    return AdminUserListOut(
        items=items, total=total, page=page, page_size=page_size,
    )


@router.post("/users/students", response_model=AdminUserOut, status_code=201)
async def create_student(
    payload: AdminUserCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    if payload.role != "student":
        raise HTTPException(status_code=400, detail="use /api/admin/users/teachers for non-students")
    if payload.group_id is None:
        raise HTTPException(status_code=400, detail="group_id is required for students")
    g = (await session.execute(
        select(Group).where(Group.group_id == payload.group_id)
    )).scalar_one_or_none()
    if g is None:
        raise HTTPException(status_code=404, detail="group not found")
    student = Student(
        login=payload.login.lower(),
        email=payload.email,
        first_name=payload.first_name,
        last_name=payload.last_name,
        middle_name=payload.middle_name,
        group_id=payload.group_id,
    )
    session.add(student)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=f"student already exists: {exc.orig}") from exc
    credential = UserCredential(
        role="student", user_id=student.student_id,
        password_hash=hash_password(payload.password),
    )
    session.add(credential)
    await session.commit()
    await admin_audit(session, current, action="user_create",
                      target_type="student", target_id=student.student_id,
                      target_label=f"student:{student.student_id}",
                      ip_addr=client_ip(request),
                      after={"login": student.login, "email": student.email,
                             "group_id": student.group_id})
    if session.in_transaction():
        await session.commit()
    await admin_broadcast_event(
        session,
        event_type="user_created",
        payload={"role": "student", "id": student.student_id,
                 "name": f"{student.last_name} {student.first_name}".strip()},
        metadata={"actor_id": current.id},
    )
    await session.commit()
    return await _enrich_user(session, student, "student")


@router.post("/users/teachers", response_model=AdminUserOut, status_code=201)
async def create_teacher(
    payload: AdminUserCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    if payload.role != "teacher":
        raise HTTPException(status_code=400, detail="use /api/admin/users/students for non-teachers")
    teacher = Teacher(
        login=payload.login.lower(),
        email=payload.email,
        first_name=payload.first_name,
        last_name=payload.last_name,
        middle_name=payload.middle_name,
        department=payload.department or "",
    )
    session.add(teacher)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=f"teacher already exists: {exc.orig}") from exc
    credential = UserCredential(
        role="teacher", user_id=teacher.teacher_id,
        password_hash=hash_password(payload.password),
    )
    session.add(credential)
    await session.commit()
    await admin_audit(session, current, action="user_create",
                      target_type="teacher", target_id=teacher.teacher_id,
                      target_label=f"teacher:{teacher.teacher_id}",
                      ip_addr=client_ip(request),
                      after={"login": teacher.login, "email": teacher.email,
                             "department": teacher.department})
    if session.in_transaction():
        await session.commit()
    await admin_broadcast_event(
        session,
        event_type="user_created",
        payload={"role": "teacher", "id": teacher.teacher_id,
                 "name": f"{teacher.last_name} {teacher.first_name}".strip()},
        metadata={"actor_id": current.id},
    )
    await session.commit()
    return await _enrich_user(session, teacher, "teacher")


@router.post("/users/admins", response_model=AdminUserOut, status_code=201)
async def create_admin(
    payload: AdminUserCreateAdmin,
    request: Request,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    admin = Admin(
        login=payload.login.lower(),
        email=payload.email,
        first_name=payload.first_name,
        last_name=payload.last_name,
        middle_name=payload.middle_name,
        department=payload.department,
    )
    session.add(admin)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=f"admin already exists: {exc.orig}") from exc
    credential = UserCredential(
        role="admin", user_id=admin.admin_id,
        password_hash=hash_password(payload.password),
    )
    session.add(credential)
    await session.commit()
    await admin_audit(session, current, action="user_create",
                      target_type="admin", target_id=admin.admin_id,
                      target_label=f"admin:{admin.admin_id}",
                      ip_addr=client_ip(request),
                      after={"login": admin.login, "email": admin.email,
                             "department": admin.department})
    if session.in_transaction():
        await session.commit()
    await admin_broadcast_event(
        session,
        event_type="user_created",
        payload={"role": "admin", "id": admin.admin_id,
                 "name": f"{admin.last_name} {admin.first_name}".strip()},
        metadata={"actor_id": current.id},
    )
    await session.commit()
    return await _enrich_user(session, admin, "admin")


@router.get("/users/{user_id}", response_model=AdminUserOut)
async def get_user(
    user_id: int,
    role: str = Query(pattern="^(student|teacher|admin)$"),
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    row = await _get_user_row(session, role, user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="user not found")
    return await _enrich_user(session, row, role)


@router.patch("/users/{user_id}", response_model=AdminUserOut)
async def patch_user(
    user_id: int,
    payload: AdminUserPatch,
    role: str = Query(pattern="^(student|teacher|admin)$"),
    request: Request = None,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    row = await _get_user_row(session, role, user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="user not found")
    before = {k: v for k, v in vars(row).items() if not k.startswith("_")}
    if payload.first_name is not None:
        row.first_name = payload.first_name
    if payload.last_name is not None:
        row.last_name = payload.last_name
    if payload.middle_name is not None:
        row.middle_name = payload.middle_name
    if payload.email is not None:
        row.email = payload.email
    if payload.login is not None:
        row.login = payload.login.lower()
    if role == "student" and payload.group_id is not None:
        g = (await session.execute(
            select(Group).where(Group.group_id == payload.group_id)
        )).scalar_one_or_none()
        if g is None:
            raise HTTPException(status_code=404, detail="group not found")
        row.group_id = payload.group_id
    if role == "teacher" and payload.department is not None:
        row.department = payload.department
    if role == "admin":
        if payload.department is not None:
            row.department = payload.department
    after = {k: v for k, v in vars(row).items() if not k.startswith("_")}
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail="User with this login or email already exists",
        ) from exc

    await admin_audit(session, current, action="user_update",
                      target_type=role, target_id=user_id,
                      target_label=f"{role}:{user_id}",
                      ip_addr=client_ip(request) if request else None,
                      before=before, after=after)
    await session.commit()
    return await _enrich_user(session, row, role)


@router.post("/users/{user_id}/archive", response_model=AdminUserOut)
async def archive_user(
    user_id: int,
    request: Request,
    role: str = Query(pattern="^(student|teacher|admin)$"),
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    if role == "admin" and user_id == current.id:
        raise HTTPException(status_code=409, detail="cannot archive self")
    if role == "admin":
        raise HTTPException(
            status_code=409,
            detail="admin role cannot be archived via archive endpoint; use role change",
        )
    row = await _get_user_row(session, role, user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="user not found")
    if row.archived_at is not None:
        return await _enrich_user(session, row, role)  # idempotent
    before = {"archived_at": None}
    row.archived_at = datetime.now(timezone.utc)
    await session.commit()
    await admin_audit(session, current, action="user_archive",
                      target_type=role, target_id=user_id,
                      target_label=f"{role}:{user_id}",
                      ip_addr=client_ip(request),
                      before=before,
                      after={"archived_at": row.archived_at.isoformat()})
    await session.commit()
    await admin_broadcast_event(
        session,
        event_type="user_archived",
        metadata={"target_user_id": user_id, "target_role": role,
                  "actor_id": current.id},
    )
    await session.commit()
    return await _enrich_user(session, row, role)


@router.post("/users/{user_id}/restore", response_model=AdminUserOut)
async def restore_user(
    user_id: int,
    request: Request,
    role: str = Query(pattern="^(student|teacher|admin)$"),
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    row = await _get_user_row(session, role, user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="user not found")
    if row.archived_at is None:
        return await _enrich_user(session, row, role)  # idempotent
    row.archived_at = None
    await session.commit()
    await admin_audit(session, current, action="user_restore",
                      target_type=role, target_id=user_id,
                      target_label=f"{role}:{user_id}",
                      ip_addr=client_ip(request))
    await session.commit()
    await admin_broadcast_event(
        session,
        event_type="user_restored",
        metadata={"target_user_id": user_id, "target_role": role,
                  "actor_id": current.id},
    )
    await session.commit()
    return await _enrich_user(session, row, role)


@router.post("/users/{user_id}/role")
async def change_role(
    user_id: int,
    payload: AdminUserRoleIn,
    request: Request,
    role: str = Query(pattern="^(student|teacher|admin)$"),
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    if payload.role not in ("student", "teacher", "admin"):
        raise HTTPException(status_code=400, detail="invalid role")
    if role == payload.role:
        return {"ok": True, "user_id": user_id, "role": role, "noop": True}
    row = await _get_user_row(session, role, user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="user not found")
    if role == "admin" and user_id == current.id:
        # self-demotion: require confirm=login
        if payload.role == "student" or payload.role == "teacher":
            if payload.confirm != row.login:
                raise HTTPException(
                    status_code=409,
                    detail="self-demotion requires 'confirm' equal to your full login",
                )
            if not payload.reason:
                raise HTTPException(
                    status_code=409,
                    detail="self-demotion requires 'reason' field",
                )
        # promote admin -> admin is noop
    if role == "admin" and payload.role != "admin":
        # demoting an admin: must not leave the system with zero admins
        active = await count_active_admins(session, exclude_id=user_id)
        if active == 0:
            raise HTTPException(
                status_code=409,
                detail="cannot demote the last admin",
            )
    # role transition: move row between tables
    # 1) snapshot
    before = {
        "role": role, "id": user_id,
        "login": getattr(row, "login", None),
        "email": getattr(row, "email", None),
    }
    # 2) move row to new table
    new_login = row.login
    new_email = row.email
    new_first = row.first_name
    new_last = row.last_name
    new_middle = getattr(row, "middle_name", None)
    new_dept = getattr(row, "department", None) or ""
    # get password before deletion
    cred = (await session.execute(
        select(UserCredential).where(
            UserCredential.role == role,
            UserCredential.user_id == user_id,
        )
    )).scalar_one_or_none()
    pwd = cred.password_hash if cred else None
    # remove old row
    await session.delete(row)
    # remove old credential
    if cred is not None:
        await session.delete(cred)
    # create new row
    if payload.role == "student":
        new_row = Student(
            login=new_login, email=new_email,
            first_name=new_first, last_name=new_last,
            group_id=getattr(row, "group_id", None) or 0,
        )
        if not new_row.group_id:
            raise HTTPException(status_code=409, detail="students must belong to a group; please set it via /api/admin/users/{id} group_id first")
        session.add(new_row)
        await session.flush()
        if pwd:
            session.add(UserCredential(role="student", user_id=new_row.student_id, password_hash=pwd))
        new_id = new_row.student_id
    elif payload.role == "teacher":
        new_row = Teacher(
            login=new_login, email=new_email,
            first_name=new_first, last_name=new_last,
            department=new_dept or "",
        )
        session.add(new_row)
        await session.flush()
        if pwd:
            session.add(UserCredential(role="teacher", user_id=new_row.teacher_id, password_hash=pwd))
        new_id = new_row.teacher_id
    else:
        new_row = Admin(
            login=new_login, email=new_email,
            first_name=new_first, last_name=new_last,
            middle_name=new_middle,
            department=new_dept,
        )
        session.add(new_row)
        await session.flush()
        if pwd:
            session.add(UserCredential(role="admin", user_id=new_row.admin_id, password_hash=pwd))
        new_id = new_row.admin_id
    await session.commit()
    await admin_audit(session, current, action="role_changed",
                      target_type="user", target_id=new_id,
                      target_label=f"{payload.role}:{new_id}",
                      ip_addr=client_ip(request),
                      reason=payload.reason,
                      before={"role": role, "id": user_id},
                      after={"role": payload.role, "id": new_id},
                      metadata={"from_role": role, "to_role": payload.role,
                                "self_demotion": (role == "admin" and user_id == current.id)})
    await session.commit()
    await admin_broadcast_event(
        session,
        event_type="role_changed",
        metadata={"target_user_id": new_id, "from_role": role,
                  "to_role": payload.role, "actor_id": current.id},
        severity=2 if (role == "admin" and user_id == current.id) else 1,
    )
    await session.commit()
    return {"ok": True, "user_id": new_id, "from_role": role, "to_role": payload.role}


@router.post("/users/{user_id}/reset-password", response_model=AdminUserResetPasswordOut)
async def reset_password(
    user_id: int,
    request: Request,
    role: str = Query(pattern="^(student|teacher|admin)$"),
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    row = await _get_user_row(session, role, user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="user not found")
    new_pwd = secrets.token_urlsafe(12)
    cred = (await session.execute(
        select(UserCredential).where(
            UserCredential.role == role,
            UserCredential.user_id == user_id,
        )
    )).scalar_one_or_none()
    if cred is None:
        cred = UserCredential(role=role, user_id=user_id,
                              password_hash=hash_password(new_pwd))
        session.add(cred)
    else:
        cred.password_hash = hash_password(new_pwd)
    await session.commit()
    await admin_audit(session, current, action="password_reset",
                      target_type=role, target_id=user_id,
                      target_label=f"{role}:{user_id}",
                      ip_addr=client_ip(request))
    await session.commit()
    await admin_broadcast_event(
        session,
        event_type="password_reset",
        metadata={"target_user_id": user_id, "target_role": role,
                  "actor_id": current.id},
    )
    # notify the user themselves
    await store_and_publish(session, role, user_id,
                            event_type="password_reset",
                            payload={"actor_id": current.id},
                            severity=1)
    await session.commit()
    return AdminUserResetPasswordOut(user_id=user_id, role=role, new_password=new_pwd)


@router.post("/users/{user_id}/transfer-group", response_model=AdminUserOut)
async def transfer_group(
    user_id: int,
    payload: AdminUserTransferGroupIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    s = (await session.execute(
        select(Student).where(Student.student_id == user_id)
    )).scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=404, detail="student not found")
    g = (await session.execute(
        select(Group).where(Group.group_id == payload.target_group_id)
    )).scalar_one_or_none()
    if g is None:
        raise HTTPException(status_code=404, detail="group not found")
    before_group = s.group_id
    s.group_id = payload.target_group_id
    await session.commit()
    await admin_audit(session, current, action="group_transferred",
                      target_type="student", target_id=user_id,
                      ip_addr=client_ip(request),
                      before={"group_id": before_group},
                      after={"group_id": payload.target_group_id})
    await session.commit()
    await admin_broadcast_event(
        session,
        event_type="group_transferred",
        metadata={"student_id": user_id,
                  "from_group_id": before_group,
                  "to_group_id": payload.target_group_id,
                  "actor_id": current.id},
    )
    await session.commit()
    return await _enrich_user(session, s, "student")


@router.get("/users/{user_id}/sessions", response_model=AdminUserSessionsOut)
async def list_user_sessions(
    user_id: int,
    role: str = Query(pattern="^(student|teacher|admin)$"),
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    if role != "student":
        raise HTTPException(status_code=400, detail="only student sessions are tracked here")
    rows = (await session.execute(
        select(TestSession, Discipline)
        .join(Discipline, Discipline.discipline_id == TestSession.discipline_id)
        .where(TestSession.student_id == user_id)
        .order_by(desc(TestSession.started_at))
        .limit(limit)
    )).all()
    items = []
    for ts, d in rows:
        items.append({
            "session_id": ts.session_id,
            "discipline_id": ts.discipline_id,
            "discipline_name": d.name,
            "topic_id": ts.topic_id,
            "started_at": ts.started_at.isoformat() if ts.started_at else None,
            "completed_at": ts.completed_at.isoformat() if ts.completed_at else None,
            "score": ts.score,
            "max_score": ts.max_score,
            "status": ts.status,
            "last_seen_at": ts.last_seen_at.isoformat() if ts.last_seen_at else None,
        })
    return AdminUserSessionsOut(sessions=items)
