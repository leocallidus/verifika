from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.question_image import QuestionImageOut
from app.schemas.student import StudentActivityItemOut


class OptionIn(BaseModel):
    option_number: int = Field(default=1, ge=1, le=4)
    text: str = Field(min_length=1, max_length=2000)
    is_correct: bool = False
    match_left: Optional[str] = None
    match_right: Optional[str] = None
    correct_position: Optional[int] = None  # used only for qtype='order'


class ClozeBlankIn(BaseModel):
    index: int = Field(ge=1, le=3)
    kind: str = Field(default="select")  # 'select' | 'input'
    options: Optional[List[str]] = None
    correct_index: Optional[int] = None
    acceptable_answers: Optional[List[str]] = None
    case_sensitive: bool = False
    trim_whitespace: bool = True
    normalize_universal: bool = True


class QuestionIn(BaseModel):
    discipline_id: int
    topic_id: Optional[int] = None
    text: str = Field(min_length=1)
    difficulty: int = Field(default=1, ge=1, le=5)
    qtype: str = Field(default="single")
    options: List[OptionIn] = Field(default_factory=list)
    tag_ids: List[int] = Field(default_factory=list)
    short_pattern: Optional[str] = None
    numeric_tolerance: Optional[float] = None
    match_pairs: Optional[list[dict]] = None
    # New variants
    acceptable_answers: Optional[List[str]] = None
    correct_bool: Optional[bool] = None
    explanation: Optional[str] = None
    case_sensitive: Optional[bool] = None
    trim_whitespace: Optional[bool] = None
    normalize_universal: Optional[bool] = None
    text_mode: Optional[str] = None
    allow_partial: Optional[bool] = None
    cloze_blanks: Optional[List[ClozeBlankIn]] = None
    # File upload settings
    file_allowed_types: Optional[List[str]] = None
    file_max_size_bytes: Optional[int] = Field(default=10_485_760, ge=1024, le=52_428_800)
    file_max_count: Optional[int] = Field(default=1, ge=1, le=5)
    points: Optional[float] = None


class QuestionOut(BaseModel):
    question_id: int
    discipline_id: int
    topic_id: Optional[int] = None
    text: str
    difficulty: int
    qtype: str = "single"
    short_pattern: Optional[str] = None
    numeric_tolerance: Optional[float] = None
    match_pairs: Optional[list[dict]] = None
    image: Optional[QuestionImageOut] = None
    acceptable_answers: List[str] = Field(default_factory=list)
    correct_bool: Optional[bool] = None
    explanation: Optional[str] = None
    case_sensitive: bool = False
    trim_whitespace: bool = True
    normalize_universal: bool = True
    text_mode: str = "string"
    allow_partial: bool = False
    cloze_blanks: List[dict] = Field(default_factory=list)
    file_allowed_types: Optional[List[str]] = None
    file_max_size_bytes: Optional[int] = None
    file_max_count: Optional[int] = None
    points: float = 1.0



class QuestionWithOptions(BaseModel):
    question_id: int
    discipline_id: int
    topic_id: Optional[int] = None
    topic_name: Optional[str] = None
    text: str
    difficulty: int
    qtype: str = "single"
    options: List[OptionIn]
    tags: List[str] = Field(default_factory=list)
    short_pattern: Optional[str] = None
    numeric_tolerance: Optional[float] = None
    match_pairs: Optional[list[dict]] = None
    image: Optional[QuestionImageOut] = None


class TestConfigIn(BaseModel):
    discipline_id: int
    time_limit_minutes: int = Field(ge=1, le=240)
    question_count: int = Field(ge=1, le=2000)


class TestConfigOut(BaseModel):
    teacher_id: int
    discipline_id: int
    time_limit_minutes: int
    question_count: int


class GroupOut(BaseModel):
    group_id: int
    name: str
    student_count: int


class GroupStudentRow(BaseModel):
    student_id: int
    full_name: str
    email: str
    average_score: Optional[float] = None
    sessions_count: int = 0


class GroupStudentsOut(BaseModel):
    group_id: int
    group_name: str
    students: List[GroupStudentRow]


class DisciplineRow(BaseModel):
    discipline_id: int
    name: str
    description: Optional[str] = None
    time_limit_minutes: int
    question_count: int


class TeacherDisciplinesOut(BaseModel):
    disciplines: List[DisciplineRow]


class DiagnosticProblem(BaseModel):
    severity: Literal["error", "warning", "info"]
    code: str
    message: str
    scope: Literal["discipline", "students", "questions", "test", "topic"]
    topic_id: Optional[int] = None


class DiagnosticTopic(BaseModel):
    topic_id: int
    name: str
    questions_count: int
    archived_questions_count: int
    test_configured: bool
    test_enabled: bool
    test_question_count: Optional[int] = None
    time_limit_minutes: Optional[int] = None
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    status: Literal["available", "scheduled", "closed", "blocked", "disabled", "not_configured"]
    problems: List[DiagnosticProblem] = Field(default_factory=list)


class DisciplineDiagnostics(BaseModel):
    discipline_id: int
    name: str
    description: Optional[str] = None
    test_mode: Literal["discipline", "topic"]
    active_questions_count: int
    untopiced_questions_count: int
    archived_questions_count: int
    topics_count: int
    enabled_topic_tests_count: int
    assigned_groups_count: int
    individually_assigned_students_count: int
    assigned_students_count: int
    general_question_count: int
    general_time_limit_minutes: int
    general_test_available: bool
    topics: List[DiagnosticTopic] = Field(default_factory=list)
    problems: List[DiagnosticProblem] = Field(default_factory=list)


class TeacherDiagnosticsOut(BaseModel):
    generated_at: datetime
    disciplines: List[DisciplineDiagnostics]


class StudentAnswerDetail(BaseModel):
    question_id: int
    question_text: str
    chosen_option_text: str
    is_answer_correct: bool
    comment: Optional[str] = None


class StudentDetailSession(BaseModel):
    session_id: int
    started_at: datetime
    completed_at: Optional[datetime]
    score: int
    max_score: int
    score_overridden: bool = False
    override_reason: Optional[str] = None
    topic_id: Optional[int] = None
    topic_name: Optional[str] = None
    answers: List[StudentAnswerDetail] = Field(default_factory=list)
    comment: Optional[str] = None


class StudentDetailDiscipline(BaseModel):
    discipline_id: int
    discipline_name: str
    sessions: List[StudentDetailSession]


class StudentDetailOut(BaseModel):
    student_id: int
    full_name: str
    email: str
    group_name: Optional[str] = None
    disciplines: List[StudentDetailDiscipline]


class TeacherStudentActivityOut(BaseModel):
    student_id: int
    student_full_name: str
    items: List[StudentActivityItemOut]
    total: int
    limit: int
    offset: int
    audit_count: int = 0
    notification_count: int = 0
    session_count: int = 0


class BulkArchiveQuestionsIn(BaseModel):
    question_ids: List[int] = Field(min_length=1, max_length=2000)
    archived: bool = True


class BulkArchiveSkip(BaseModel):
    question_id: int
    reason: str  # "already archived" | "not your discipline" | "not found"


class BulkArchiveQuestionsOut(BaseModel):
    archived: int
    skipped: int
    errors: List[BulkArchiveSkip] = Field(default_factory=list)


# ============================================================================
#  TZ: tz-teacher-production-ready.md — section 3.1 Личный кабинет
# ============================================================================
class TeacherProfileTeacher(BaseModel):
    teacher_id: int
    full_name: str
    email: str
    login: Optional[str] = None
    role: str = "teacher"
    department: Optional[str] = None
    group_ids: List[int] = Field(default_factory=list)
    group_names: List[str] = Field(default_factory=list)
    discipline_ids: List[int] = Field(default_factory=list)


class TeacherProfileStats(BaseModel):
    disciplines_count: int = 0
    students_count: int = 0
    questions_count: int = 0
    completed_sessions_last_30d: int = 0
    active_sessions_now: int = 0


class TeacherProfileOut(BaseModel):
    teacher: TeacherProfileTeacher
    stats: TeacherProfileStats


# ============================================================================
#  TZ section 3.3 — Центр уведомлений преподавателя
# ============================================================================
class TeacherNotificationOut(BaseModel):
    notification_id: int
    type: str
    title: str
    body: Optional[str] = None
    is_read: bool
    created_at: datetime
    link: Optional[str] = None
    meta: dict = Field(default_factory=dict)


class TeacherNotificationsOut(BaseModel):
    items: List[TeacherNotificationOut]
    total: int
    unread_count: int


# ============================================================================
#  TZ section 3.2 — Дашборд преподавателя
# ============================================================================
class TeacherActiveSessionToday(BaseModel):
    session_id: int
    student_id: int
    student_name: str
    discipline_name: str
    topic_name: Optional[str] = None
    started_at: datetime
    expires_at: datetime
    answered_count: int
    total_count: int


class TeacherDeadlineToday(BaseModel):
    topic_id: int
    topic_name: str
    discipline_name: str
    available_until: datetime
    attempts_overdue_for: int = 0
    attempts_left: int = 0


class TeacherNewCommentToday(BaseModel):
    session_id: int
    student_id: int
    student_name: str
    question_id: int
    question_text: str
    comment: str
    created_at: datetime


class TeacherTodayOut(BaseModel):
    active_sessions: List[TeacherActiveSessionToday] = Field(default_factory=list)
    deadlines: List[TeacherDeadlineToday] = Field(default_factory=list)
    new_comments: List[TeacherNewCommentToday] = Field(default_factory=list)


class TeacherDashboardStats(BaseModel):
    disciplines_count: int
    students_count: int
    questions_count: int
    active_sessions_now: int
    completed_sessions_last_30d: int
    avg_overall_percent: Optional[float] = None


class TeacherDashboardOut(BaseModel):
    teacher_id: int
    full_name: str
    range: str
    discipline_id: Optional[int] = None
    stats: TeacherDashboardStats
    today: TeacherTodayOut
    unread_notifications_count: int = 0


# ============================================================================
#  TZ section 3.4 — Глобальный поиск
# ============================================================================
class TeacherSearchItemOut(BaseModel):
    kind: str  # "discipline" | "group" | "student" | "question" | "topic"
    id: int
    label: str
    href: str
    hint: Optional[str] = None


class TeacherSearchOut(BaseModel):
    items: List[TeacherSearchItemOut]
    total: int = 0


# ============================================================================
#  TZ section 3.9 — Аудит действий преподавателя
# ============================================================================
class TeacherAuditItemOut(BaseModel):
    audit_id: int
    action: str
    target_type: str
    target_id: Optional[int] = None
    before: Optional[dict] = None
    after: Optional[dict] = None
    created_at: datetime


class TeacherAuditOut(BaseModel):
    items: List[TeacherAuditItemOut]
    total: int


# ============================================================================
#  TZ section 3.1 — Смена пароля (валидация выполняется на уровне handler'а)
# ============================================================================
class TeacherChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class StudentBriefOut(BaseModel):
    student_id: int
    full_name: str
    group_name: str


class AnswerFileUploadOut(BaseModel):
    upload_id: int
    original_name: str
    content_type: str
    size_bytes: int
    download_url: Optional[str] = None
    uploaded_at: datetime


class FileUploadGradeIn(BaseModel):
    points_earned: float = Field(ge=0)
    comment: Optional[str] = Field(default=None, max_length=2000)


class FileUploadGradeOut(BaseModel):
    grade_id: int
    question_id: int
    points_earned: float
    max_points: float
    comment: Optional[str]
    graded_at: datetime
    session_now_completed: bool = False


class FileAnswerQuestionOut(BaseModel):
    question_id: int
    question_text: str
    max_points: float
    uploads: List[AnswerFileUploadOut]
    grade: Optional[FileUploadGradeOut] = None


class SessionFileAnswersOut(BaseModel):
    session_id: int
    student: StudentBriefOut
    file_questions: List[FileAnswerQuestionOut]


class PendingFileReviewItem(BaseModel):
    session_id: int
    student_id: int
    student_name: str
    group_name: str
    discipline_name: str
    topic_name: Optional[str] = None
    completed_at: datetime
    file_upload_count: int
    graded_count: int


class PendingFileReviewsOut(BaseModel):
    items: List[PendingFileReviewItem]
    total: int

