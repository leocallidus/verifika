"""Reference CRUD schemas for disciplines, groups, students."""
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

# ---------- Discipline ----------

class DisciplineIn(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: Optional[str] = Field(default=None, max_length=2000)
    total_hours: Optional[int] = Field(default=None, ge=1, le=2000)
    # backward-compatible credits field. Optional.
    credits: Optional[int] = Field(default=None, ge=1, le=60)
    # default policy knobs
    question_count: int = Field(default=10, ge=1, le=2000)
    time_limit_minutes: int = Field(default=20, ge=1, le=240)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        return " ".join(v.split())


class DisciplinePatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    description: Optional[str] = Field(default=None, max_length=2000)
    total_hours: Optional[int] = Field(default=None, ge=1, le=2000)
    credits: Optional[int] = Field(default=None, ge=1, le=60)
    question_count: Optional[int] = Field(default=None, ge=1, le=2000)
    time_limit_minutes: Optional[int] = Field(default=None, ge=1, le=240)


class DisciplineOut(BaseModel):
    discipline_id: int
    name: str
    description: Optional[str] = None
    credits: Optional[int] = None
    total_hours: Optional[int] = None
    question_count: int
    time_limit_minutes: int
    archived: bool
    student_count: int = 0
    teacher_names: List[str] = Field(default_factory=list)
    created_at: Optional[datetime] = None


# ---------- Group ----------

class GroupIn(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    admission_year: int = Field(ge=2000, le=2100)


class GroupPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=50)
    admission_year: Optional[int] = Field(default=None, ge=2000, le=2100)


class GroupOut(BaseModel):
    group_id: int
    name: str
    admission_year: int
    student_count: int
    archived: bool
    attempts_total: int = 0
    average_score: Optional[float] = None
    created_at: Optional[datetime] = None


# ---------- Student ----------

LOGIN_RE = r"^[a-z0-9._-]{3,64}$"


class StudentIn(BaseModel):
    last_name: str = Field(min_length=1, max_length=100)
    first_name: str = Field(min_length=1, max_length=100)
    middle_name: Optional[str] = Field(default=None, max_length=100)
    email: EmailStr
    login: Optional[str] = Field(default=None, max_length=64)
    group_id: int = Field(ge=1)
    initial_password: Optional[str] = Field(default=None, min_length=8, max_length=128)

    @field_validator("login")
    @classmethod
    def normalize_login(cls, v):
        if v is None:
            return None
        v = v.strip().lower()
        import re
        if not re.match(LOGIN_RE, v):
            raise ValueError("login может содержать только латиницу, цифры, . _ - (3..64)")
        return v


class StudentPatch(BaseModel):
    last_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    middle_name: Optional[str] = Field(default=None, max_length=100)
    email: Optional[EmailStr] = None
    login: Optional[str] = Field(default=None, max_length=64)
    group_id: Optional[int] = Field(default=None, ge=1)

    @field_validator("login")
    @classmethod
    def normalize_login(cls, v):
        if v is None:
            return None
        v = v.strip().lower()
        import re
        if not re.match(LOGIN_RE, v):
            raise ValueError("login может содержать только латиницу, цифры, . _ - (3..64)")
        return v


class StudentOut(BaseModel):
    student_id: int
    last_name: str
    first_name: str
    middle_name: Optional[str] = None
    full_name: str
    email: EmailStr
    login: str
    group_id: int
    group_name: Optional[str] = None
    enrollment_date: date
    sessions_count: int = 0
    average_score: Optional[float] = None
    archived: bool


class StudentWithPassword(StudentOut):
    one_time_password: str


# ---------- Bulk ----------

class EnrollBulkIn(BaseModel):
    student_ids: List[int] = Field(min_length=1, max_length=500)


class EnrollBulkOut(BaseModel):
    enrolled: int


class TransferAllIn(BaseModel):
    target_group_id: int = Field(ge=1)


class TransferAllOut(BaseModel):
    transferred: int


class StudentResetPasswordOut(BaseModel):
    student_id: int
    one_time_password: str
