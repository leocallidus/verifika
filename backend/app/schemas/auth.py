from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, model_validator


from app.schemas.profile_branding import ClientInfo


class LoginRequest(BaseModel):
    """
    Принимает ЛИБО email, ЛИБО логин.
    Поле `email` оставлено как алиас для `identifier` ради обратной совместимости.
    """
    identifier: Optional[str] = Field(default=None, min_length=1, max_length=255)
    email: Optional[EmailStr] = Field(default=None)
    password: str = Field(min_length=4, max_length=128)
    client_info: Optional[ClientInfo] = None

    @model_validator(mode="after")
    def _ensure_identifier(self) -> "LoginRequest":
        ident = self.identifier or self.email
        if not ident or not ident.strip():
            raise ValueError("identifier or email is required")
        self.identifier = ident.strip()
        return self


class UserOut(BaseModel):
    id: int
    full_name: str
    role: str
    email: EmailStr
    group_id: Optional[int] = None
    login: Optional[str] = None
    avatar_url: Optional[str] = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    auth_session_id: Optional[str] = None
    user: UserOut
