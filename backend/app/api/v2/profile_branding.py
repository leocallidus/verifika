from __future__ import annotations

import io
import os
import uuid
import hashlib
import json
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request, status
from fastapi.responses import FileResponse, Response
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from PIL import Image

from app.core.deps import CurrentUser, get_current_user, oauth2
from app.db.session import get_session
from app.db.models import (
    UserAvatarImage,
    AuthSession,
    BrandingAsset,
    AppBrandingSettings,
    Student,
    Teacher,
    Admin,
)
from app.schemas.profile_branding import (
    ProfileMeOut,
    UserProfileOut,
    UserAvatarOut,
    UserAvatarsListOut,
    AuthSessionOut,
    AuthSessionsListOut,
    PublicBrandingOut,
    BrandingAssetOut,
    AdminBrandingOut,
)
from app.services.audit_trail import client_ip, record_audit

router = APIRouter(prefix="/profile-branding", tags=["v2.profile_branding"])

UPLOAD_DIR_AVATARS = "uploads/avatars"
UPLOAD_DIR_BRANDING = "uploads/branding"

def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# ==============================================================================
# 1. PUBLIC BRANDING ENDPOINTS
# ==============================================================================

@router.get("/public/branding", response_model=PublicBrandingOut)
async def get_public_branding(session: AsyncSession = Depends(get_session)) -> PublicBrandingOut:
    res = await session.execute(select(AppBrandingSettings).where(AppBrandingSettings.settings_id == 1))
    settings = res.scalar_one_or_none()
    if not settings:
        return PublicBrandingOut(
            app_name="Верифика",
            topbar_logo_url=None,
            institution_logo_url="/collegelogo.jpg",
            institution_logo_enabled=True,
            institution_logo_display_size_px=56,
            login_banner_url=None,
            login_banner_enabled=False,
            updated_at=datetime.now(timezone.utc)
        )
    
    topbar_logo_url = f"/api/v2/profile-branding/public/branding-assets/{settings.topbar_logo_asset_id}" if settings.topbar_logo_asset_id else None
    inst_logo_url = f"/api/v2/profile-branding/public/branding-assets/{settings.institution_logo_asset_id}" if settings.institution_logo_asset_id else "/collegelogo.jpg"
    banner_url = f"/api/v2/profile-branding/public/branding-assets/{settings.login_banner_asset_id}" if settings.login_banner_asset_id else None
    
    return PublicBrandingOut(
        app_name=settings.app_name,
        topbar_logo_url=topbar_logo_url,
        institution_logo_url=inst_logo_url,
        institution_logo_enabled=settings.institution_logo_enabled,
        institution_logo_display_size_px=settings.institution_logo_display_size_px,
        login_banner_url=banner_url,
        login_banner_enabled=settings.login_banner_enabled,
        updated_at=settings.updated_at
    )

@router.get("/public/branding-assets/{asset_id}")
async def get_branding_asset(asset_id: int, session: AsyncSession = Depends(get_session)):
    res = await session.execute(
        select(BrandingAsset).where(BrandingAsset.asset_id == asset_id, BrandingAsset.archived_at.is_(None))
    )
    asset = res.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Branding asset not found")
    
    file_path = os.path.join(UPLOAD_DIR_BRANDING, asset.asset_kind, asset.storage_key)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Asset file not found on disk")
        
    return FileResponse(
        file_path,
        media_type=asset.content_type,
        headers={
            "Cache-Control": "public, max-age=86400",
            "ETag": f'"{asset.sha256_hex}"'
        }
    )

# ==============================================================================
# 2. PROFILE & SESSIONS ENDPOINTS
# ==============================================================================

from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.exc import IntegrityError

class ProfileUpdateIn(BaseModel):
    login: Optional[str] = Field(default=None, min_length=1, max_length=64)
    email: Optional[EmailStr] = None

@router.get("/me", response_model=ProfileMeOut)
async def get_profile_me(
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
) -> ProfileMeOut:
    user_out = UserProfileOut(
        id=user.id,
        role=user.role,
        full_name=user.full_name,
        email=user.email,
        login=user.login,
        group_id=user.group_id,
        avatar_url=user.avatar_url
    )
    
    role_details = {}
    if user.role == "teacher":
        res = await session.execute(select(Teacher.department).where(Teacher.teacher_id == user.id))
        dept = res.scalar_one_or_none()
        role_details = {"department": dept or ""}
        
    return ProfileMeOut(user=user_out, role_details=role_details)

@router.patch("/me", response_model=ProfileMeOut)
async def update_profile_me(
    payload: ProfileUpdateIn,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ProfileMeOut:
    if user.role == "student":
        res = await session.execute(select(Student).where(Student.student_id == user.id))
        db_user = res.scalar_one_or_none()
    elif user.role == "teacher":
        res = await session.execute(select(Teacher).where(Teacher.teacher_id == user.id))
        db_user = res.scalar_one_or_none()
    else:
        res = await session.execute(select(Admin).where(Admin.admin_id == user.id))
        db_user = res.scalar_one_or_none()

    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.login is not None:
        db_user.login = payload.login.lower()
    if payload.email is not None:
        db_user.email = payload.email

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail="User with this login or email already exists",
        ) from exc

    # Refresh current user
    user_out = UserProfileOut(
        id=user.id,
        role=user.role,
        full_name=user.full_name,
        email=db_user.email,
        login=db_user.login,
        group_id=user.group_id,
        avatar_url=user.avatar_url
    )

    role_details = {}
    if user.role == "teacher":
        role_details = {"department": db_user.department or ""}

    return ProfileMeOut(user=user_out, role_details=role_details)

@router.get("/avatars", response_model=UserAvatarsListOut)
async def get_avatars_list(
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
) -> UserAvatarsListOut:
    res = await session.execute(
        select(UserAvatarImage)
        .where(
            UserAvatarImage.user_role == user.role,
            UserAvatarImage.user_id == user.id,
            UserAvatarImage.deleted_at.is_(None)
        )
        .order_by(UserAvatarImage.created_at.desc())
    )
    items = res.scalars().all()
    
    out_items = [
        UserAvatarOut(
            avatar_id=item.avatar_id,
            url=f"/api/v2/profile-branding/avatars/{item.avatar_id}",
            is_active=item.is_active,
            created_at=item.created_at
        )
        for item in items
    ]
    return UserAvatarsListOut(items=out_items, limit=12)

@router.post("/avatars", response_model=UserAvatarOut)
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    crop_json: Optional[str] = Form(None),
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
) -> UserAvatarOut:
    # 1. Validate file type and size (max 5MB)
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(status_code=400, detail="Unsupported image format. Use JPEG, PNG or WebP.")
        
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Avatar file size exceeds 5MB limit.")
        
    # 2. Process image with PIL
    try:
        img = Image.open(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid or corrupt image file.") from e
        
    # Check dimensions
    if img.width < 128 or img.height < 128 or img.width > 4096 or img.height > 4096:
        raise HTTPException(status_code=400, detail="Image dimensions must be between 128x128 and 4096x4096px.")
        
    # Apply crop if provided
    if crop_json:
        try:
            crop_data = json.loads(crop_json)
            x = int(crop_data.get("x", 0))
            y = int(crop_data.get("y", 0))
            w = int(crop_data.get("width", img.width))
            h = int(crop_data.get("height", img.height))
            img = img.crop((x, y, x + w, y + h))
        except Exception:
            pass
            
    # Resize to 256x256
    img = img.resize((256, 256), Image.Resampling.LANCZOS)
    
    # Save to WebP
    out_buf = io.BytesIO()
    img.save(out_buf, format="WEBP", quality=90)
    webp_data = out_buf.getvalue()
    sha256 = hashlib.sha256(webp_data).hexdigest()
    
    # Save file to disk
    user_dir = os.path.join(UPLOAD_DIR_AVATARS, user.role, str(user.id))
    os.makedirs(user_dir, exist_ok=True)
    filename = f"{uuid.uuid4()}.webp"
    file_path = os.path.join(user_dir, filename)
    
    with open(file_path, "wb") as f:
        f.write(webp_data)
        
    # 3. Save to DB
    # Deactivate previous avatars
    await session.execute(
        update(UserAvatarImage)
        .where(UserAvatarImage.user_role == user.role, UserAvatarImage.user_id == user.id)
        .values(is_active=False)
    )
    
    new_avatar = UserAvatarImage(
        user_role=user.role,
        user_id=user.id,
        storage_key=os.path.join(user.role, str(user.id), filename),
        original_name=file.filename,
        content_type="image/webp",
        size_bytes=len(webp_data),
        width_px=256,
        height_px=256,
        sha256_hex=sha256,
        crop_json=json.loads(crop_json) if crop_json else None,
        is_active=True
    )
    session.add(new_avatar)
    await session.flush()
    
    # Keep only the last 12 avatars, delete older ones
    res = await session.execute(
        select(UserAvatarImage)
        .where(
            UserAvatarImage.user_role == user.role,
            UserAvatarImage.user_id == user.id,
            UserAvatarImage.deleted_at.is_(None)
        )
        .order_by(UserAvatarImage.created_at.desc())
    )
    all_avatars = res.scalars().all()
    if len(all_avatars) > 12:
        for old_av in all_avatars[12:]:
            old_av.deleted_at = datetime.now(timezone.utc)
            old_av.is_active = False
            session.add(old_av)
            # Delete file
            old_path = os.path.join(UPLOAD_DIR_AVATARS, old_av.storage_key)
            if os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except OSError:
                    pass
                    
    await record_audit(
        session,
        actor_role=user.role,
        actor_id=user.id,
        action="avatar_uploaded",
        target_type="avatar",
        target_id=new_avatar.avatar_id,
        ip_addr=client_ip(request)
    )
    await session.commit()
    
    return UserAvatarOut(
        avatar_id=new_avatar.avatar_id,
        url=f"/api/v2/profile-branding/avatars/{new_avatar.avatar_id}",
        is_active=True,
        created_at=new_avatar.created_at
    )

@router.post("/avatars/{avatar_id}/activate", response_model=UserAvatarOut)
async def activate_avatar(
    avatar_id: int,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
) -> UserAvatarOut:
    res = await session.execute(
        select(UserAvatarImage).where(
            UserAvatarImage.avatar_id == avatar_id,
            UserAvatarImage.user_role == user.role,
            UserAvatarImage.user_id == user.id,
            UserAvatarImage.deleted_at.is_(None)
        )
    )
    avatar = res.scalar_one_or_none()
    if not avatar:
        raise HTTPException(status_code=404, detail="Avatar not found or not owned by you")
        
    await session.execute(
        update(UserAvatarImage)
        .where(UserAvatarImage.user_role == user.role, UserAvatarImage.user_id == user.id)
        .values(is_active=False)
    )
    
    avatar.is_active = True
    session.add(avatar)
    
    await record_audit(
        session,
        actor_role=user.role,
        actor_id=user.id,
        action="avatar_activated",
        target_type="avatar",
        target_id=avatar_id,
        ip_addr=client_ip(request)
    )
    await session.commit()
    
    return UserAvatarOut(
        avatar_id=avatar.avatar_id,
        url=f"/api/v2/profile-branding/avatars/{avatar.avatar_id}",
        is_active=True,
        created_at=avatar.created_at
    )

@router.delete("/avatars/{avatar_id}", status_code=204)
async def delete_avatar(
    avatar_id: int,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    res = await session.execute(
        select(UserAvatarImage).where(
            UserAvatarImage.avatar_id == avatar_id,
            UserAvatarImage.user_role == user.role,
            UserAvatarImage.user_id == user.id,
            UserAvatarImage.deleted_at.is_(None)
        )
    )
    avatar = res.scalar_one_or_none()
    if not avatar:
        raise HTTPException(status_code=404, detail="Avatar not found or not owned by you")
        
    avatar.deleted_at = datetime.now(timezone.utc)
    avatar.is_active = False
    session.add(avatar)
    
    # Delete file from disk
    file_path = os.path.join(UPLOAD_DIR_AVATARS, avatar.storage_key)
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError:
            pass
            
    # Set the next freshest avatar as active if any
    res_next = await session.execute(
        select(UserAvatarImage)
        .where(
            UserAvatarImage.user_role == user.role,
            UserAvatarImage.user_id == user.id,
            UserAvatarImage.deleted_at.is_(None)
        )
        .order_by(UserAvatarImage.created_at.desc())
        .limit(1)
    )
    next_active = res_next.scalar_one_or_none()
    if next_active:
        next_active.is_active = True
        session.add(next_active)
        
    await record_audit(
        session,
        actor_role=user.role,
        actor_id=user.id,
        action="avatar_deleted",
        target_type="avatar",
        target_id=avatar_id,
        ip_addr=client_ip(request)
    )
    await session.commit()
    return Response(status_code=204)

@router.get("/avatars/{avatar_id}")
async def get_avatar_file(
    avatar_id: int,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    res = await session.execute(
        select(UserAvatarImage).where(UserAvatarImage.avatar_id == avatar_id)
    )
    avatar = res.scalar_one_or_none()
    if not avatar:
        raise HTTPException(status_code=404, detail="Avatar not found")
        
    file_path = os.path.join(UPLOAD_DIR_AVATARS, avatar.storage_key)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Avatar file not found on disk")
        
    return FileResponse(
        file_path,
        media_type=avatar.content_type,
        headers={
            "Cache-Control": "private, max-age=86400",
            "ETag": f'"{avatar.sha256_hex}"'
        }
    )

@router.get("/sessions", response_model=AuthSessionsListOut)
async def get_sessions(
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    token: str = Depends(oauth2)
) -> AuthSessionsListOut:
    from app.core.security import decode_token
    payload = decode_token(token)
    current_sid = payload.get("sid")
    
    res = await session.execute(
        select(AuthSession)
        .where(
            AuthSession.user_role == user.role,
            AuthSession.user_id == user.id,
            AuthSession.revoked_at.is_(None)
        )
        .order_by(AuthSession.last_seen_at.desc())
    )
    sessions = res.scalars().all()
    
    out_sessions = []
    for s in sessions:
        # Mask IP
        ip_str = str(s.ip_addr) if s.ip_addr else "127.0.0.1"
        parts = ip_str.split(".")
        if len(parts) == 4:
            masked_ip = f"{parts[0]}.{parts[1]}.{parts[2]}.*"
        else:
            masked_ip = "Unknown IP"
            
        location = "Не определено"
        if s.geo_city and s.geo_city != "Не определено":
            location = f"{s.geo_city}, {s.geo_region or ''}"
            
        out_sessions.append(
            AuthSessionOut(
                auth_session_id=str(s.auth_session_id),
                is_current=str(s.auth_session_id) == current_sid,
                client_kind=s.client_kind,
                device_name=s.device_name,
                os_name=s.os_name,
                os_version=s.os_version,
                browser_name=s.browser_name,
                browser_version=s.browser_version,
                app_version=s.app_version,
                location_label=location,
                ip_addr_masked=masked_ip,
                created_at=s.created_at,
                last_seen_at=s.last_seen_at,
                expires_at=s.expires_at
            )
        )
    return AuthSessionsListOut(items=out_sessions)

@router.delete("/sessions/{auth_session_id}", status_code=204)
async def revoke_session(
    auth_session_id: str,
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    try:
        session_uuid = uuid.UUID(auth_session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID format")
        
    res = await session.execute(
        select(AuthSession).where(
            AuthSession.auth_session_id == session_uuid,
            AuthSession.user_role == user.role,
            AuthSession.user_id == user.id
        )
    )
    db_sess = res.scalar_one_or_none()
    if not db_sess:
        raise HTTPException(status_code=404, detail="Session not found")
        
    db_sess.revoked_at = datetime.now(timezone.utc)
    db_sess.revoked_reason = "user_request"
    session.add(db_sess)
    
    await record_audit(
        session,
        actor_role=user.role,
        actor_id=user.id,
        action="auth_session_revoked",
        target_type="auth_session",
        target_id=None,
        ip_addr=client_ip(request),
        metadata={"revoked_session_id": auth_session_id}
    )
    await session.commit()
    return Response(status_code=204)

@router.delete("/sessions", response_model=dict)
async def revoke_all_sessions(
    request: Request,
    include_current: bool = False,
    user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    token: str = Depends(oauth2)
):
    from app.core.security import decode_token
    payload = decode_token(token)
    current_sid = payload.get("sid")
    
    query = select(AuthSession).where(
        AuthSession.user_role == user.role,
        AuthSession.user_id == user.id,
        AuthSession.revoked_at.is_(None)
    )
    res = await session.execute(query)
    all_sessions = res.scalars().all()
    
    revoked_count = 0
    current_revoked = False
    
    for s in all_sessions:
        is_curr = str(s.auth_session_id) == current_sid
        if is_curr and not include_current:
            continue
            
        s.revoked_at = datetime.now(timezone.utc)
        s.revoked_reason = "revoke_all"
        session.add(s)
        revoked_count += 1
        if is_curr:
            current_revoked = True
            
    await record_audit(
        session,
        actor_role=user.role,
        actor_id=user.id,
        action="auth_sessions_revoked_all",
        target_type="auth_session",
        target_id=None,
        ip_addr=client_ip(request),
        metadata={"include_current": include_current, "revoked_count": revoked_count}
    )
    await session.commit()
    return {"revoked_count": revoked_count, "current_revoked": current_revoked}

# ==============================================================================
# 3. ADMIN BRANDING ENDPOINTS
# ==============================================================================

@router.get("/admin/branding", response_model=AdminBrandingOut)
async def get_admin_branding(
    admin: CurrentUser = Depends(require_admin),
    session: AsyncSession = Depends(get_session)
) -> AdminBrandingOut:
    res = await session.execute(select(AppBrandingSettings).where(AppBrandingSettings.settings_id == 1))
    settings = res.scalar_one_or_none()
    if not settings:
        settings = AppBrandingSettings(
            settings_id=1,
            app_name="Верифика",
            institution_logo_enabled=True,
            institution_logo_display_size_px=56,
        )
        session.add(settings)
        await session.commit()
        
    # Get active assets
    active_assets = {}
    for attr, key in [
        ("topbar_logo", settings.topbar_logo_asset_id),
        ("institution_logo", settings.institution_logo_asset_id),
        ("login_banner", settings.login_banner_asset_id),
    ]:
        if key:
            res_asset = await session.execute(select(BrandingAsset).where(BrandingAsset.asset_id == key))
            asset = res_asset.scalar_one_or_none()
            if asset:
                active_assets[attr] = BrandingAssetOut(
                    asset_id=asset.asset_id,
                    asset_kind=asset.asset_kind,
                    url=f"/api/v2/profile-branding/public/branding-assets/{asset.asset_id}",
                    content_type=asset.content_type,
                    size_bytes=asset.size_bytes,
                    width_px=asset.width_px,
                    height_px=asset.height_px,
                    display_width_px=asset.display_width_px,
                    display_height_px=asset.display_height_px,
                    original_name=asset.original_name,
                    created_at=asset.created_at
                )
            else:
                active_assets[attr] = None
        else:
            active_assets[attr] = None
            
    # Get recent assets (last 5 of each kind)
    recent_assets = {}
    for kind in ["topbar_logo", "institution_logo", "login_banner"]:
        res_rec = await session.execute(
            select(BrandingAsset)
            .where(BrandingAsset.asset_kind == kind, BrandingAsset.archived_at.is_(None))
            .order_by(BrandingAsset.created_at.desc())
            .limit(5)
        )
        assets = res_rec.scalars().all()
        recent_assets[kind] = [
            BrandingAssetOut(
                asset_id=a.asset_id,
                asset_kind=a.asset_kind,
                url=f"/api/v2/profile-branding/public/branding-assets/{a.asset_id}",
                content_type=a.content_type,
                size_bytes=a.size_bytes,
                width_px=a.width_px,
                height_px=a.height_px,
                display_width_px=a.display_width_px,
                display_height_px=a.display_height_px,
                original_name=a.original_name,
                created_at=a.created_at
            )
            for a in assets
        ]
        
    topbar_logo_url = f"/api/v2/profile-branding/public/branding-assets/{settings.topbar_logo_asset_id}" if settings.topbar_logo_asset_id else None
    inst_logo_url = f"/api/v2/profile-branding/public/branding-assets/{settings.institution_logo_asset_id}" if settings.institution_logo_asset_id else "/collegelogo.jpg"
    banner_url = f"/api/v2/profile-branding/public/branding-assets/{settings.login_banner_asset_id}" if settings.login_banner_asset_id else None

    return AdminBrandingOut(
        app_name=settings.app_name,
        institution_logo_enabled=settings.institution_logo_enabled,
        institution_logo_display_size_px=settings.institution_logo_display_size_px,
        login_banner_enabled=settings.login_banner_enabled,
        topbar_logo_asset_id=settings.topbar_logo_asset_id,
        institution_logo_asset_id=settings.institution_logo_asset_id,
        login_banner_asset_id=settings.login_banner_asset_id,
        active_assets=active_assets,
        recent_assets=recent_assets
    )

@router.patch("/admin/branding", response_model=PublicBrandingOut)
async def update_branding_settings(
    payload: dict,
    request: Request,
    admin: CurrentUser = Depends(require_admin),
    session: AsyncSession = Depends(get_session)
) -> PublicBrandingOut:
    res = await session.execute(select(AppBrandingSettings).where(AppBrandingSettings.settings_id == 1))
    settings = res.scalar_one_or_none()
    if not settings:
        settings = AppBrandingSettings(settings_id=1)
        session.add(settings)
        
    before = {
        "app_name": settings.app_name,
        "institution_logo_enabled": settings.institution_logo_enabled,
        "institution_logo_display_size_px": settings.institution_logo_display_size_px,
        "login_banner_enabled": settings.login_banner_enabled,
        "topbar_logo_asset_id": settings.topbar_logo_asset_id,
        "institution_logo_asset_id": settings.institution_logo_asset_id,
        "login_banner_asset_id": settings.login_banner_asset_id,
    }
    
    if "app_name" in payload:
        name = str(payload["app_name"]).strip()
        if len(name) < 2 or len(name) > 80:
            raise HTTPException(status_code=400, detail="App name must be between 2 and 80 characters")
        settings.app_name = name
        
    if "institution_logo_display_size_px" in payload:
        size = int(payload["institution_logo_display_size_px"])
        if size < 40 or size > 96:
            raise HTTPException(status_code=400, detail="Logo display size must be between 40 and 96 px")
        settings.institution_logo_display_size_px = size

    if "institution_logo_enabled" in payload:
        settings.institution_logo_enabled = bool(payload["institution_logo_enabled"])
        
    if "login_banner_enabled" in payload:
        settings.login_banner_enabled = bool(payload["login_banner_enabled"])
        
    for field in ["topbar_logo_asset_id", "institution_logo_asset_id", "login_banner_asset_id"]:
        if field in payload:
            val = payload[field]
            if val is None:
                setattr(settings, field, None)
            else:
                asset_id = int(val)
                # Verify asset exists and matches kind
                res_asset = await session.execute(
                    select(BrandingAsset).where(BrandingAsset.asset_id == asset_id, BrandingAsset.archived_at.is_(None))
                )
                asset = res_asset.scalar_one_or_none()
                if not asset:
                    raise HTTPException(status_code=400, detail=f"Asset #{asset_id} not found")
                
                expected_kind = field.replace("_asset_id", "")
                if asset.asset_kind != expected_kind:
                    raise HTTPException(status_code=400, detail=f"Asset #{asset_id} is not a {expected_kind}")
                    
                setattr(settings, field, asset_id)
                
    settings.updated_by_role = admin.role
    settings.updated_by_id = admin.id
    settings.updated_at = datetime.now(timezone.utc)
    session.add(settings)
    
    await record_audit(
        session,
        actor_role=admin.role,
        actor_id=admin.id,
        action="branding_updated",
        target_type="branding_settings",
        target_id=1,
        ip_addr=client_ip(request),
        before=before,
        after={
            "app_name": settings.app_name,
            "institution_logo_enabled": settings.institution_logo_enabled,
            "institution_logo_display_size_px": settings.institution_logo_display_size_px,
            "login_banner_enabled": settings.login_banner_enabled,
            "topbar_logo_asset_id": settings.topbar_logo_asset_id,
            "institution_logo_asset_id": settings.institution_logo_asset_id,
            "login_banner_asset_id": settings.login_banner_asset_id,
        }
    )
    await session.commit()
    
    topbar_logo_url = f"/api/v2/profile-branding/public/branding-assets/{settings.topbar_logo_asset_id}" if settings.topbar_logo_asset_id else None
    inst_logo_url = f"/api/v2/profile-branding/public/branding-assets/{settings.institution_logo_asset_id}" if settings.institution_logo_asset_id else "/collegelogo.jpg"
    banner_url = f"/api/v2/profile-branding/public/branding-assets/{settings.login_banner_asset_id}" if settings.login_banner_asset_id else None

    return PublicBrandingOut(
        app_name=settings.app_name,
        topbar_logo_url=topbar_logo_url,
        institution_logo_url=inst_logo_url,
        institution_logo_enabled=settings.institution_logo_enabled,
        institution_logo_display_size_px=settings.institution_logo_display_size_px,
        login_banner_url=banner_url,
        login_banner_enabled=settings.login_banner_enabled,
        updated_at=settings.updated_at
    )

@router.post("/admin/branding/assets/{asset_kind}", response_model=BrandingAssetOut)
async def upload_branding_asset(
    asset_kind: str,
    file: UploadFile = File(...),
    display_width_px: Optional[int] = Form(None),
    display_height_px: Optional[int] = Form(None),
    admin: CurrentUser = Depends(require_admin),
    session: AsyncSession = Depends(get_session)
) -> BrandingAssetOut:
    if asset_kind not in ("topbar_logo", "institution_logo", "login_banner"):
        raise HTTPException(status_code=400, detail="Invalid asset kind")
        
    if file.content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(status_code=400, detail="Unsupported image format. Use JPEG, PNG or WebP.")
        
    content = await file.read()
    
    # Size limits
    max_size = 2 * 1024 * 1024  # 2MB default
    if asset_kind == "login_banner":
        max_size = 8 * 1024 * 1024  # 8MB for banner
        
    if len(content) > max_size:
        raise HTTPException(status_code=400, detail=f"File size exceeds limit for {asset_kind}")
        
    try:
        img = Image.open(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid or corrupt image file.") from e
        
    # Dimension limits
    if asset_kind == "login_banner":
        if img.width < 800 or img.height < 240 or img.width > 4096 or img.height > 2048:
            raise HTTPException(status_code=400, detail="Login banner dimensions must be between 800x240 and 4096x2048px")
    else:
        if img.width < 64 or img.height < 64 or img.width > 2048 or img.height > 2048:
            raise HTTPException(status_code=400, detail="Logo dimensions must be between 64x64 and 2048x2048px")
            
    # Save as WebP
    out_buf = io.BytesIO()
    img.save(out_buf, format="WEBP", quality=90)
    webp_data = out_buf.getvalue()
    sha256 = hashlib.sha256(webp_data).hexdigest()
    
    # Write to disk
    kind_dir = os.path.join(UPLOAD_DIR_BRANDING, asset_kind)
    os.makedirs(kind_dir, exist_ok=True)
    filename = f"{uuid.uuid4()}.webp"
    file_path = os.path.join(kind_dir, filename)
    
    with open(file_path, "wb") as f:
        f.write(webp_data)
        
    # Save to DB
    new_asset = BrandingAsset(
        asset_kind=asset_kind,
        storage_key=filename,
        original_name=file.filename,
        content_type="image/webp",
        size_bytes=len(webp_data),
        width_px=img.width,
        height_px=img.height,
        display_width_px=display_width_px,
        display_height_px=display_height_px,
        sha256_hex=sha256,
        created_by_admin_id=admin.id
    )
    session.add(new_asset)
    await session.commit()
    await session.refresh(new_asset)
    
    return BrandingAssetOut(
        asset_id=new_asset.asset_id,
        asset_kind=new_asset.asset_kind,
        url=f"/api/v2/profile-branding/public/branding-assets/{new_asset.asset_id}",
        content_type=new_asset.content_type,
        size_bytes=new_asset.size_bytes,
        width_px=new_asset.width_px,
        height_px=new_asset.height_px,
        display_width_px=new_asset.display_width_px,
        display_height_px=new_asset.display_height_px,
        original_name=new_asset.original_name,
        created_at=new_asset.created_at
    )

@router.delete("/admin/branding/assets/{asset_id}", status_code=204)
async def delete_branding_asset(
    asset_id: int,
    request: Request,
    admin: CurrentUser = Depends(require_admin),
    session: AsyncSession = Depends(get_session)
):
    res = await session.execute(
        select(BrandingAsset).where(BrandingAsset.asset_id == asset_id, BrandingAsset.archived_at.is_(None))
    )
    asset = res.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Branding asset not found")
        
    # Check if currently active
    res_settings = await session.execute(select(AppBrandingSettings).where(AppBrandingSettings.settings_id == 1))
    settings = res_settings.scalar_one_or_none()
    if settings:
        if settings.topbar_logo_asset_id == asset_id:
            settings.topbar_logo_asset_id = None
        if settings.institution_logo_asset_id == asset_id:
            settings.institution_logo_asset_id = None
        if settings.login_banner_asset_id == asset_id:
            settings.login_banner_asset_id = None
        session.add(settings)
        
    asset.archived_at = datetime.now(timezone.utc)
    session.add(asset)
    
    # Delete file from disk
    file_path = os.path.join(UPLOAD_DIR_BRANDING, asset.asset_kind, asset.storage_key)
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError:
            pass
            
    await record_audit(
        session,
        actor_role=admin.role,
        actor_id=admin.id,
        action="branding_asset_archived",
        target_type="branding_asset",
        target_id=asset_id,
        ip_addr=client_ip(request)
    )
    await session.commit()
    return Response(status_code=204)
