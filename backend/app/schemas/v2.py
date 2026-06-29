from __future__ import annotations

from datetime import datetime
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.question_image import QuestionImageOut

ALLOWED_QTYPES = ("single", "multi", "short", "numeric", "match", "text", "order", "bool", "cloze")
QuestionTypeLiteral = Literal[
    "single", "multi", "short", "numeric", "match", "text", "order", "bool", "cloze"
]  # type: ignore[valid-type]  # pydantic Literal accepts string tuple


class AssetImageOut(BaseModel):
    image_id: int
    url: str
    content_type: str
    size_bytes: int
    width_px: Optional[int] = None
    height_px: Optional[int] = None
    original_name: Optional[str] = None


class TagOut(BaseModel):
    tag_id: int
    name: str
    question_count: int = 0
    archived: bool = False


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class TagPatch(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class QuestionTypeEnum:
    SINGLE = "single"
    MULTI = "multi"
    SHORT = "short"
    NUMERIC = "numeric"
    MATCH = "match"


class QuestionInV2(BaseModel):
    discipline_id: int
    topic_id: Optional[int] = None
    text: str = Field(min_length=1)
    difficulty: int = Field(default=1, ge=1, le=5)
    qtype: str = Field(default="single")

    @field_validator("qtype")
    @classmethod
    def _qtype_allowed(cls, value: str) -> str:
        if value not in ALLOWED_QTYPES:
            raise ValueError(f"qtype must be one of {', '.join(ALLOWED_QTYPES)}")
        return value
    options: List["OptionV2"] = Field(default_factory=list)
    tags: List[int] = Field(default_factory=list)
    short_pattern: Optional[str] = None
    numeric_tolerance: Optional[float] = None
    match_pairs: Optional[List[dict]] = None
    # New variants
    acceptable_answers: Optional[List[str]] = None
    correct_bool: Optional[bool] = None
    explanation: Optional[str] = None
    case_sensitive: Optional[bool] = None
    trim_whitespace: Optional[bool] = None
    normalize_universal: Optional[bool] = None
    text_mode: Optional[str] = None  # 'string' | 'number'
    allow_partial: Optional[bool] = None
    cloze_blanks: Optional[List[dict]] = None  # see QuestionClozeBlankIn


class OptionV2(BaseModel):
    option_number: int = Field(ge=1, le=4)
    text: str = Field(min_length=1, max_length=2000)
    is_correct: bool = False
    match_left: Optional[str] = None
    match_right: Optional[str] = None


QuestionInV2.model_rebuild()


class QuestionOutV2(BaseModel):
    question_id: int
    discipline_id: int
    topic_id: Optional[int] = None
    topic_name: Optional[str] = None
    text: str
    difficulty: int
    qtype: str
    options: List[OptionV2]
    tags: List[str] = Field(default_factory=list)
    short_pattern: Optional[str] = None
    numeric_tolerance: Optional[float] = None
    match_pairs: Optional[List[dict]] = None
    image: Optional[QuestionImageOut] = None
    archived: bool = False
    # New variants
    correct_bool: Optional[bool] = None
    explanation: Optional[str] = None
    case_sensitive: Optional[bool] = None
    trim_whitespace: Optional[bool] = None
    normalize_universal: Optional[bool] = None
    text_mode: Optional[str] = None
    allow_partial: Optional[bool] = None
    acceptable_answers: List[str] = Field(default_factory=list)
    cloze_blanks: List[dict] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None
    ai_status: Optional[str] = None
    ai_model_used: Optional[str] = None
    ai_reviewed_by: Optional[int] = None
    ai_reviewed_at: Optional[datetime] = None
    ai_generated_at: Optional[datetime] = None


class QuestionQualityIssueOut(BaseModel):
    code: str
    severity: str
    field: Optional[str] = None
    message: str
    duplicate_with: List[int] = Field(default_factory=list)


class QuestionQualityItemOut(BaseModel):
    question_id: int
    discipline_id: int
    discipline_name: str
    topic_id: Optional[int] = None
    topic_name: Optional[str] = None
    qtype: str
    text: str
    archived: bool = False
    issues: List[QuestionQualityIssueOut]


class QuestionQualitySummaryOut(BaseModel):
    total_questions: int
    checked_questions: int
    questions_with_issues: int
    issue_counts: dict[str, int] = Field(default_factory=dict)
    severity_counts: dict[str, int] = Field(default_factory=dict)
    duplicate_groups: int = 0


class QuestionQualityReportOut(BaseModel):
    summary: QuestionQualitySummaryOut
    questions: List[QuestionQualityItemOut]


class QuestionBankDisciplineOut(BaseModel):
    discipline_id: int
    name: str
    description: Optional[str] = None
    image: Optional[AssetImageOut] = None
    topics_count: int = 0
    questions_count: int = 0
    untopiced_questions_count: int = 0
    enabled_topic_tests_count: int = 0


class DisciplineTopicIn(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: Optional[str] = Field(default=None, max_length=2000)
    sort_order: int = Field(default=100, ge=0, le=100000)


class DisciplineTopicPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    description: Optional[str] = Field(default=None, max_length=2000)
    sort_order: Optional[int] = Field(default=None, ge=0, le=100000)


class TopicTestBriefOut(BaseModel):
    is_enabled: bool
    question_count: int
    time_limit_minutes: int
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    grade_scale: str = "5_point"


class DisciplineTopicOut(BaseModel):
    topic_id: int
    discipline_id: int
    name: str
    description: Optional[str] = None
    sort_order: int
    image: Optional[AssetImageOut] = None
    questions_count: int = 0
    test: Optional[TopicTestBriefOut] = None
    archived: bool = False


class TopicTestIn(BaseModel):
    is_enabled: bool = True
    question_count: int = Field(default=10, ge=1, le=2000)
    time_limit_minutes: int = Field(default=20, ge=1, le=240)
    attempts_allowed: int = Field(default=1, ge=0, le=100)
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    shuffle_seed: bool = True
    show_correct_after_finish: bool = True
    allow_study: bool = True
    # tz-student-role-improvement.md §9 — расширенное управление попытками.
    passing_score_percent: Optional[int] = Field(default=None, ge=0, le=100)
    grading_method: str = Field(default="best", pattern="^(best|last|average|first)$")
    show_question_points: bool = True
    attempt_delay_minutes: Optional[int] = Field(default=None, ge=0, le=100000)
    grade_scale: str = Field(default="5_point", pattern="^(5_point|10_point|percent)$")


class TopicTestOut(TopicTestIn):
    teacher_id: int
    topic_id: int
    updated_at: datetime

class TopicTestGroupRuleIn(BaseModel):
    group_id: int
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None


class TopicTestGroupRuleOut(TopicTestGroupRuleIn):
    topic_id: int
    group_name: str
    updated_at: datetime
class PolicyIn(BaseModel):
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    attempts_allowed: int = Field(default=1, ge=0, le=100)
    shuffle_seed: bool = True
    show_correct_after_finish: bool = True
    allow_study: bool = True
    proctor_min_level: int = Field(default=0, ge=0, le=2)


class PolicyOut(PolicyIn):
    teacher_id: int
    discipline_id: int
    updated_at: Optional[datetime] = None


class OverrideScoreIn(BaseModel):
    score: int = Field(ge=0)
    reason: Optional[str] = None


class OverrideScoreOut(BaseModel):
    session_id: int
    score: int
    reason: Optional[str]
    teacher_id: int
    updated_at: datetime


class CommentIn(BaseModel):
    question_id: int
    body: str = Field(min_length=1, max_length=2000)


class CommentOut(BaseModel):
    comment_id: int
    session_id: int
    question_id: int
    teacher_id: int
    body: str
    created_at: datetime


class SessionCommentIn(BaseModel):
    body: str = Field(default="", max_length=2000)


class SessionCommentOut(BaseModel):
    session_id: int
    comment: Optional[str] = None


class ResetRequestIn(BaseModel):
    email: EmailStr


class ResetConfirmIn(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class ResetRequestOut(BaseModel):
    ok: bool
    delivery: str  # "smtp" | "dev-fallback"


class ResetConfirmOut(BaseModel):
    ok: bool


class DashboardPoint(BaseModel):
    date: str
    avg_score: float
    attempts_count: int


class ItemStat(BaseModel):
    question_id: int
    question_text: str
    correct_pct: float
    median_time_sec: Optional[float] = None


class DashboardOut(BaseModel):
    series: List[DashboardPoint]
    items: List[ItemStat]
    avg_overall: float
    attempts_total: int


class TopicAnalyticsBrief(BaseModel):
    topic_id: int
    topic_name: str
    discipline_id: int
    discipline_name: str
    attempts_total: int
    students_total: int
    avg_score_percent: Optional[float] = None
    last_attempt_at: Optional[datetime] = None


class TopicAnalyticsSummary(BaseModel):
    topic_id: int
    topic_name: str
    discipline_id: int
    discipline_name: str
    attempts_total: int
    students_total: int
    avg_score_percent: Optional[float] = None
    median_score_percent: Optional[float] = None
    pass_rate_percent: Optional[float] = None
    min_score_percent: Optional[float] = None
    max_score_percent: Optional[float] = None
    passing_score_percent: Optional[int] = None
    last_attempt_at: Optional[datetime] = None


class TopicScoreDistributionBucket(BaseModel):
    label: str
    min_percent: int
    max_percent: int
    count: int


class TopicAnalyticsTrendPoint(BaseModel):
    date: str
    attempts_count: int
    avg_score_percent: Optional[float] = None


class TopicAnalyticsGroupPoint(BaseModel):
    group_id: Optional[int] = None
    group_name: str
    attempts_count: int
    students_count: int
    avg_score_percent: Optional[float] = None
    pass_rate_percent: Optional[float] = None
    last_attempt_at: Optional[datetime] = None


class TopicAnalyticsQuestionStat(BaseModel):
    question_id: int
    question_text: str
    qtype: str
    attempts_count: int
    correct_percent: Optional[float] = None
    wrong_count: int


class TopicAnalyticsOut(BaseModel):
    summary: TopicAnalyticsSummary
    distribution: List[TopicScoreDistributionBucket]
    trend: List[TopicAnalyticsTrendPoint]
    groups: List[TopicAnalyticsGroupPoint]
    difficult_questions: List[TopicAnalyticsQuestionStat]


class NotificationOut(BaseModel):
    notification_id: int
    user_role: str
    user_id: int
    event_type: str
    payload: Optional[dict] = None
    read_at: Optional[datetime] = None
    created_at: datetime


class QuestionImportError(BaseModel):
    row: int
    message: str


class QuestionImportResult(BaseModel):
    created: int
    skipped: int
    errors: List[QuestionImportError] = Field(default_factory=list)


class StudentAnswerInV2(BaseModel):
    question_id: int
    chosen_option_ids: Optional[List[int]] = None
    short_answer: Optional[str] = None
    numeric_answer: Optional[float] = None
    match_answer: Optional[List[str]] = None
    time_spent_sec: Optional[int] = None
