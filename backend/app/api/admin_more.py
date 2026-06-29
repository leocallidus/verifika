from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import Integer, and_, asc, desc, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin import _enrich_user, _get_user_row, admin_audit, admin_broadcast_event, client_ip, router
from app.core.deps import CurrentUser, require_admin
from app.db.models import (
    Admin,
    AnswerOption,
    AuditLog,
    Discipline,
    DisciplineTopic,
    Group,
    GroupDiscipline,
    Notification,
    Question,
    QuestionClozeBlank,
    Student,
    StudentDiscipline,
    StudentAnswer,
    Teacher,
    TeacherDiscipline,
    TestSession,
    TestSessionGradeOverride,
)
from app.db.session import get_session
from app.schemas.admin import (
    AdminActiveSessionListOut,
    AdminActiveSessionOut,
    AdminAssignmentGroupOut,
    AdminAssignmentMatrixOut,
    AdminAssignmentMatrixRowOut,
    AdminAssignmentStudentOut,
    AdminAssignmentTeacherOut,
    AdminAssignGroupIn,
    AdminAssignStudentIn,
    AdminAssignTeacherIn,
    AdminDisciplineAssignmentOut,
    AdminAuditListOut,
    AdminAuditOut,
    AdminDisciplineCreate,
    AdminDisciplineOut,
    AdminDisciplinePatch,
    AdminDisciplineStat,
    AdminEventListOut,
    AdminEventOut,
    AdminForceFinishIn,
    AdminGroupCreate,
    AdminGroupOut,
    AdminGroupPatch,
    AdminHealthOut,
    AdminOverrideScoreIn,
    AdminStatsSummaryOut,
    AdminTopErrorQuestion,
    AdminEnvInfoOut,
)
from app.services.structure_io import (
    export_structure_rows,
    import_structure,
    structure_csv_response,
    structure_xlsx_response,
)

# ============================================================================
#  GROUPS
# ============================================================================

@router.get("/groups", response_model=List[AdminGroupOut])
async def list_groups(
    archived: Optional[bool] = Query(default=None),
    q: Optional[str] = Query(default=None),
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    stmt = select(Group, func.count(Student.student_id).label("cnt")).outerjoin(
        Student, and_(Student.group_id == Group.group_id, Student.archived_at.is_(None))
    ).group_by(Group.group_id)
    if archived is not None:
        stmt = stmt.where(Group.archived_at.is_not(None) if archived
                          else Group.archived_at.is_(None))
    if q:
        stmt = stmt.where(Group.name.ilike(f"%{q}%"))
    stmt = stmt.order_by(asc(Group.name))
    rows = (await session.execute(stmt)).all()
    return [
        AdminGroupOut(
            group_id=g.group_id,
            name=g.name,
            admission_year=g.admission_year,
            students_count=cnt or 0,
            archived=g.archived_at is not None,
        )
        for g, cnt in rows
    ]


@router.post("/groups", response_model=AdminGroupOut, status_code=201)
async def create_group(
    payload: AdminGroupCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    g = Group(name=payload.name, admission_year=payload.admission_year or
              datetime.now().year)
    session.add(g)
    try:
        await session.commit()
    except Exception as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=f"group already exists: {exc}") from exc
    await admin_audit(session, current, action="group_create",
                      target_type="group", target_id=g.group_id,
                      ip_addr=client_ip(request),
                      after={"name": g.name})
    await session.commit()
    await admin_broadcast_event(
        session,
        event_type="group_created",
        metadata={"actor_id": current.id, "target_id": g.group_id,
                  "target_label": g.name},
    )
    await session.commit()
    return AdminGroupOut(group_id=g.group_id, name=g.name,
                         admission_year=g.admission_year,
                         students_count=0, archived=False)


@router.patch("/groups/{group_id}", response_model=AdminGroupOut)
async def patch_group(
    group_id: int,
    payload: AdminGroupPatch,
    request: Request,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    g = (await session.execute(
        select(Group).where(Group.group_id == group_id)
    )).scalar_one_or_none()
    if g is None:
        raise HTTPException(status_code=404, detail="group not found")
    before = {"name": g.name, "admission_year": g.admission_year}
    if payload.name is not None:
        g.name = payload.name
    if payload.admission_year is not None:
        g.admission_year = payload.admission_year
    await session.commit()
    await admin_audit(session, current, action="group_update",
                      target_type="group", target_id=g.group_id,
                      ip_addr=client_ip(request),
                      before=before,
                      after={"name": g.name, "admission_year": g.admission_year})
    await session.commit()
    return AdminGroupOut(group_id=g.group_id, name=g.name,
                         admission_year=g.admission_year,
                         students_count=0, archived=False)


@router.post("/groups/{group_id}/archive", response_model=AdminGroupOut)
async def archive_group(
    group_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    g = (await session.execute(
        select(Group).where(Group.group_id == group_id)
    )).scalar_one_or_none()
    if g is None:
        raise HTTPException(status_code=404, detail="group not found")
    if g.archived_at is not None:
        # idempotent
        pass
    else:
        # refuse if group has active students
        active_students = (await session.execute(
            select(func.count()).select_from(Student).where(
                Student.group_id == group_id,
                Student.archived_at.is_(None),
            )
        )).scalar_one()
        if active_students and active_students > 0:
            raise HTTPException(
                status_code=409,
                detail="group has active students -- transfer or archive them first",
            )
        g.archived_at = datetime.now(timezone.utc)
    await session.commit()
    await admin_audit(session, current, action="group_archive",
                      target_type="group", target_id=g.group_id,
                      ip_addr=client_ip(request))
    await session.commit()
    return AdminGroupOut(group_id=g.group_id, name=g.name,
                         admission_year=g.admission_year,
                         students_count=0, archived=True)


@router.post("/groups/{group_id}/bulk-transfer")
async def bulk_transfer(
    group_id: int,
    target_group_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    src = (await session.execute(
        select(Group).where(Group.group_id == group_id)
    )).scalar_one_or_none()
    dst = (await session.execute(
        select(Group).where(Group.group_id == target_group_id)
    )).scalar_one_or_none()
    if src is None or dst is None:
        raise HTTPException(status_code=404, detail="group not found")
    if src.group_id == dst.group_id:
        raise HTTPException(status_code=400, detail="source equals target")
    students = (await session.execute(
        select(Student).where(
            Student.group_id == group_id,
            Student.archived_at.is_(None),
        )
    )).scalars().all()
    moved = 0
    for s in students:
        s.group_id = dst.group_id
        moved += 1
    await session.commit()
    await admin_audit(session, current, action="group_bulk_transfer",
                      target_type="group", target_id=src.group_id,
                      ip_addr=client_ip(request),
                      after={"from": src.group_id, "to": dst.group_id,
                             "moved": moved},
                      metadata={"target_group_id": dst.group_id,
                                "moved_count": moved})
    await session.commit()
    return {"ok": True, "moved": moved,
            "from_group_id": src.group_id,
            "to_group_id": dst.group_id}


@router.get("/groups/{group_id}/students", response_model=List[Any])
async def list_group_students(
    group_id: int,
    archived: Optional[bool] = Query(default=None),
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    g = (await session.execute(
        select(Group).where(Group.group_id == group_id)
    )).scalar_one_or_none()
    if g is None:
        raise HTTPException(status_code=404, detail="group not found")
    stmt = select(Student).where(Student.group_id == group_id)
    if archived is not None:
        stmt = stmt.where(Student.archived_at.is_not(None) if archived
                          else Student.archived_at.is_(None))
    rows = (await session.execute(stmt.order_by(asc(Student.last_name)))).scalars().all()
    out = []
    for r in rows:
        out.append(await _enrich_user(session, r, "student"))
    return out


# ============================================================================
#  DISCIPLINES
# ============================================================================

@router.get("/disciplines", response_model=List[AdminDisciplineOut])
async def list_disciplines(
    archived: Optional[bool] = Query(default=None),
    q: Optional[str] = Query(default=None),
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    stmt = select(
        Discipline,
        func.count(func.distinct(TeacherDiscipline.teacher_id)).label("tc"),
        func.count(func.distinct(DisciplineTopic.topic_id)).label("tp"),
        func.count(func.distinct(Question.question_id)).label("qc"),
    ).outerjoin(TeacherDiscipline, TeacherDiscipline.discipline_id == Discipline.discipline_id).outerjoin(
        DisciplineTopic, and_(
            DisciplineTopic.discipline_id == Discipline.discipline_id,
            DisciplineTopic.archived_at.is_(None),
        ),
    ).outerjoin(Question, and_(
        Question.discipline_id == Discipline.discipline_id,
        Question.archived_at.is_(None),
    )).group_by(Discipline.discipline_id)
    if archived is not None:
        stmt = stmt.where(Discipline.archived_at.is_not(None) if archived
                          else Discipline.archived_at.is_(None))
    if q:
        stmt = stmt.where(Discipline.name.ilike(f"%{q}%"))
    stmt = stmt.order_by(asc(Discipline.name))
    rows = (await session.execute(stmt)).all()
    return [
        AdminDisciplineOut(
            discipline_id=d.discipline_id,
            name=d.name,
            description=d.description,
            credits=d.credits,
            total_hours=d.total_hours,
            teachers_count=tc or 0,
            topics_count=tp or 0,
            questions_count=qc or 0,
            archived=d.archived_at is not None,
            created_at=d.created_at if hasattr(d, "created_at") else None,
        )
        for d, tc, tp, qc in rows
    ]


@router.post("/disciplines", response_model=AdminDisciplineOut, status_code=201)
async def create_discipline(
    payload: AdminDisciplineCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    d = Discipline(
        name=payload.name,
        description=payload.description,
        credits=payload.credits,
        total_hours=payload.total_hours,
    )
    session.add(d)
    await session.flush()
    try:
        await session.commit()
    except Exception as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=f"discipline exists: {exc}") from exc
    await admin_audit(session, current, action="discipline_create",
                      target_type="discipline", target_id=d.discipline_id,
                      ip_addr=client_ip(request),
                      after={"name": d.name})
    await session.commit()
    return AdminDisciplineOut(
        discipline_id=d.discipline_id, name=d.name,
        description=d.description, credits=d.credits, total_hours=d.total_hours,
        teachers_count=0, topics_count=0, questions_count=0,
        archived=False,
    )


@router.patch("/disciplines/{discipline_id}", response_model=AdminDisciplineOut)
async def patch_discipline(
    discipline_id: int,
    payload: AdminDisciplinePatch,
    request: Request,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    d = (await session.execute(
        select(Discipline).where(Discipline.discipline_id == discipline_id)
    )).scalar_one_or_none()
    if d is None:
        raise HTTPException(status_code=404, detail="discipline not found")
    before = {"name": d.name, "description": d.description,
              "credits": d.credits, "total_hours": d.total_hours}
    if payload.name is not None:
        d.name = payload.name
    if payload.description is not None:
        d.description = payload.description
    if payload.credits is not None:
        d.credits = payload.credits
    if payload.total_hours is not None:
        d.total_hours = payload.total_hours
    await session.commit()
    await admin_audit(session, current, action="discipline_update",
                      target_type="discipline", target_id=d.discipline_id,
                      ip_addr=client_ip(request),
                      before=before,
                      after={"name": d.name, "description": d.description,
                             "credits": d.credits, "total_hours": d.total_hours})
    await session.commit()
    return AdminDisciplineOut(
        discipline_id=d.discipline_id, name=d.name,
        description=d.description, credits=d.credits, total_hours=d.total_hours,
        teachers_count=0, topics_count=0, questions_count=0,
        archived=False,
    )


@router.post("/disciplines/{discipline_id}/archive", response_model=AdminDisciplineOut)
async def archive_discipline(
    discipline_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    d = (await session.execute(
        select(Discipline).where(Discipline.discipline_id == discipline_id)
    )).scalar_one_or_none()
    if d is None:
        raise HTTPException(status_code=404, detail="discipline not found")
    if d.archived_at is None:
        d.archived_at = datetime.now(timezone.utc)
    await session.commit()
    await admin_audit(session, current, action="discipline_archive",
                      target_type="discipline", target_id=d.discipline_id,
                      ip_addr=client_ip(request))
    await session.commit()
    return AdminDisciplineOut(
        discipline_id=d.discipline_id, name=d.name,
        description=d.description, credits=d.credits, total_hours=d.total_hours,
        teachers_count=0, topics_count=0, questions_count=0,
        archived=True,
    )


@router.post("/disciplines/{discipline_id}/assign-teacher")
async def assign_teacher(
    discipline_id: int,
    payload: AdminAssignTeacherIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    t = (await session.execute(
        select(Teacher).where(Teacher.teacher_id == payload.teacher_id)
    )).scalar_one_or_none()
    if t is None:
        raise HTTPException(status_code=404, detail="teacher not found")
    d = (await session.execute(
        select(Discipline).where(Discipline.discipline_id == discipline_id)
    )).scalar_one_or_none()
    if d is None:
        raise HTTPException(status_code=404, detail="discipline not found")
    link = (await session.execute(
        select(TeacherDiscipline).where(
            TeacherDiscipline.teacher_id == payload.teacher_id,
            TeacherDiscipline.discipline_id == discipline_id,
        )
    )).scalar_one_or_none()
    if link is None:
        link = TeacherDiscipline(teacher_id=payload.teacher_id,
                                 discipline_id=discipline_id)
        session.add(link)
        await session.commit()
        await admin_audit(session, current, action="discipline_assigned",
                          target_type="discipline", target_id=discipline_id,
                          ip_addr=client_ip(request),
                          after={"teacher_id": payload.teacher_id,
                                 "discipline_id": discipline_id})
        await session.commit()
        await admin_broadcast_event(
            session,
            event_type="discipline_assigned",
            metadata={"teacher_id": payload.teacher_id,
                      "discipline_id": discipline_id,
                      "actor_id": current.id},
        )
        await session.commit()
    return {"ok": True, "teacher_id": payload.teacher_id,
            "discipline_id": discipline_id}


@router.post("/disciplines/{discipline_id}/revoke-teacher")
async def revoke_teacher(
    discipline_id: int,
    payload: AdminAssignTeacherIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    link = (await session.execute(
        select(TeacherDiscipline).where(
            TeacherDiscipline.teacher_id == payload.teacher_id,
            TeacherDiscipline.discipline_id == discipline_id,
        )
    )).scalar_one_or_none()
    if link is None:
        return {"ok": True, "noop": True}
    await session.delete(link)
    await session.commit()
    await admin_audit(session, current, action="discipline_revoked",
                      target_type="discipline", target_id=discipline_id,
                      ip_addr=client_ip(request),
                      before={"teacher_id": payload.teacher_id,
                              "discipline_id": discipline_id})
    await session.commit()
    await admin_broadcast_event(
        session,
        event_type="discipline_revoked",
        metadata={"teacher_id": payload.teacher_id,
                  "discipline_id": discipline_id,
                  "actor_id": current.id},
    )
    await session.commit()
    return {"ok": True, "teacher_id": payload.teacher_id,
            "discipline_id": discipline_id}


@router.get("/disciplines/{discipline_id}/assignments", response_model=List[AdminDisciplineAssignmentOut])
async def discipline_assignments(
    discipline_id: int,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    discipline_exists = (await session.execute(
        select(Discipline.discipline_id).where(Discipline.discipline_id == discipline_id)
    )).scalar_one_or_none()
    if discipline_exists is None:
        raise HTTPException(status_code=404, detail="discipline not found")

    group_rows = (await session.execute(
        select(GroupDiscipline, Group.name)
        .join(Group, Group.group_id == GroupDiscipline.group_id)
        .where(GroupDiscipline.discipline_id == discipline_id)
        .order_by(Group.name.asc())
    )).all()
    student_rows = (await session.execute(
        select(StudentDiscipline, Student.last_name, Student.first_name, Student.middle_name)
        .join(Student, Student.student_id == StudentDiscipline.student_id)
        .where(StudentDiscipline.discipline_id == discipline_id)
        .order_by(Student.last_name.asc(), Student.first_name.asc())
    )).all()

    assignments: list[AdminDisciplineAssignmentOut] = [
        AdminDisciplineAssignmentOut(
            discipline_id=discipline_id,
            target_type="group",
            target_id=link.group_id,
            target_name=name,
            assigned_at=link.assigned_at,
        )
        for link, name in group_rows
    ]
    assignments.extend(
        AdminDisciplineAssignmentOut(
            discipline_id=discipline_id,
            target_type="student",
            target_id=link.student_id,
            target_name=f"{last} {first} {middle or ''}".strip(),
            assigned_at=link.assigned_at,
        )
        for link, last, first, middle in student_rows
    )
    return assignments


@router.post("/disciplines/{discipline_id}/assign-group")
async def assign_group_to_discipline(
    discipline_id: int,
    payload: AdminAssignGroupIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    d = (await session.execute(select(Discipline).where(Discipline.discipline_id == discipline_id))).scalar_one_or_none()
    if d is None:
        raise HTTPException(status_code=404, detail="discipline not found")
    group = (await session.execute(select(Group).where(Group.group_id == payload.group_id))).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=404, detail="group not found")

    link = (await session.execute(
        select(GroupDiscipline).where(
            GroupDiscipline.group_id == payload.group_id,
            GroupDiscipline.discipline_id == discipline_id,
        )
    )).scalar_one_or_none()
    if link is None:
        link = GroupDiscipline(
            group_id=payload.group_id,
            discipline_id=discipline_id,
            assigned_by_admin_id=current.id,
        )
        session.add(link)
        await session.commit()
        await admin_audit(
            session, current, action="discipline_group_assigned",
            target_type="discipline", target_id=discipline_id,
            ip_addr=client_ip(request),
            after={"group_id": payload.group_id, "discipline_id": discipline_id},
        )
        await session.commit()
    return {"ok": True, "group_id": payload.group_id, "discipline_id": discipline_id}


@router.post("/disciplines/{discipline_id}/revoke-group")
async def revoke_group_from_discipline(
    discipline_id: int,
    payload: AdminAssignGroupIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    link = (await session.execute(
        select(GroupDiscipline).where(
            GroupDiscipline.group_id == payload.group_id,
            GroupDiscipline.discipline_id == discipline_id,
        )
    )).scalar_one_or_none()
    if link is None:
        return {"ok": True, "noop": True}
    await session.delete(link)
    await session.commit()
    await admin_audit(
        session, current, action="discipline_group_revoked",
        target_type="discipline", target_id=discipline_id,
        ip_addr=client_ip(request),
        before={"group_id": payload.group_id, "discipline_id": discipline_id},
    )
    await session.commit()
    return {"ok": True, "group_id": payload.group_id, "discipline_id": discipline_id}


@router.post("/disciplines/{discipline_id}/assign-student")
async def assign_student_to_discipline(
    discipline_id: int,
    payload: AdminAssignStudentIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    d = (await session.execute(select(Discipline).where(Discipline.discipline_id == discipline_id))).scalar_one_or_none()
    if d is None:
        raise HTTPException(status_code=404, detail="discipline not found")
    student = (await session.execute(select(Student).where(Student.student_id == payload.student_id))).scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=404, detail="student not found")

    link = (await session.execute(
        select(StudentDiscipline).where(
            StudentDiscipline.student_id == payload.student_id,
            StudentDiscipline.discipline_id == discipline_id,
        )
    )).scalar_one_or_none()
    if link is None:
        link = StudentDiscipline(
            student_id=payload.student_id,
            discipline_id=discipline_id,
            assigned_by_admin_id=current.id,
        )
        session.add(link)
        await session.commit()
        await admin_audit(
            session, current, action="discipline_student_assigned",
            target_type="discipline", target_id=discipline_id,
            ip_addr=client_ip(request),
            after={"student_id": payload.student_id, "discipline_id": discipline_id},
        )
        await session.commit()
    return {"ok": True, "student_id": payload.student_id, "discipline_id": discipline_id}


@router.post("/disciplines/{discipline_id}/revoke-student")
async def revoke_student_from_discipline(
    discipline_id: int,
    payload: AdminAssignStudentIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    link = (await session.execute(
        select(StudentDiscipline).where(
            StudentDiscipline.student_id == payload.student_id,
            StudentDiscipline.discipline_id == discipline_id,
        )
    )).scalar_one_or_none()
    if link is None:
        return {"ok": True, "noop": True}
    await session.delete(link)
    await session.commit()
    await admin_audit(
        session, current, action="discipline_student_revoked",
        target_type="discipline", target_id=discipline_id,
        ip_addr=client_ip(request),
        before={"student_id": payload.student_id, "discipline_id": discipline_id},
    )
    await session.commit()
    return {"ok": True, "student_id": payload.student_id, "discipline_id": discipline_id}


@router.get("/teachers/{teacher_id}/disciplines", response_model=List[AdminDisciplineOut])
async def teacher_disciplines(
    teacher_id: int,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    rows = (await session.execute(
        select(Discipline)
        .join(TeacherDiscipline, TeacherDiscipline.discipline_id == Discipline.discipline_id)
        .where(TeacherDiscipline.teacher_id == teacher_id)
        .order_by(asc(Discipline.name))
    )).scalars().all()
    return [
        AdminDisciplineOut(
            discipline_id=d.discipline_id, name=d.name,
            description=d.description, credits=d.credits,
            total_hours=d.total_hours, archived=d.archived_at is not None,
        )
        for d in rows
    ]


@router.post("/structure/import")
async def import_learning_structure(
    request: Request,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    result = await import_structure(session, file)
    await admin_audit(
        session,
        current,
        action="structure_imported",
        target_type="structure",
        ip_addr=client_ip(request),
        after=result.as_dict(),
    )
    await session.commit()
    return result.as_dict()


@router.get("/structure/export")
async def export_learning_structure(
    format: str = Query(default="csv", pattern="^(csv|xlsx)$"),
    include_archived: bool = Query(default=False),
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    rows = await export_structure_rows(session, include_archived=include_archived)
    if format == "xlsx":
        return Response(
            content=structure_xlsx_response(rows),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="learning-structure.xlsx"'},
        )
    return Response(
        content=structure_csv_response(rows),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="learning-structure.csv"'},
    )


@router.get("/assignments/matrix", response_model=AdminAssignmentMatrixOut)
async def assignment_matrix(
    archived: Optional[bool] = Query(default=None),
    q: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    stmt = select(Discipline)
    if archived is not None:
        stmt = stmt.where(
            Discipline.archived_at.is_not(None) if archived
            else Discipline.archived_at.is_(None)
        )
    if q:
        stmt = stmt.where(
            or_(
                Discipline.name.ilike(f"%{q}%"),
                Discipline.description.ilike(f"%{q}%"),
            )
        )
    disciplines = (await session.execute(
        stmt.order_by(asc(Discipline.name)).limit(limit)
    )).scalars().all()

    rows: list[AdminAssignmentMatrixRowOut] = []
    for discipline in disciplines:
        teacher_rows = (await session.execute(
            select(TeacherDiscipline, Teacher)
            .join(Teacher, Teacher.teacher_id == TeacherDiscipline.teacher_id)
            .where(
                TeacherDiscipline.discipline_id == discipline.discipline_id,
                Teacher.archived_at.is_(None),
            )
            .order_by(asc(Teacher.last_name), asc(Teacher.first_name))
        )).all()
        group_rows = (await session.execute(
            select(GroupDiscipline, Group, func.count(Student.student_id).label("students_count"))
            .join(Group, Group.group_id == GroupDiscipline.group_id)
            .outerjoin(
                Student,
                and_(
                    Student.group_id == Group.group_id,
                    Student.archived_at.is_(None),
                ),
            )
            .where(GroupDiscipline.discipline_id == discipline.discipline_id)
            .group_by(GroupDiscipline.group_id, GroupDiscipline.discipline_id, Group.group_id)
            .order_by(asc(Group.name))
        )).all()
        student_rows = (await session.execute(
            select(StudentDiscipline, Student, Group)
            .join(Student, Student.student_id == StudentDiscipline.student_id)
            .outerjoin(Group, Group.group_id == Student.group_id)
            .where(
                StudentDiscipline.discipline_id == discipline.discipline_id,
                Student.archived_at.is_(None),
            )
            .order_by(asc(Student.last_name), asc(Student.first_name))
        )).all()

        assigned_group_ids = [link.group_id for link, _group, _count in group_rows]
        assigned_student_ids = [link.student_id for link, _student, _group in student_rows]
        access_conditions = []
        if assigned_group_ids:
            access_conditions.append(Student.group_id.in_(assigned_group_ids))
        if assigned_student_ids:
            access_conditions.append(Student.student_id.in_(assigned_student_ids))
        effective_students_count = 0
        if access_conditions:
            effective_students_count = int((await session.execute(
                select(func.count(func.distinct(Student.student_id))).where(
                    Student.archived_at.is_(None),
                    or_(*access_conditions),
                )
            )).scalar_one() or 0)

        rows.append(AdminAssignmentMatrixRowOut(
            discipline_id=discipline.discipline_id,
            discipline_name=discipline.name,
            archived=discipline.archived_at is not None,
            teachers=[
                AdminAssignmentTeacherOut(
                    teacher_id=teacher.teacher_id,
                    full_name=f"{teacher.last_name} {teacher.first_name} {teacher.middle_name or ''}".strip(),
                    department=teacher.department,
                    assigned_at=link.assigned_at,
                )
                for link, teacher in teacher_rows
            ],
            groups=[
                AdminAssignmentGroupOut(
                    group_id=group.group_id,
                    name=group.name,
                    students_count=int(students_count or 0),
                    assigned_at=link.assigned_at,
                )
                for link, group, students_count in group_rows
            ],
            students=[
                AdminAssignmentStudentOut(
                    student_id=student.student_id,
                    full_name=f"{student.last_name} {student.first_name} {student.middle_name or ''}".strip(),
                    group_id=student.group_id,
                    group_name=group.name if group is not None else None,
                    assigned_at=link.assigned_at,
                )
                for link, student, group in student_rows
            ],
            effective_students_count=effective_students_count,
            has_teacher=bool(teacher_rows),
            has_student_access=effective_students_count > 0,
        ))
    return AdminAssignmentMatrixOut(rows=rows)


# ============================================================================
#  EVENTS / AUDIT
# ============================================================================

@router.get("/events", response_model=AdminEventListOut)
async def list_events(
    type: Optional[str] = Query(default=None),
    severity: Optional[int] = Query(default=None, ge=0, le=2),
    recipient_role: Optional[str] = Query(default=None, pattern="^(student|teacher|admin)$"),
    user_id: Optional[int] = Query(default=None),
    q: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    stmt = select(Notification).where(or_(
        Notification.recipient_role == "admin",
        Notification.channel == "admin",
        and_(Notification.user_id == current.id, Notification.user_role == "admin"),
        and_(Notification.user_role == "admin", Notification.user_id == 0),
    )).where(Notification.hidden_admin_id.is_(None))
    if type:
        stmt = stmt.where(Notification.event_type == type)
    if severity is not None:
        stmt = stmt.where(Notification.severity == severity)
    if recipient_role:
        stmt = stmt.where(Notification.recipient_role == recipient_role)
    if user_id:
        stmt = stmt.where(or_(
            Notification.user_id == user_id,
        ))
    if q:
        stmt = stmt.where(or_(
            Notification.event_type.ilike(f"%{q}%"),
            Notification.payload.astext.ilike(f"%{q}%"),
            Notification.extra_metadata.astext.ilike(f"%{q}%"),
        ))
    total = int((await session.execute(
        select(func.count()).select_from(stmt.subquery())
    )).scalar_one() or 0)
    rows = (await session.execute(
        stmt.order_by(desc(Notification.created_at))
        .offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()
    items = [
        AdminEventOut(
            notification_id=n.notification_id,
            user_role=n.user_role,
            user_id=n.user_id or None,
            event_type=n.event_type,
            severity=n.severity or 0,
            channel=n.channel or "user",
            payload=n.payload,
            metadata=n.extra_metadata,
            created_at=n.created_at,
        )
        for n in rows
    ]
    return AdminEventListOut(items=items, total=total, page=page, page_size=page_size)


@router.post("/events/{event_id}/hide", status_code=204)
async def hide_event(
    event_id: int,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    n = (await session.execute(
        select(Notification).where(Notification.notification_id == event_id)
    )).scalar_one_or_none()
    if n is None:
        raise HTTPException(status_code=404, detail="event not found")
    if n.hidden_admin_id is None:
        n.hidden_admin_id = current.id
        await session.commit()


@router.get("/audit", response_model=AdminAuditListOut)
async def list_audit(
    target_type: Optional[str] = Query(default=None),
    target_id: Optional[int] = Query(default=None),
    actor: Optional[str] = Query(default=None, pattern="^(student|teacher|admin)$"),
    actor_id: Optional[int] = Query(default=None),
    from_: Optional[datetime] = Query(default=None, alias="from"),
    to: Optional[datetime] = Query(default=None),
    q: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    stmt = select(AuditLog)
    if target_type:
        stmt = stmt.where(AuditLog.target_type == target_type)
    if target_id is not None:
        stmt = stmt.where(AuditLog.target_id == target_id)
    if actor:
        stmt = stmt.where(AuditLog.actor_role == actor)
    if actor_id is not None:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    if from_:
        stmt = stmt.where(AuditLog.created_at >= from_)
    if to:
        stmt = stmt.where(AuditLog.created_at <= to)
    if q:
        stmt = stmt.where(or_(
            AuditLog.action.ilike(f"%{q}%"),
            AuditLog.target.ilike(f"%{q}%"),
        ))
    total = int((await session.execute(
        select(func.count()).select_from(stmt.subquery())
    )).scalar_one() or 0)
    rows = (await session.execute(
        stmt.order_by(desc(AuditLog.created_at))
        .offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()
    items = [
        AdminAuditOut(
            log_id=r.log_id,
            actor_role=r.actor_role, actor_id=r.actor_id,
            action=r.action, target=r.target,
            target_type=r.target_type, target_id=r.target_id,
            ip_addr=str(r.ip_addr) if r.ip_addr is not None else None,
            reason=r.reason,
            metadata=r.metadata_json, before_json=r.before_json,
            after_json=r.after_json, created_at=r.created_at,
        )
        for r in rows
    ]
    return AdminAuditListOut(items=items, total=total, page=page, page_size=page_size)


# ============================================================================
#  SESSIONS (active + force-finish + override)
# ============================================================================

@router.get("/sessions/active", response_model=AdminActiveSessionListOut)
async def active_sessions(
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
    rows = (await session.execute(
        select(TestSession, Discipline, Student, Teacher)
        .join(Discipline, Discipline.discipline_id == TestSession.discipline_id)
        .join(Student, Student.student_id == TestSession.student_id)
        .join(Teacher, Teacher.teacher_id == TestSession.teacher_id)
        .where(TestSession.completed_at.is_(None))
        .order_by(desc(TestSession.started_at))
    )).all()
    items = []
    for ts, d, s, t in rows:
        # count answered
        answered = (await session.execute(
            select(func.count(func.distinct(StudentAnswer.question_id))).where(
                StudentAnswer.session_id == ts.session_id,
            )
        )).scalar_one() or 0
        items.append(AdminActiveSessionOut(
            session_id=ts.session_id,
            student_id=s.student_id,
            student_name=f"{s.last_name} {s.first_name} {s.middle_name or ''}".strip(),
            discipline_id=d.discipline_id,
            discipline_name=d.name,
            teacher_id=t.teacher_id,
            teacher_name=f"{t.last_name} {t.first_name} {t.middle_name or ''}".strip(),
            started_at=ts.started_at,
            last_seen_at=ts.last_seen_at,
            status=("stuck" if ts.last_seen_at is None or ts.last_seen_at < cutoff
                    else ts.status),
            questions_total=ts.max_score,  # placeholder until we have actual count; max_score is upper bound
            questions_answered=int(answered),
        ))
    return AdminActiveSessionListOut(items=items, total=len(items))


@router.post("/sessions/{session_id}/heartbeat", status_code=204)
async def heartbeat(
    session_id: int,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    ts = (await session.execute(
        select(TestSession).where(TestSession.session_id == session_id)
    )).scalar_one_or_none()
    if ts is None:
        raise HTTPException(status_code=404, detail="session not found")
    ts.last_seen_at = datetime.now(timezone.utc)
    await session.commit()


@router.post("/sessions/{session_id}/force-finish", status_code=204)
async def force_finish(
    session_id: int,
    payload: AdminForceFinishIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    ts = (await session.execute(
        select(TestSession).where(TestSession.session_id == session_id)
    )).scalar_one_or_none()
    if ts is None:
        raise HTTPException(status_code=404, detail="session not found")
    if ts.completed_at is not None:
        raise HTTPException(status_code=409, detail="session already completed")
    before = {"status": ts.status, "completed_at": None}
    ts.completed_at = datetime.now(timezone.utc)
    ts.status = "force_finished"
    ts.force_finished_by = current.id
    await session.commit()
    await admin_audit(session, current, action="session_force_finished",
                      target_type="session", target_id=session_id,
                      ip_addr=client_ip(request),
                      reason=payload.reason, before=before,
                      after={"status": ts.status,
                             "completed_at": ts.completed_at.isoformat()})
    await session.commit()
    await admin_broadcast_event(
        session,
        event_type="session_force_finished",
        metadata={"session_id": session_id, "actor_id": current.id,
                  "reason": payload.reason},
    )
    await session.commit()


@router.delete("/sessions/{session_id}/answers", status_code=204)
async def clear_answers(
    session_id: int,
    request: Request,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    ts = (await session.execute(
        select(TestSession).where(TestSession.session_id == session_id)
    )).scalar_one_or_none()
    if ts is None:
        raise HTTPException(status_code=404, detail="session not found")
    count_row = (await session.execute(
        select(func.count()).select_from(StudentAnswer).where(
            StudentAnswer.session_id == session_id,
        )
    )).scalar_one() or 0
    await session.execute(
        StudentAnswer.__table__.delete().where(StudentAnswer.session_id == session_id)
    )
    ts.score = 0
    await session.commit()
    await admin_audit(session, current, action="answers_cleared",
                      target_type="session", target_id=session_id,
                      ip_addr=client_ip(request),
                      metadata={"cleared_count": count_row})
    await session.commit()


@router.post("/sessions/{session_id}/override")
async def override_score(
    session_id: int,
    payload: AdminOverrideScoreIn,
    request: Request,
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    ts = (await session.execute(
        select(TestSession).where(TestSession.session_id == session_id)
    )).scalar_one_or_none()
    if ts is None:
        raise HTTPException(status_code=404, detail="session not found")
    before = ts.score
    ts.score = payload.score
    grade_override = (await session.execute(
        select(TestSessionGradeOverride).where(
            TestSessionGradeOverride.session_id == session_id,
        )
    )).scalar_one_or_none()
    if grade_override is None:
        go = TestSessionGradeOverride(
            session_id=session_id,
            score=payload.score,
            reason=payload.reason,
            teacher_id=ts.teacher_id,  # link attribute; admin makes mutation
        )
        session.add(go)
    else:
        grade_override.score = payload.score
        grade_override.reason = payload.reason
    await session.commit()
    await admin_audit(session, current, action="grade_override_changed",
                      target_type="session", target_id=session_id,
                      ip_addr=client_ip(request),
                      before={"score": before},
                      after={"score": payload.score, "reason": payload.reason})
    await session.commit()
    await admin_broadcast_event(
        session,
        event_type="grade_override_changed",
        metadata={"session_id": session_id, "actor_id": current.id,
                  "from": before, "to": payload.score,
                  "reason": payload.reason},
        severity=2,
    )
    await session.commit()
    return {"ok": True, "session_id": session_id, "score": payload.score}


# ============================================================================
#  HEALTH / STATS
# ============================================================================

@router.get("/health/db", response_model=AdminHealthOut)
async def health_db(
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    import time
    import httpx
    from sqlalchemy import text
    from app.core.config import get_settings
    from app.notifications.bus import bus
    from app.core.metrics import get_api_response_stats, get_recent_errors_from_log
    from app.db.models import AiGenerationTask

    settings = get_settings()

    db_ok = False
    db_latency_ms = None
    last_migration = "extensions_v11_admin"
    active = 0
    notif = 0
    audit = 0

    # 1. Check DB ok and latency
    start = time.perf_counter()
    try:
        await session.execute(text("SELECT 1"))
        db_latency_ms = round((time.perf_counter() - start) * 1000, 2)
        db_ok = True

        active = int((await session.execute(
            select(func.count()).select_from(TestSession).where(
                TestSession.completed_at.is_(None),
            )
        )).scalar_one() or 0)
        notif = int((await session.execute(
            select(func.count()).select_from(Notification)
        )).scalar_one() or 0)
        audit = int((await session.execute(
            select(func.count()).select_from(AuditLog)
        )).scalar_one() or 0)
    except Exception as exc:
        db_ok = False
        db_latency_ms = None

    # 2. SSE active connections count
    try:
        sse_connections_count = sum(len(qs) for qs in bus._subs.values()) + sum(len(qs) for qs in bus._role_subs.values())
    except Exception:
        sse_connections_count = 0

    # 3. AI provider status
    ai_enabled = settings.ai_enabled
    ai_ok = False
    ai_latency_ms = None
    ai_model = settings.ai_chat_model if ai_enabled else None

    if ai_enabled:
        start_ai = time.perf_counter()
        try:
            headers = {"Authorization": f"Bearer {settings.ai_api_key or 'mock-key'}"}
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.get(f"{settings.ai_base_url.rstrip('/')}/models", headers=headers)
                if resp.status_code in (200, 401, 403):
                    ai_ok = True
                ai_latency_ms = round((time.perf_counter() - start_ai) * 1000, 2)
        except Exception:
            ai_ok = False
            ai_latency_ms = None

    # 4. Queues (ai_generation_tasks table counts)
    ai_generation_tasks = {
        "processing": 0,
        "done": 0,
        "error": 0
    }
    if db_ok:
        try:
            task_counts = (await session.execute(
                select(AiGenerationTask.status, func.count(AiGenerationTask.task_id))
                .group_by(AiGenerationTask.status)
            )).all()
            for status_val, count_val in task_counts:
                if status_val in ai_generation_tasks:
                    ai_generation_tasks[status_val] = int(count_val or 0)
        except Exception:
            pass

    # 5. API response times stats
    try:
        api_response_stats = get_api_response_stats()
    except Exception:
        api_response_stats = {"avg_ms": 0.0, "min_ms": 0.0, "max_ms": 0.0, "count": 0}

    # 6. Recent errors from log
    try:
        recent_errors = get_recent_errors_from_log()
    except Exception:
        recent_errors = []

    return AdminHealthOut(
        db_ok=db_ok,
        last_migration=last_migration if db_ok else None,
        notifications_count=notif,
        audit_count=audit,
        active_sessions_count=active,
        db_latency_ms=db_latency_ms,
        sse_connections_count=sse_connections_count,
        ai_enabled=ai_enabled,
        ai_ok=ai_ok,
        ai_latency_ms=ai_latency_ms,
        ai_model=ai_model,
        ai_generation_tasks=ai_generation_tasks,
        api_response_stats=api_response_stats,
        recent_errors=recent_errors,
    )


@router.get("/stats/summary", response_model=AdminStatsSummaryOut)
async def stats_summary(
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    students = (await session.execute(
        select(func.count()).select_from(Student)
        .where(Student.archived_at.is_(None))
    )).scalar_one() or 0
    teachers = (await session.execute(
        select(func.count()).select_from(Teacher)
        .where(Teacher.archived_at.is_(None))
    )).scalar_one() or 0
    admins = (await session.execute(
        select(func.count()).select_from(Admin)
        .where(Admin.archived_at.is_(None))
    )).scalar_one() or 0
    groups = (await session.execute(
        select(func.count()).select_from(Group)
        .where(Group.archived_at.is_(None))
    )).scalar_one() or 0
    disciplines = (await session.execute(
        select(func.count()).select_from(Discipline)
        .where(Discipline.archived_at.is_(None))
    )).scalar_one() or 0
    active = (await session.execute(
        select(func.count()).select_from(TestSession)
        .where(TestSession.completed_at.is_(None))
    )).scalar_one() or 0
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    last24 = (await session.execute(
        select(func.count(), func.avg(TestSession.score)).select_from(
            TestSession
        ).where(TestSession.started_at >= cutoff)
    )).first()
    attempts_count, avg_score = (last24 or (0, None))
    return AdminStatsSummaryOut(
        users_total=int(students) + int(teachers) + int(admins),
        students_total=int(students),
        teachers_total=int(teachers),
        admins_total=int(admins),
        groups_total=int(groups),
        disciplines_total=int(disciplines),
        active_sessions=int(active),
        attempts_last_24h=int(attempts_count or 0),
        avg_score_last_24h=float(avg_score) if avg_score is not None else None,
    )


@router.get("/stats/disciplines", response_model=List[AdminDisciplineStat])
async def stats_disciplines(
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    rows = (await session.execute(
        select(
            Discipline, func.count(TestSession.session_id),
            func.avg(TestSession.score),
        ).outerjoin(TestSession, TestSession.discipline_id == Discipline.discipline_id)
        .where(Discipline.archived_at.is_(None))
        .group_by(Discipline.discipline_id)
        .order_by(asc(Discipline.name))
    )).all()
    return [
        AdminDisciplineStat(
            discipline_id=d.discipline_id,
            name=d.name,
            attempts=int(c or 0),
            avg_score=float(a) if a is not None else None,
        )
        for d, c, a in rows
    ]


@router.get("/stats/top-errors", response_model=List[AdminTopErrorQuestion])
async def stats_top_errors(
    limit: int = Query(default=10, ge=1, le=50),
    session: AsyncSession = Depends(get_session),
    current: CurrentUser = Depends(require_admin),
):
    """Top-N 'hardest' questions (max incorrect %).

    Strategy: count answers per (qid, correct) within max_score, where correct is determined
    by checking is_correct on the joined option for single-choice; for non-single types
    we approximate via short_pattern match (in v2). For simplicity we use a positive
    score proxy based on the existence of a `correct` option being selected.
    """
    rows = (await session.execute(
        select(
            Question, Discipline,
            func.count(StudentAnswer.answer_id).label("answers"),
            func.sum(
                func.coalesce(AnswerOption.is_correct.cast(Integer), 0)
            ).label("correct_picked_count"),
        ).join(Discipline, Discipline.discipline_id == Question.discipline_id)
        .outerjoin(StudentAnswer, StudentAnswer.question_id == Question.question_id)
        .outerjoin(AnswerOption, AnswerOption.option_id == StudentAnswer.selected_option_id)
        .where(Question.archived_at.is_(None))
        .group_by(Question.question_id, Discipline.discipline_id)
        .having(func.count(StudentAnswer.answer_id) > 0)
        .order_by(desc(func.count(StudentAnswer.answer_id)))
        .limit(limit)
    )).all()
    out = []
    for q, d, total, correct in rows:
        total = int(total or 0)
        correct = int(correct or 0)
        incorrect_pct = 0.0 if total == 0 else max(0.0, 1.0 - correct / total)
        out.append(AdminTopErrorQuestion(
            question_id=q.question_id,
            text=(q.text or "")[:120],
            discipline_id=d.discipline_id,
            discipline_name=d.name,
            attempts=total,
            incorrect_pct=incorrect_pct * 100.0,
        )        )
    return out


# ============================================================================
#  DOCUMENTATION — ENV INFO
# ============================================================================

@router.get("/docs/env-info", response_model=AdminEnvInfoOut)
async def docs_env_info(
    _admin: CurrentUser = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Return runtime environment info for admin documentation page."""
    import sys
    from app.core.config import get_settings

    settings = get_settings()

    # Mask password in database URL
    db_url = settings.database_url
    try:
        from urllib.parse import urlparse, urlunparse
        parsed = urlparse(db_url.replace("postgresql+asyncpg://", "postgresql://"))
        masked = parsed._replace(netloc=f"{parsed.username}:****@{parsed.hostname}:{parsed.port}")
        db_url_masked = urlunparse(masked)
    except Exception:
        db_url_masked = "****"

    # Get current Alembic revision
    alembic_rev = None
    try:
        row = (await session.execute(
            select(func.max(func.column('version_num'))).select_from(func.table('alembic_version'))
        )).scalar()
        alembic_rev = row
    except Exception:
        try:
            row = (await session.execute(text("SELECT version_num FROM alembic_version LIMIT 1"))).scalar()
            alembic_rev = row
        except Exception:
            pass

    return {
        "app_version": "2.0.0",
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "database_url_masked": db_url_masked,
        "alembic_revision": alembic_rev,
        "ai_enabled": settings.ai_enabled,
        "ai_base_url": settings.ai_base_url,
        "ai_chat_model": settings.ai_chat_model,
        "ai_generation_model": settings.ai_generation_model,
        "log_level": settings.log_level,
        "cors_origins": settings.cors_origins,
        "jwt_expire_minutes": settings.jwt_expire_minutes,
        "smtp_configured": bool(settings.smtp_host),
        "upload_dir": settings.upload_dir,
        "bcrypt_rounds": settings.bcrypt_rounds,
    }

