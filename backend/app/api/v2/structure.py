from __future__ import annotations

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, require_teacher
from app.db.session import get_session
from app.services.audit_trail import client_ip
from app.services.structure_io import (
    export_structure_rows,
    import_structure,
    structure_csv_response,
    structure_xlsx_response,
)
from app.services.teacher_audit import audit as teacher_audit_log

router = APIRouter(prefix="/teacher/structure", tags=["teacher-structure"])


@router.post("/import")
async def import_teacher_structure(
    request: Request,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    result = await import_structure(session, file, actor_teacher_id=user.id)
    await teacher_audit_log(
        session,
        teacher_id=user.id,
        action="structure_imported",
        target_type="structure",
        target_id=None,
        before=None,
        after=result.as_dict(),
        ip_addr=client_ip(request),
    )
    await session.commit()
    return result.as_dict()


@router.get("/export")
async def export_teacher_structure(
    format: str = Query(default="csv", pattern="^(csv|xlsx)$"),
    include_archived: bool = Query(default=False),
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
):
    rows = await export_structure_rows(
        session,
        teacher_id=user.id,
        include_archived=include_archived,
    )
    if format == "xlsx":
        return Response(
            content=structure_xlsx_response(rows),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="teacher-learning-structure.xlsx"'},
        )
    return Response(
        content=structure_csv_response(rows),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="teacher-learning-structure.csv"'},
    )
