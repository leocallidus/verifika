from __future__ import annotations

from datetime import datetime
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


RoleLiteral = Literal["student", "teacher", "admin"]


class AdminUserOut(BaseModel):
    id: int
    role: RoleLiteral
    login: str
    email: EmailStr
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    middle_name: Optional[str] = None
    full_name: str
    department: Optional[str] = None
    group_id: Optional[int] = None
    group_name: Optional[str] = None
    archived: bool = False
    requires_totp: bool = False
    created_at: Optional[datetime] = None


class AdminUserListOut(BaseModel):
    items: List[AdminUserOut]
    total: int
    page: int
    page_size: int


class AdminUserPatch(BaseModel):
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    middle_name: Optional[str] = Field(default=None, max_length=100)
    email: Optional[EmailStr] = None
    login: Optional[str] = Field(default=None, min_length=1, max_length=64)
    department: Optional[str] = Field(default=None, max_length=150)
    group_id: Optional[int] = None


class AdminUserCreate(BaseModel):
    role: RoleLiteral
    login: str = Field(min_length=1, max_length=64)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    middle_name: Optional[str] = Field(default=None, max_length=100)
    department: Optional[str] = Field(default=None, max_length=150)
    group_id: Optional[int] = None

    @field_validator("role")
    @classmethod
    def _role_check(cls, value: str) -> str:
        if value == "admin":
            raise ValueError("use /api/admin/users/admins to create admins")
        return value


class AdminUserCreateAdmin(BaseModel):
    login: str = Field(min_length=1, max_length=64)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    middle_name: Optional[str] = Field(default=None, max_length=100)
    department: Optional[str] = Field(default=None, max_length=150)


class AdminUserRoleIn(BaseModel):
    role: RoleLiteral
    confirm: Optional[str] = None  # used for self-demotion: full login
    reason: Optional[str] = Field(default=None, max_length=500)


class AdminUserTransferGroupIn(BaseModel):
    target_group_id: int


class AdminUserResetPasswordOut(BaseModel):
    user_id: int
    role: RoleLiteral
    new_password: str


class AdminUserSessionsOut(BaseModel):
    sessions: List[dict]


# ----- groups / disciplines ------------------------------------------------

class AdminGroupOut(BaseModel):
    group_id: int
    name: str
    admission_year: Optional[int] = None
    students_count: int = 0
    archived: bool = False


class AdminGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    admission_year: Optional[int] = Field(default=None, ge=1900, le=2100)


class AdminGroupPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=50)
    admission_year: Optional[int] = Field(default=None, ge=1900, le=2100)


class AdminDisciplineOut(BaseModel):
    discipline_id: int
    name: str
    description: Optional[str] = None
    credits: Optional[int] = None
    total_hours: Optional[int] = None
    teachers_count: int = 0
    topics_count: int = 0
    questions_count: int = 0
    archived: bool = False
    created_at: Optional[datetime] = None


class AdminDisciplineCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: Optional[str] = None
    credits: Optional[int] = Field(default=None, ge=0, le=100)
    total_hours: Optional[int] = Field(default=None, ge=0, le=10000)


class AdminDisciplinePatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    description: Optional[str] = None
    credits: Optional[int] = Field(default=None, ge=0, le=100)
    total_hours: Optional[int] = Field(default=None, ge=0, le=10000)


class AdminAssignTeacherIn(BaseModel):
    teacher_id: int


class AdminAssignGroupIn(BaseModel):
    group_id: int


class AdminAssignStudentIn(BaseModel):
    student_id: int


class AdminDisciplineAssignmentOut(BaseModel):
    discipline_id: int
    target_type: Literal["group", "student"]
    target_id: int
    target_name: str
    assigned_at: datetime


class AdminAssignmentTeacherOut(BaseModel):
    teacher_id: int
    full_name: str
    department: Optional[str] = None
    assigned_at: datetime


class AdminAssignmentGroupOut(BaseModel):
    group_id: int
    name: str
    students_count: int = 0
    assigned_at: datetime


class AdminAssignmentStudentOut(BaseModel):
    student_id: int
    full_name: str
    group_id: Optional[int] = None
    group_name: Optional[str] = None
    assigned_at: datetime


class AdminAssignmentMatrixRowOut(BaseModel):
    discipline_id: int
    discipline_name: str
    archived: bool = False
    teachers: List[AdminAssignmentTeacherOut] = Field(default_factory=list)
    groups: List[AdminAssignmentGroupOut] = Field(default_factory=list)
    students: List[AdminAssignmentStudentOut] = Field(default_factory=list)
    effective_students_count: int = 0
    has_teacher: bool = False
    has_student_access: bool = False


class AdminAssignmentMatrixOut(BaseModel):
    rows: List[AdminAssignmentMatrixRowOut] = Field(default_factory=list)


# ----- events / audit ------------------------------------------------------

class AdminEventOut(BaseModel):
    notification_id: int
    user_role: Optional[str] = None
    user_id: Optional[int] = None
    event_type: str
    severity: int
    channel: str
    payload: Optional[dict] = None
    metadata: Optional[dict] = None
    created_at: datetime


class AdminEventListOut(BaseModel):
    items: List[AdminEventOut]
    total: int
    page: int
    page_size: int


class AdminAuditOut(BaseModel):
    log_id: int
    actor_role: Optional[str] = None
    actor_id: Optional[int] = None
    action: str
    target: Optional[str] = None
    target_type: Optional[str] = None
    target_id: Optional[int] = None
    ip_addr: Optional[str] = None
    reason: Optional[str] = None
    metadata: Optional[dict] = None
    before_json: Optional[dict] = None
    after_json: Optional[dict] = None
    created_at: datetime


class AdminAuditListOut(BaseModel):
    items: List[AdminAuditOut]
    total: int
    page: int
    page_size: int


# ----- sessions -----------------------------------------------------------

class AdminActiveSessionOut(BaseModel):
    session_id: int
    student_id: int
    student_name: str
    discipline_id: int
    discipline_name: str
    topic_id: Optional[int] = None
    topic_name: Optional[str] = None
    teacher_id: int
    teacher_name: str
    started_at: datetime
    last_seen_at: Optional[datetime] = None
    status: str
    questions_total: int = 0
    questions_answered: int = 0


class AdminActiveSessionListOut(BaseModel):
    items: List[AdminActiveSessionOut]
    total: int


class AdminForceFinishIn(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class AdminOverrideScoreIn(BaseModel):
    score: int = Field(ge=0)
    reason: Optional[str] = Field(default=None, max_length=500)


# ----- health / stats -----------------------------------------------------

class AdminHealthOut(BaseModel):
    db_ok: bool
    last_migration: Optional[str] = None
    notifications_count: int
    audit_count: int
    active_sessions_count: int
    db_latency_ms: Optional[float] = None
    sse_connections_count: int = 0
    ai_enabled: bool = False
    ai_ok: bool = False
    ai_latency_ms: Optional[float] = None
    ai_model: Optional[str] = None
    ai_generation_tasks: Optional[dict[str, int]] = None
    api_response_stats: Optional[dict[str, float]] = None
    recent_errors: Optional[list[dict]] = None



class AdminStatsSummaryOut(BaseModel):
    users_total: int
    students_total: int
    teachers_total: int
    admins_total: int
    groups_total: int
    disciplines_total: int
    active_sessions: int
    attempts_last_24h: int
    avg_score_last_24h: Optional[float] = None


class AdminDisciplineStat(BaseModel):
    discipline_id: int
    name: str
    attempts: int
    avg_score: Optional[float] = None


class AdminTopErrorQuestion(BaseModel):
    question_id: int
    text: str
    discipline_id: int
    discipline_name: str
    attempts: int
    incorrect_pct: float


class AdminEnvInfoOut(BaseModel):
    app_version: str
    python_version: str
    database_url_masked: str
    alembic_revision: Optional[str] = None
    ai_enabled: bool
    ai_base_url: str
    ai_chat_model: str
    ai_generation_model: str
    log_level: str
    cors_origins: List[str]
    jwt_expire_minutes: int
    smtp_configured: bool
    upload_dir: str
    bcrypt_rounds: int
