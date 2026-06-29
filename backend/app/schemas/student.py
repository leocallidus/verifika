from __future__ import annotations

from datetime import datetime
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field


class OptionOut(BaseModel):
    option_id: int
    option_number: int
    option_text: str
    match_left: Optional[str] = None
    match_right: Optional[str] = None


class QuestionOut(BaseModel):
    question_id: int
    question_text: str
    options: List[OptionOut]
    qtype: Optional[str] = None
    qmeta: Optional[dict] = None
    image_url: Optional[str] = None
    points: float = 1.0


class TopicTestMetadata(BaseModel):
    """tz-student-role-improvement.md §12.2 — метаданные теста для шапки/окна старта."""
    discipline_title: str
    topic_title: str
    max_attempts: int
    current_attempt: int
    time_limit_minutes: Optional[int] = None
    passing_score_percent: Optional[int] = None
    show_question_points: bool = True
    grading_method: str = "best"
    shuffle_questions: bool = False
    grade_scale: str = "5_point"


class TestStartOut(BaseModel):
    session_id: int
    started_at: datetime
    time_limit_minutes: int
    expires_at: datetime
    questions: List[QuestionOut]
    topic_metadata: Optional[TopicTestMetadata] = None


class AnswerIn(BaseModel):
    question_id: int
    chosen_option_id: Optional[int] = None
    short_answer: Optional[str] = Field(default=None, max_length=4000)
    numeric_answer: Optional[float] = None
    match_answer: Optional[List[Any]] = None
    text_answer: Optional[str] = Field(default=None, max_length=4000)
    order_answer: Optional[List[int]] = None
    bool_answer: Optional[bool] = None
    cloze_answer: Optional[dict] = None


class AnswerSubmitBatch(BaseModel):
    answers: List[AnswerIn]


class FinishOut(BaseModel):
    session_id: int
    score: int
    max_score: int
    started_at: datetime
    completed_at: datetime
    status: str = "completed"


class DisciplineWithTest(BaseModel):
    discipline_id: int
    discipline_name: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    test_mode: Literal["discipline", "topic"] = "discipline"
    question_count: int
    time_limit_minutes: int
    topics_count: int = 0
    available_topic_tests_count: int = 0
    enabled_topic_tests_count: int = 0
    general_test_available: bool = True
    has_active_session: bool = False
    active_session_id: Optional[int] = None
    completed_topic_tests_count: int = 0
    average_score_percent: Optional[float] = None
    attempts_left: Optional[int] = None
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None


class StudentDisciplinesOut(BaseModel):
    disciplines: List[DisciplineWithTest]


class StudentTopicOut(BaseModel):
    topic_id: int
    discipline_id: int
    name: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    question_count: int
    time_limit_minutes: int
    has_active_session: bool = False
    active_session_id: Optional[int] = None
    attempts_left: int
    available: bool
    unavailable_reason: Optional[str] = None
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    attempts_allowed: int = 0
    last_score: Optional[int] = None
    best_score: Optional[int] = None
    completed_sessions_count: int = 0


class StudentTopicsOut(BaseModel):
    topics: List[StudentTopicOut]


class AnswerRow(BaseModel):
    question_text: str
    chosen_option_text: str
    is_answer_correct: bool


class SessionRow(BaseModel):
    session_id: int
    started_at: datetime
    completed_at: Optional[datetime]
    score: int
    max_score: int
    status: str
    answers: List[AnswerRow] = Field(default_factory=list)


class SessionListItem(BaseModel):
    session_id: int
    discipline_id: int
    discipline_name: str
    started_at: datetime
    completed_at: Optional[datetime]
    score: int
    max_score: int
    status: str
    topic_id: Optional[int] = None
    topic_name: Optional[str] = None


class SessionHistoryOut(BaseModel):
    sessions: List[SessionListItem]


class ResumeOut(BaseModel):
    session_id: int
    started_at: datetime
    time_limit_minutes: int
    expires_at: datetime
    questions: List[QuestionOut]
    saved_answers: dict[int, int] = Field(default_factory=dict)
    saved_extras: dict[int, dict] = Field(default_factory=dict)
    proctor_min_level: int = 0
    topic_metadata: Optional[TopicTestMetadata] = None



class StudentDashboardStudent(BaseModel):
    student_id: int
    full_name: str
    group_name: Optional[str] = None
    role: str = "student"


class StudentDashboardStats(BaseModel):
    disciplines_count: int
    completed_sessions_count: int
    active_sessions_count: int
    average_score_percent: Optional[float] = None


class StudentDashboardActiveSession(BaseModel):
    session_id: int
    discipline_name: str
    topic_name: Optional[str] = None
    started_at: datetime
    expires_at: datetime
    answered_count: int
    total_count: int


class StudentDashboardDeadline(BaseModel):
    topic_id: int
    topic_name: str
    discipline_name: str
    available_until: datetime
    attempts_left: int


class StudentDashboardHistoryItem(BaseModel):
    session_id: int
    discipline_name: str
    topic_name: Optional[str] = None
    score: int
    max_score: int
    completed_at: Optional[datetime]
    status: str


class StudentDashboardTopicProgress(BaseModel):
    discipline_id: int
    discipline_name: str
    topics_total: int
    topics_completed: int
    available_topic_tests_count: int
    average_score_percent: Optional[float] = None
    next_topic_id: Optional[int] = None
    next_topic_name: Optional[str] = None
    next_topic_attempts_left: Optional[int] = None
    test_mode: Literal["discipline", "topic"] = "discipline"


class StudentDashboardOut(BaseModel):
    student: StudentDashboardStudent
    stats: StudentDashboardStats
    active_sessions: List[StudentDashboardActiveSession]
    upcoming_deadlines: List[StudentDashboardDeadline]
    topic_progress: List[StudentDashboardTopicProgress]
    recent_history: List[StudentDashboardHistoryItem]
    unread_notifications_count: int = 0


class StudentStudyQuestionOut(BaseModel):
    question_id: int
    question_text: str
    qtype: Optional[str] = None
    image_url: Optional[str] = None
    options: List[OptionOut] = Field(default_factory=list)
    qmeta: Optional[dict] = None


class StudentTopicHistoryItem(BaseModel):
    session_id: int
    score: int
    max_score: int
    completed_at: Optional[datetime]
    status: str
    attempt_number: Optional[int] = None
    started_at: Optional[datetime] = None
    percent: Optional[float] = None
    duration_seconds: Optional[int] = None
    is_best: bool = False


class StudentTopicDetailOut(BaseModel):
    topic_id: int
    discipline_id: int
    discipline_name: str
    name: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    question_count: int
    actual_questions_count: int
    time_limit_minutes: int
    attempts_allowed: int
    attempts_left: int
    available: bool
    unavailable_reason: Optional[str] = None
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    has_active_session: bool = False
    active_session_id: Optional[int] = None
    study_questions: List[StudentStudyQuestionOut] = Field(default_factory=list)
    history: List[StudentTopicHistoryItem] = Field(default_factory=list)
    # tz-student-role-improvement.md §4, §10.6 — параметры теста и сводная статистика.
    passing_score_percent: Optional[int] = None
    grading_method: str = "best"
    show_question_points: bool = True
    show_correct_after_finish: bool = True
    attempt_delay_minutes: Optional[int] = None
    next_attempt_available_at: Optional[datetime] = None
    shuffle_questions: bool = False
    best_percent: Optional[float] = None
    last_percent: Optional[float] = None
    average_percent: Optional[float] = None
    is_passed: Optional[bool] = None
    grade_scale: str = "5_point"
    allow_study: bool = True


class SessionSummary(BaseModel):
    """tz-student-role-improvement.md §8.6 — строка таблицы попыток."""
    id: int
    attempt_number: int
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    score: Optional[float] = None
    max_score: Optional[float] = None
    percent: Optional[float] = None
    status: str
    duration_seconds: Optional[int] = None
    is_best: bool = False


class TopicGradeResponse(BaseModel):
    topic_id: int
    topic_title: str
    discipline_title: str
    grading_method: str
    final_grade_percent: Optional[float] = None
    final_grade_score: Optional[float] = None
    max_score: Optional[float] = None
    is_passed: Optional[bool] = None
    passing_score_percent: Optional[int] = None
    attempts_used: int
    max_attempts: int
    attempts_remaining: Optional[int] = None
    next_attempt_available_at: Optional[datetime] = None
    sessions: List[SessionSummary] = Field(default_factory=list)
    grade_scale: str = "5_point"


class StudentAnswerRender(BaseModel):
    kind: str
    selected_option_text: Optional[str] = None
    selected_option_id: Optional[int] = None
    value: Optional[object] = None


class StudentSessionAnswerDetailOut(BaseModel):
    question_id: int
    question_text: str
    question_type: str
    question_image_url: Optional[str] = None
    student_answer: Optional[str] = None
    student_answer_render: Optional[dict] = None
    correct_answer: Optional[str] = None
    correct_answer_render: Optional[dict] = None
    is_correct: Optional[bool] = None
    explanation: Optional[str] = None
    comment: Optional[str] = None
    score: int = 0
    max_score: int = 1


class StudentSessionDetailOut(BaseModel):
    session_id: int
    discipline_id: int
    discipline_name: str
    topic_id: Optional[int] = None
    topic_name: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    score: int
    max_score: int
    percent: Optional[float] = None
    attempt_number: Optional[int] = None
    status: str
    show_correctness: bool
    passing_score_percent: Optional[int] = None
    is_passed: Optional[bool] = None
    duration_seconds: Optional[int] = None
    answers: List[StudentSessionAnswerDetailOut] = Field(default_factory=list)
    grade_scale: str = "5_point"
    comment: Optional[str] = None


class RecommendationTopicOut(BaseModel):
    """Тема для повторения из рекомендаций после теста."""
    topic_id: int
    topic_name: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    wrong_questions_count: int = 0
    total_questions_count: int = 0
    wrong_percent: float = 0.0
    reason: str  # «weak_topic» | «related_topic» | «not_started»
    has_active_test: bool = False
    topic_link: Optional[str] = None


class SessionRecommendationsOut(BaseModel):
    """Рекомендации студенту после прохождения теста (R-30)."""
    session_id: int
    discipline_id: int
    discipline_name: str
    topic_id: Optional[int] = None
    score_percent: Optional[float] = None
    is_passed: Optional[bool] = None
    # Темы с ошибками в этой сессии
    weak_topics: List[RecommendationTopicOut] = Field(default_factory=list)
    # Темы, которые стоит пройти дополнительно
    related_topics: List[RecommendationTopicOut] = Field(default_factory=list)
    # Итоговые рекомендации по ключевым словам из вопросов
    review_hints: List[str] = Field(default_factory=list)
    # Общий совет (текстовый)
    summary_message: str = ""


class StudentNotificationOut(BaseModel):
    notification_id: int
    type: str
    title: str
    body: Optional[str] = None
    is_read: bool
    created_at: datetime
    link: Optional[str] = None
    meta: dict = Field(default_factory=dict)


class StudentNotificationsOut(BaseModel):
    items: List[StudentNotificationOut]
    total: int
    unread_count: int


class StudentActivityItemOut(BaseModel):
    id: str
    source: Literal["audit", "notification", "session"]
    category: str
    type: str
    title: str
    body: Optional[str] = None
    created_at: datetime
    target_type: Optional[str] = None
    target_id: Optional[int] = None
    session_id: Optional[int] = None
    discipline_id: Optional[int] = None
    topic_id: Optional[int] = None
    ip_addr: Optional[str] = None
    is_read: Optional[bool] = None
    severity: int = 0
    details: dict = Field(default_factory=dict)


class StudentActivityOut(BaseModel):
    items: List[StudentActivityItemOut]
    total: int
    limit: int
    offset: int
    audit_count: int = 0
    notification_count: int = 0
    session_count: int = 0


class StudentComplaintIn(BaseModel):
    session_id: Optional[int] = None
    topic_id: Optional[int] = None
    body: str = Field(min_length=5, max_length=2000)


class AnswerFileUploadStudentOut(BaseModel):
    upload_id: int
    original_name: str
    size_bytes: int
    uploaded_at: datetime


class FileUploadGradeStudentOut(BaseModel):
    points_earned: float
    max_points: float
    comment: Optional[str]
    graded_at: datetime


class FileQuestionStatusOut(BaseModel):
    question_id: int
    question_text: str
    max_points: float
    uploads: List[AnswerFileUploadStudentOut]
    grade: Optional[FileUploadGradeStudentOut] = None


class SessionFileUploadStatusOut(BaseModel):
    session_id: int
    file_questions: List[FileQuestionStatusOut]
    all_graded: bool

