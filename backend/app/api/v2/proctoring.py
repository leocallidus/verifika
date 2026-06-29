from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, get_current_user, require_student, require_teacher
from app.db.models import TestSession, ProctorEvent, AttemptsPolicy, Discipline, DisciplineTopic
from app.db.session import get_session
from app.schemas.proctoring import ProctorEventIn, ProctorEventOut, ProctorLogOut
from app.services.proctoring import save_proctor_snapshot
from app.services.question_images import ImageValidationError, storage_path
from app.services.teacher_notifications import notify_teacher

router = APIRouter(tags=["v2.proctoring"])

# Map proctor event types to a human title + severity for teacher notifications.
# `severity >= 1` is treated as critical on the teacher side (warning toast +
# native OS notification). Events absent from this map are still relayed with a
# generic title, EXCEPT those in PROCTOR_EVENTS_SILENT below.
PROCTOR_EVENT_META: dict[str, tuple[str, int]] = {
    "no_webcam_device": ("Камера недоступна у студента", 1),
    "tab_blur": ("Студент покинул вкладку теста", 1),
    "exit_fullscreen": ("Студент вышел из полноэкранного режима", 1),
    "app_minimized": ("Окно приложения потеряло фокус", 1),
    "key_violation": ("Запрещённая комбинация клавиш (попытка скриншота/копирования)", 1),
    "screenshot_tool_detected": ("Обнаружена утилита создания скриншотов", 2),
}

# Benign telemetry that should NOT raise a teacher notification.
PROCTOR_EVENTS_SILENT: frozenset[str] = frozenset({"tab_focus", "webcam_snapshot"})


async def _notify_teacher_of_proctor_event(
    session: AsyncSession,
    sess: TestSession,
    student: CurrentUser,
    event: ProctorEvent,
) -> None:
    """Relay a proctoring event to the session's teacher as a notification.

    The previous implementation only persisted the ProctorEvent row, so the
    teacher never learned about violations (or a missing camera) unless they
    manually opened the proctor log. We now publish through `notify_teacher`,
    which both stores the notification and pushes it over the teacher's SSE
    stream (in-app toast + native OS notification).
    """
    event_type = event.event_type
    if event_type in PROCTOR_EVENTS_SILENT:
        return
    if not sess.teacher_id or sess.teacher_id <= 0:
        return

    title, severity = PROCTOR_EVENT_META.get(
        event_type, (f"Событие прокторинга: {event_type}", 1)
    )

    discipline_name = (await session.execute(
        select(Discipline.name).where(Discipline.discipline_id == sess.discipline_id)
    )).scalar_one_or_none() or "Тест"
    topic_name = None
    if sess.topic_id is not None:
        topic_name = (await session.execute(
            select(DisciplineTopic.name).where(DisciplineTopic.topic_id == sess.topic_id)
        )).scalar_one_or_none()

    discipline_label = discipline_name + (f" — {topic_name}" if topic_name else "")
    body = f"{student.full_name} — {discipline_label}"

    await notify_teacher(
        session,
        sess.teacher_id,
        "proctor_violation",
        title=title,
        body=body,
        link=f"/teacher/students/{student.id}",
        meta={
            "session_id": sess.session_id,
            "student_id": student.id,
            "student_name": student.full_name,
            "discipline_name": discipline_name,
            "topic_name": topic_name,
            "event_type": event_type,
            "event_metadata": event.metadata_json,
        },
        severity=severity,
    )

@router.post("/student/sessions/{session_id}/proctor-events", response_model=ProctorEventOut)
async def create_proctor_event(
    session_id: int,
    payload: ProctorEventIn,
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
) -> ProctorEventOut:
    # Check session exists and belongs to current user
    sess = (await session.execute(
        select(TestSession).where(TestSession.session_id == session_id)
    )).scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    if sess.student_id != user.id:
        raise HTTPException(status_code=403, detail="Session does not belong to you")
    if sess.status != "in_progress":
        raise HTTPException(status_code=400, detail="Session is not in progress")
        
    event = ProctorEvent(
        session_id=session_id,
        event_type=payload.event_type,
        metadata_json=payload.metadata,
    )
    session.add(event)
    await session.flush()
    await session.refresh(event)

    # Relay the event to the teacher (in-app + OS notification via SSE). Kept in
    # the same transaction so the notification and the event commit atomically.
    await _notify_teacher_of_proctor_event(session, sess, user, event)

    await session.commit()
    await session.refresh(event)
    return ProctorEventOut(
        event_id=event.event_id,
        session_id=event.session_id,
        event_type=event.event_type,
        metadata=event.metadata_json,
        created_at=event.created_at
    )

@router.post("/student/sessions/{session_id}/webcam-snapshot")
async def upload_webcam_snapshot(
    session_id: int,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_student),
    session: AsyncSession = Depends(get_session),
):
    # Check session exists and belongs to current user
    sess = (await session.execute(
        select(TestSession).where(TestSession.session_id == session_id)
    )).scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    if sess.student_id != user.id:
        raise HTTPException(status_code=403, detail="Session does not belong to you")
    if sess.status != "in_progress":
        raise HTTPException(status_code=400, detail="Session is not in progress")
        
    data = await file.read()
    try:
        storage_key = save_proctor_snapshot(session_id, data, file.filename, file.content_type)
    except ImageValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
        
    # Create event with placeholder
    event = ProctorEvent(
        session_id=session_id,
        event_type="webcam_snapshot",
        metadata_json={
            "storage_key": storage_key,
            "photo_url": "/api/v2/proctor-snapshots/placeholder"
        }
    )
    session.add(event)
    await session.commit()
    await session.refresh(event)
    
    # Update photo_url with actual event ID
    event.metadata_json = {
        "storage_key": storage_key,
        "photo_url": f"/api/v2/proctor-snapshots/{event.event_id}"
    }
    await session.commit()
    await session.refresh(event)
    
    return {
        "ok": True,
        "event_id": event.event_id,
        "photo_url": f"/api/v2/proctor-snapshots/{event.event_id}"
    }

@router.get("/teacher/sessions/{session_id}/proctor-log", response_model=ProctorLogOut)
async def get_proctor_log(
    session_id: int,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> ProctorLogOut:
    # load session
    sess = (await session.execute(
        select(TestSession).where(TestSession.session_id == session_id)
    )).scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
        
    # auth check: teacher must teach the discipline of the session, or user must be admin
    if user.role == "teacher":
        owned = (await session.execute(
            text("SELECT COUNT(*) FROM teacher_disciplines WHERE teacher_id = :tid AND discipline_id = :did"),
            {"tid": user.id, "did": sess.discipline_id}
        )).scalar_one()
        if not owned:
            raise HTTPException(status_code=403, detail="Not authorized to access this session's proctor log")
            
    # fetch policy to get proctor level
    policy = (await session.execute(
        select(AttemptsPolicy).where(
            AttemptsPolicy.teacher_id == sess.teacher_id,
            AttemptsPolicy.discipline_id == sess.discipline_id
        )
    )).scalar_one_or_none()
    proctor_level = policy.proctor_min_level if policy else 0
    
    # fetch events chronologically
    events_rows = (await session.execute(
        select(ProctorEvent)
        .where(ProctorEvent.session_id == session_id)
        .order_by(ProctorEvent.created_at.asc())
    )).scalars().all()
    
    return ProctorLogOut(
        session_id=session_id,
        proctor_level=proctor_level,
        events=[
            ProctorEventOut(
                event_id=e.event_id,
                session_id=e.session_id,
                event_type=e.event_type,
                metadata=e.metadata_json,
                created_at=e.created_at
            ) for e in events_rows
        ]
    )

@router.get("/proctor-snapshots/{event_id}")
async def get_proctor_snapshot(
    event_id: int,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> FileResponse:
    # load event
    event = (await session.execute(
        select(ProctorEvent).where(ProctorEvent.event_id == event_id)
    )).scalar_one_or_none()
    if not event or event.event_type != "webcam_snapshot":
        raise HTTPException(status_code=404, detail="Snapshot not found")
    
    # load session
    sess = (await session.execute(
        select(TestSession).where(TestSession.session_id == event.session_id)
    )).scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # auth check
    if user.role == "student":
        if sess.student_id != user.id:
            raise HTTPException(status_code=403, detail="Access denied")
    elif user.role == "teacher":
        owned = (await session.execute(
            text("SELECT COUNT(*) FROM teacher_disciplines WHERE teacher_id = :tid AND discipline_id = :did"),
            {"tid": user.id, "did": sess.discipline_id}
        )).scalar_one()
        if not owned:
            raise HTTPException(status_code=403, detail="Access denied")
    elif user.role == "admin":
        pass
    else:
        raise HTTPException(status_code=403, detail="Role not authorized")
        
    meta = event.metadata_json or {}
    storage_key = meta.get("storage_key")
    if not storage_key:
        raise HTTPException(status_code=404, detail="Snapshot file metadata not found")
        
    path = storage_path(storage_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Snapshot file not found")
        
    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "private, max-age=86400"
        }
    )
