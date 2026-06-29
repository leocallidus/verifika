from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, require_teacher
from app.db.models import AttemptsPolicy, TeacherDiscipline
from app.db.session import get_session
from app.schemas.v2 import PolicyIn, PolicyOut
from app.services.audit_trail import client_ip
from app.services.teacher_audit import audit as teacher_audit_log
from app.services.versioning import ensure_discipline_policy_version

router = APIRouter(prefix="/teacher/policy", tags=["v2.policy"])


async def _ensure_own_discipline(session: AsyncSession, teacher_id: int, discipline_id: int) -> None:
    row = (await session.execute(
        select(TeacherDiscipline).where(
            TeacherDiscipline.teacher_id == teacher_id,
            TeacherDiscipline.discipline_id == discipline_id,
        )
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=403, detail="not your discipline")


def _policy_snapshot(policy: AttemptsPolicy | None, discipline_id: int, teacher_id: int) -> dict | None:
    if policy is None:
        return None
    return {
        "teacher_id": teacher_id,
        "discipline_id": discipline_id,
        "available_from": policy.available_from,
        "available_until": policy.available_until,
        "attempts_allowed": policy.attempts_allowed,
        "shuffle_seed": policy.shuffle_seed,
        "show_correct_after_finish": policy.show_correct_after_finish,
        "proctor_min_level": policy.proctor_min_level,
    }


@router.get("/{discipline_id}", response_model=PolicyOut)
async def get_policy(
    discipline_id: int,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> PolicyOut:
    await _ensure_own_discipline(session, user.id, discipline_id)
    policy = (await session.execute(
        select(AttemptsPolicy).where(
            AttemptsPolicy.teacher_id == user.id,
            AttemptsPolicy.discipline_id == discipline_id,
        )
    )).scalar_one_or_none()
    if policy is None:
        return PolicyOut(
            teacher_id=user.id, discipline_id=discipline_id,
            available_from=None, available_until=None,
            attempts_allowed=1, shuffle_seed=True,
            show_correct_after_finish=True, proctor_min_level=0,
            updated_at=policy.updated_at if policy else None,  # type: ignore
        )
    return PolicyOut(
        teacher_id=policy.teacher_id, discipline_id=policy.discipline_id,
        available_from=policy.available_from, available_until=policy.available_until,
        attempts_allowed=policy.attempts_allowed,
        shuffle_seed=policy.shuffle_seed,
        show_correct_after_finish=policy.show_correct_after_finish,
        proctor_min_level=policy.proctor_min_level,
        updated_at=policy.updated_at,
    )


@router.put("/{discipline_id}", response_model=PolicyOut)
async def put_policy(
    discipline_id: int,
    payload: PolicyIn,
    request: Request,
    user: CurrentUser = Depends(require_teacher),
    session: AsyncSession = Depends(get_session),
) -> PolicyOut:
    await _ensure_own_discipline(session, user.id, discipline_id)
    if payload.available_from and payload.available_until and payload.available_from > payload.available_until:
        raise HTTPException(status_code=400, detail="available_from must be < available_until")
    policy = (await session.execute(
        select(AttemptsPolicy).where(
            AttemptsPolicy.teacher_id == user.id,
            AttemptsPolicy.discipline_id == discipline_id,
        )
    )).scalar_one_or_none()
    before = _policy_snapshot(policy, discipline_id, user.id)
    if policy is None:
        policy = AttemptsPolicy(
            teacher_id=user.id, discipline_id=discipline_id,
            available_from=payload.available_from,
            available_until=payload.available_until,
            attempts_allowed=payload.attempts_allowed,
            shuffle_seed=payload.shuffle_seed,
            show_correct_after_finish=payload.show_correct_after_finish,
            proctor_min_level=payload.proctor_min_level,
        )
        session.add(policy)
    else:
        policy.available_from = payload.available_from
        policy.available_until = payload.available_until
        policy.attempts_allowed = payload.attempts_allowed
        policy.shuffle_seed = payload.shuffle_seed
        policy.show_correct_after_finish = payload.show_correct_after_finish
        policy.proctor_min_level = payload.proctor_min_level
    await ensure_discipline_policy_version(
        session,
        teacher_id=user.id,
        discipline_id=discipline_id,
        created_by_teacher_id=user.id,
    )
    await teacher_audit_log(
        session,
        teacher_id=user.id,
        action="policy_created" if before is None else "policy_updated",
        target_type="discipline",
        target_id=discipline_id,
        before=before,
        after=_policy_snapshot(policy, discipline_id, user.id),
        ip_addr=client_ip(request),
    )
    await session.commit()
    await session.refresh(policy)
    return PolicyOut(
        teacher_id=policy.teacher_id, discipline_id=policy.discipline_id,
        available_from=policy.available_from, available_until=policy.available_until,
        attempts_allowed=policy.attempts_allowed,
        shuffle_seed=policy.shuffle_seed,
        show_correct_after_finish=policy.show_correct_after_finish,
        proctor_min_level=policy.proctor_min_level,
        updated_at=policy.updated_at,
    )
