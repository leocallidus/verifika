from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Dict
from pydantic import BaseModel, EmailStr, Field
import uuid

class ClientInfo(BaseModel):
    client_kind: str = "web"
    device_name: Optional[str] = None
    os_name: Optional[str] = None
    os_version: Optional[str] = None
    browser_name: Optional[str] = None
    browser_version: Optional[str] = None
    app_version: Optional[str] = None
    timezone: Optional[str] = None
    locale: Optional[str] = None

class UserProfileOut(BaseModel):
    id: int
    role: str
    full_name: str
    email: EmailStr
    login: Optional[str] = None
    group_id: Optional[int] = None
    avatar_url: Optional[str] = None

class ProfileMeOut(BaseModel):
    user: UserProfileOut
    role_details: dict = {}

class UserAvatarOut(BaseModel):
    avatar_id: int
    url: str
    is_active: bool
    created_at: datetime

class UserAvatarsListOut(BaseModel):
    items: List[UserAvatarOut]
    limit: int = 12

class AuthSessionOut(BaseModel):
    auth_session_id: str
    is_current: bool
    client_kind: str
    device_name: Optional[str] = None
    os_name: Optional[str] = None
    os_version: Optional[str] = None
    browser_name: Optional[str] = None
    browser_version: Optional[str] = None
    app_version: Optional[str] = None
    location_label: str
    ip_addr_masked: str
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime

class AuthSessionsListOut(BaseModel):
    items: List[AuthSessionOut]

class PublicBrandingOut(BaseModel):
    app_name: str = "Верифика"
    topbar_logo_url: Optional[str] = None
    institution_logo_url: Optional[str] = "/collegelogo.jpg"
    institution_logo_enabled: bool = True
    institution_logo_display_size_px: int = 56
    login_banner_url: Optional[str] = None
    login_banner_enabled: bool = False
    updated_at: datetime

class BrandingAssetOut(BaseModel):
    asset_id: int
    asset_kind: str
    url: str
    content_type: str
    size_bytes: int
    width_px: int
    height_px: int
    display_width_px: Optional[int] = None
    display_height_px: Optional[int] = None
    original_name: Optional[str] = None
    created_at: datetime

class AdminBrandingOut(BaseModel):
    app_name: str
    institution_logo_enabled: bool
    institution_logo_display_size_px: int
    login_banner_enabled: bool
    topbar_logo_asset_id: Optional[int] = None
    institution_logo_asset_id: Optional[int] = None
    login_banner_asset_id: Optional[int] = None
    active_assets: Dict[str, Optional[BrandingAssetOut]] = {}
    recent_assets: Dict[str, List[BrandingAssetOut]] = {}
