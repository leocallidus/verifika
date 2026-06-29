from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
sa_text = text
from sqlalchemy.dialects.postgresql import INET, UUID
import uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Group(Base):
    __tablename__ = "groups"
    group_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(50))
    admission_year: Mapped[int] = mapped_column(Integer)
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        Index("idx_groups_archived", "archived_at"),
    )


class Discipline(Base):
    __tablename__ = "disciplines"
    discipline_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(150), unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    credits: Mapped[Optional[int]] = mapped_column(Integer)
    total_hours: Mapped[Optional[int]] = mapped_column(Integer)
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("teachers.teacher_id"))
    image: Mapped[Optional["DisciplineImage"]] = relationship(
        back_populates="discipline",
        cascade="all, delete-orphan",
        uselist=False,
    )
    __table_args__ = (
        Index("idx_disciplines_archived", "archived_at"),
    )


class Teacher(Base):
    __tablename__ = "teachers"
    teacher_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    middle_name: Mapped[Optional[str]] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    login: Mapped[str] = mapped_column(String(64), unique=True)
    department: Mapped[str] = mapped_column(String(150))
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    disciplines: Mapped[list["TeacherDiscipline"]] = relationship(back_populates="teacher")
    __table_args__ = (
        Index("idx_teachers_archived", "archived_at"),
    )


class Student(Base):
    __tablename__ = "students"
    student_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    middle_name: Mapped[Optional[str]] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    login: Mapped[str] = mapped_column(String(64), unique=True)
    enrollment_date: Mapped[datetime] = mapped_column(Date, server_default=func.current_date())
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.group_id"))
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    group: Mapped["Group"] = relationship()
    __table_args__ = (
        Index("idx_students_archived", "archived_at"),
    )


class TeacherDiscipline(Base):
    __tablename__ = "teacher_disciplines"
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.teacher_id", ondelete="CASCADE"), primary_key=True)
    discipline_id: Mapped[int] = mapped_column(ForeignKey("disciplines.discipline_id", ondelete="CASCADE"), primary_key=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    time_limit_minutes: Mapped[int] = mapped_column(Integer, server_default="30")
    question_count: Mapped[int] = mapped_column(Integer, server_default="10")
    teacher: Mapped["Teacher"] = relationship(back_populates="disciplines")


class GroupDiscipline(Base):
    """Explicit discipline availability for all active students in a group."""
    __tablename__ = "group_disciplines"
    group_id: Mapped[int] = mapped_column(
        ForeignKey("groups.group_id", ondelete="CASCADE"), primary_key=True
    )
    discipline_id: Mapped[int] = mapped_column(
        ForeignKey("disciplines.discipline_id", ondelete="CASCADE"), primary_key=True
    )
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    assigned_by_admin_id: Mapped[Optional[int]] = mapped_column(ForeignKey("admins.admin_id"))
    __table_args__ = (
        Index("idx_group_disciplines_group", "group_id"),
        Index("idx_group_disciplines_discipline", "discipline_id"),
    )


class StudentDiscipline(Base):
    """Explicit individual discipline availability override for one student."""
    __tablename__ = "student_disciplines"
    student_id: Mapped[int] = mapped_column(
        ForeignKey("students.student_id", ondelete="CASCADE"), primary_key=True
    )
    discipline_id: Mapped[int] = mapped_column(
        ForeignKey("disciplines.discipline_id", ondelete="CASCADE"), primary_key=True
    )
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    assigned_by_admin_id: Mapped[Optional[int]] = mapped_column(ForeignKey("admins.admin_id"))
    __table_args__ = (
        Index("idx_student_disciplines_student", "student_id"),
        Index("idx_student_disciplines_discipline", "discipline_id"),
    )


class Admin(Base):
    __tablename__ = "admins"
    admin_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    login: Mapped[str] = mapped_column(String(64), unique=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    middle_name: Mapped[Optional[str]] = mapped_column(String(100))
    department: Mapped[Optional[str]] = mapped_column(String(150))
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        Index("idx_admins_archived", "archived_at"),
    )


class Question(Base):
    __tablename__ = "questions"
    question_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    discipline_id: Mapped[int] = mapped_column(ForeignKey("disciplines.discipline_id", ondelete="CASCADE"))
    topic_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("discipline_topics.topic_id", ondelete="SET NULL"),
    )
    text: Mapped[str] = mapped_column(Text)
    difficulty: Mapped[int] = mapped_column(Integer, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    qtype: Mapped[str] = mapped_column(String(16), server_default="single")
    short_pattern: Mapped[Optional[str]] = mapped_column(String(255))
    numeric_tolerance: Mapped[Optional[float]] = mapped_column(Numeric)
    match_pairs: Mapped[Optional[Any]] = mapped_column(JSON)
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    correct_bool: Mapped[Optional[bool]] = mapped_column(Boolean)
    explanation: Mapped[Optional[str]] = mapped_column(Text)
    case_sensitive: Mapped[bool] = mapped_column(Boolean, server_default="false")
    trim_whitespace: Mapped[bool] = mapped_column(Boolean, server_default="true")
    normalize_universal: Mapped[bool] = mapped_column(Boolean, server_default="true")
    text_mode: Mapped[str] = mapped_column(String(8), server_default="string")
    allow_partial: Mapped[bool] = mapped_column(Boolean, server_default="false")
    # tz-student-role-improvement.md §5.2 — баллы за вопрос (отображаются студенту).
    points: Mapped[float] = mapped_column(Numeric, server_default="1")
    ai_status: Mapped[Optional[str]] = mapped_column(String(32))
    ai_model_used: Mapped[Optional[str]] = mapped_column(String(128))
    ai_reviewed_by: Mapped[Optional[int]] = mapped_column(ForeignKey("teachers.teacher_id"))
    ai_reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    ai_generated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    file_allowed_types: Mapped[Optional[str]] = mapped_column(Text)
    file_max_size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger, server_default="10485760")
    file_max_count: Mapped[Optional[int]] = mapped_column(Integer, server_default="1")

    options: Mapped[list["AnswerOption"]] = relationship(
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="AnswerOption.option_number",
    )
    acceptable_answers: Mapped[list["QuestionAcceptableAnswer"]] = relationship(
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="QuestionAcceptableAnswer.ord",
    )
    cloze_blanks: Mapped[list["QuestionClozeBlank"]] = relationship(
        back_populates="question",
        cascade="all, delete-orphan",
        order_by="QuestionClozeBlank.blank_index",
    )
    tags: Mapped[list["QuestionTag"]] = relationship(secondary="question_tag_map")
    image: Mapped[Optional["QuestionImage"]] = relationship(
        back_populates="question",
        cascade="all, delete-orphan",
        uselist=False,
    )
    topic: Mapped[Optional["DisciplineTopic"]] = relationship(back_populates="questions")
    __table_args__ = (
        Index("idx_questions_archived", "archived_at"),
        Index("idx_questions_discipline_archived", "discipline_id", "archived_at"),
        Index("idx_questions_topic", "topic_id"),
        Index("idx_questions_ai_status", "ai_status", "discipline_id", postgresql_where=sa_text("ai_status = 'pending_review'")),
        CheckConstraint("qtype IN ('single','multi','short','numeric','match','text','order','bool','cloze','file_upload')", name="questions_qtype_check"),
        CheckConstraint("ai_status IS NULL OR ai_status IN ('pending_review', 'approved')", name="chk_questions_ai_status"),
    )


class QuestionVersion(Base):
    __tablename__ = "question_versions"
    question_version_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.question_id", ondelete="CASCADE"))
    version_no: Mapped[int] = mapped_column(Integer)
    snapshot: Mapped[Any] = mapped_column(JSON)
    created_by_teacher_id: Mapped[Optional[int]] = mapped_column(ForeignKey("teachers.teacher_id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        UniqueConstraint("question_id", "version_no", name="uq_question_versions_question_no"),
        Index("idx_question_versions_question", "question_id", "version_no"),
    )


class QuestionAcceptableAnswer(Base):
    __tablename__ = "question_acceptable_answers"
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.question_id", ondelete="CASCADE"), primary_key=True
    )
    ord: Mapped[int] = mapped_column(Integer, primary_key=True)
    answer: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    question: Mapped["Question"] = relationship(back_populates="acceptable_answers")
    __table_args__ = (
        Index("idx_question_acceptable_answers_qid", "question_id"),
    )


class QuestionClozeBlank(Base):
    __tablename__ = "question_cloze_blanks"
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.question_id", ondelete="CASCADE"), primary_key=True
    )
    blank_index: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))
    options: Mapped[Optional[Any]] = mapped_column(JSON)
    correct_index: Mapped[Optional[int]] = mapped_column(Integer)
    acceptable_answers: Mapped[Optional[Any]] = mapped_column(JSON)
    case_sensitive: Mapped[bool] = mapped_column(Boolean, server_default="false")
    trim_whitespace: Mapped[bool] = mapped_column(Boolean, server_default="true")
    normalize_universal: Mapped[bool] = mapped_column(Boolean, server_default="true")
    question: Mapped["Question"] = relationship(back_populates="cloze_blanks")
    __table_args__ = (
        CheckConstraint("blank_index BETWEEN 1 AND 3", name="chk_blank_index"),
    )


class DisciplineImage(Base):
    __tablename__ = "discipline_images"
    image_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    discipline_id: Mapped[int] = mapped_column(
        ForeignKey("disciplines.discipline_id", ondelete="CASCADE"),
        unique=True,
    )
    storage_key: Mapped[str] = mapped_column(Text, unique=True)
    original_name: Mapped[Optional[str]] = mapped_column(Text)
    content_type: Mapped[str] = mapped_column(String(64))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    width_px: Mapped[Optional[int]] = mapped_column(Integer)
    height_px: Mapped[Optional[int]] = mapped_column(Integer)
    sha256_hex: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    discipline: Mapped["Discipline"] = relationship(back_populates="image")


class DisciplineTopic(Base):
    __tablename__ = "discipline_topics"
    topic_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    discipline_id: Mapped[int] = mapped_column(ForeignKey("disciplines.discipline_id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(150))
    description: Mapped[Optional[str]] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, server_default="100")
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("teachers.teacher_id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    questions: Mapped[list["Question"]] = relationship(back_populates="topic")
    image: Mapped[Optional["DisciplineTopicImage"]] = relationship(
        back_populates="topic",
        cascade="all, delete-orphan",
        uselist=False,
    )
    tests: Mapped[list["TeacherTopicTest"]] = relationship(
        back_populates="topic",
        cascade="all, delete-orphan",
    )
    group_rules: Mapped[list["TeacherTopicTestGroupRule"]] = relationship(
        back_populates="topic",
        cascade="all, delete-orphan",
    )
    __table_args__ = (
        UniqueConstraint("discipline_id", "name", name="uq_discipline_topics_discipline_name"),
        Index("idx_discipline_topics_discipline", "discipline_id"),
    )


class DisciplineTopicImage(Base):
    __tablename__ = "discipline_topic_images"
    image_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    topic_id: Mapped[int] = mapped_column(
        ForeignKey("discipline_topics.topic_id", ondelete="CASCADE"),
        unique=True,
    )
    storage_key: Mapped[str] = mapped_column(Text, unique=True)
    original_name: Mapped[Optional[str]] = mapped_column(Text)
    content_type: Mapped[str] = mapped_column(String(64))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    width_px: Mapped[Optional[int]] = mapped_column(Integer)
    height_px: Mapped[Optional[int]] = mapped_column(Integer)
    sha256_hex: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    topic: Mapped["DisciplineTopic"] = relationship(back_populates="image")


class QuestionImage(Base):
    __tablename__ = "question_images"
    image_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.question_id", ondelete="CASCADE"),
        unique=True,
    )
    storage_key: Mapped[str] = mapped_column(Text, unique=True)
    original_name: Mapped[Optional[str]] = mapped_column(Text)
    content_type: Mapped[str] = mapped_column(String(64))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    width_px: Mapped[Optional[int]] = mapped_column(Integer)
    height_px: Mapped[Optional[int]] = mapped_column(Integer)
    sha256_hex: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    question: Mapped["Question"] = relationship(back_populates="image")
    __table_args__ = (
        Index("idx_question_images_question_id", "question_id"),
    )


class AnswerOption(Base):
    __tablename__ = "answer_options"
    option_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.question_id", ondelete="CASCADE"))
    option_number: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    is_correct: Mapped[bool] = mapped_column(Boolean, server_default="false")
    match_left: Mapped[Optional[str]] = mapped_column(String(255))
    match_right: Mapped[Optional[str]] = mapped_column(String(255))
    correct_position: Mapped[Optional[int]] = mapped_column(Integer)
    question: Mapped["Question"] = relationship(back_populates="options")
    __table_args__ = (
        Index("idx_answer_options_correct_position", "question_id", "correct_position"),
    )


class TestSession(Base):
    __tablename__ = "test_sessions"
    session_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.student_id"))
    discipline_id: Mapped[int] = mapped_column(ForeignKey("disciplines.discipline_id"))
    topic_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("discipline_topics.topic_id", ondelete="SET NULL"),
    )
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.teacher_id"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    score: Mapped[int] = mapped_column(Integer, server_default="0")
    max_score: Mapped[int] = mapped_column(Integer)
    attempt_no: Mapped[int] = mapped_column(Integer, server_default="1")
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    force_finished_by: Mapped[Optional[int]] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(32), server_default="in_progress")
    policy_version_id: Mapped[Optional[int]] = mapped_column(ForeignKey("test_policy_versions.policy_version_id"))
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    __table_args__ = (
        Index("idx_sessions_attempt", "student_id", "discipline_id", "attempt_no"),
        Index("idx_test_sessions_topic", "topic_id"),
        Index("idx_sessions_active", "discipline_id", "student_id", postgresql_where=text("completed_at IS NULL")),
        CheckConstraint("status IN ('in_progress','completed','abandoned','force_finished','pending_file_grading')", name="test_sessions_status_check"),
    )


class TestPolicyVersion(Base):
    __tablename__ = "test_policy_versions"
    policy_version_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    scope: Mapped[str] = mapped_column(String(16))
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.teacher_id", ondelete="CASCADE"))
    discipline_id: Mapped[int] = mapped_column(ForeignKey("disciplines.discipline_id", ondelete="CASCADE"))
    topic_id: Mapped[Optional[int]] = mapped_column(ForeignKey("discipline_topics.topic_id", ondelete="CASCADE"))
    version_no: Mapped[int] = mapped_column(Integer)
    snapshot: Mapped[Any] = mapped_column(JSON)
    created_by_teacher_id: Mapped[Optional[int]] = mapped_column(ForeignKey("teachers.teacher_id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        CheckConstraint("scope IN ('discipline','topic')", name="test_policy_versions_scope_check"),
        Index("idx_test_policy_versions_scope", "scope", "teacher_id", "discipline_id", "topic_id", "version_no"),
        Index(
            "uq_test_policy_versions_discipline_no",
            "teacher_id",
            "discipline_id",
            "version_no",
            unique=True,
            postgresql_where=text("scope = 'discipline' AND topic_id IS NULL"),
        ),
        Index(
            "uq_test_policy_versions_topic_no",
            "teacher_id",
            "discipline_id",
            "topic_id",
            "version_no",
            unique=True,
            postgresql_where=text("scope = 'topic' AND topic_id IS NOT NULL"),
        ),
    )


class TestSessionQuestion(Base):
    __tablename__ = "test_session_questions"
    session_id: Mapped[int] = mapped_column(
        ForeignKey("test_sessions.session_id", ondelete="CASCADE"), primary_key=True
    )
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.question_id"), primary_key=True)
    question_version_id: Mapped[int] = mapped_column(ForeignKey("question_versions.question_version_id"))
    position: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        UniqueConstraint("session_id", "position", name="uq_test_session_questions_position"),
        Index("idx_test_session_questions_version", "question_version_id"),
    )


class TeacherTopicTest(Base):
    __tablename__ = "teacher_topic_tests"
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.teacher_id", ondelete="CASCADE"), primary_key=True)
    topic_id: Mapped[int] = mapped_column(ForeignKey("discipline_topics.topic_id", ondelete="CASCADE"), primary_key=True)
    time_limit_minutes: Mapped[int] = mapped_column(Integer, server_default="20")
    question_count: Mapped[int] = mapped_column(Integer, server_default="10")
    attempts_allowed: Mapped[int] = mapped_column(Integer, server_default="1")
    available_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    available_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    shuffle_seed: Mapped[bool] = mapped_column(Boolean, server_default="true")
    show_correct_after_finish: Mapped[bool] = mapped_column(Boolean, server_default="true")
    is_enabled: Mapped[bool] = mapped_column(Boolean, server_default="true")
    allow_study: Mapped[bool] = mapped_column(Boolean, server_default="true")
    # tz-student-role-improvement.md §9 — расширенное управление попытками.
    passing_score_percent: Mapped[Optional[int]] = mapped_column(Integer)
    grading_method: Mapped[str] = mapped_column(String(8), server_default="best")
    show_question_points: Mapped[bool] = mapped_column(Boolean, server_default="true")
    attempt_delay_minutes: Mapped[Optional[int]] = mapped_column(Integer)
    grade_scale: Mapped[str] = mapped_column(String(16), server_default="5_point")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    topic: Mapped["DisciplineTopic"] = relationship(back_populates="tests")
    __table_args__ = (
        Index("idx_teacher_topic_tests_topic", "topic_id"),
    )


class TeacherTopicTestGroupRule(Base):
    __tablename__ = "teacher_topic_test_group_rules"
    topic_id: Mapped[int] = mapped_column(ForeignKey("discipline_topics.topic_id", ondelete="CASCADE"), primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.group_id", ondelete="CASCADE"), primary_key=True)
    available_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    available_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    topic: Mapped["DisciplineTopic"] = relationship(back_populates="group_rules")
    group: Mapped["Group"] = relationship()


class StudentAnswer(Base):
    __tablename__ = "student_answers"
    answer_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("test_sessions.session_id", ondelete="CASCADE"))
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.question_id"))
    selected_option_id: Mapped[Optional[int]] = mapped_column(Integer)
    answered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        UniqueConstraint("session_id", "question_id", name="uq_one_answer_per_question_in_session"),
    )


class UserCredential(Base):
    __tablename__ = "user_credentials"
    credential_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    role: Mapped[str] = mapped_column(String(16))
    user_id: Mapped[int] = mapped_column(BigInteger)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    requires_totp: Mapped[bool] = mapped_column(Boolean, server_default="false")
    totp_secret: Mapped[Optional[str]] = mapped_column(String(64))
    totp_enrolled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        UniqueConstraint("role", "user_id", name="uq_credential_role_user"),
        CheckConstraint("role IN ('student','teacher','admin')", name="chk_credential_role"),
    )


class QuestionTag(Base):
    __tablename__ = "question_tags"
    tag_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        Index("idx_question_tags_archived", "archived_at"),
        Index("uq_question_tags_name_active", "name", unique=True, postgresql_where=text("archived_at IS NULL")),
    )


class QuestionTagMap(Base):
    __tablename__ = "question_tag_map"
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.question_id", ondelete="CASCADE"), primary_key=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("question_tags.tag_id", ondelete="CASCADE"), primary_key=True)


class AttemptsPolicy(Base):
    __tablename__ = "attempts_policy"
    policy_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.teacher_id", ondelete="CASCADE"))
    discipline_id: Mapped[int] = mapped_column(ForeignKey("disciplines.discipline_id", ondelete="CASCADE"))
    available_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    available_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    attempts_allowed: Mapped[int] = mapped_column(Integer, server_default="1")
    shuffle_seed: Mapped[bool] = mapped_column(Boolean, server_default="true")
    show_correct_after_finish: Mapped[bool] = mapped_column(Boolean, server_default="true")
    proctor_min_level: Mapped[int] = mapped_column(Integer, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint("teacher_id", "discipline_id", name="uq_policy_teacher_disc"),)


class TestSessionGradeOverride(Base):
    __tablename__ = "test_sessions_grade_override"
    session_id: Mapped[int] = mapped_column(ForeignKey("test_sessions.session_id", ondelete="CASCADE"), primary_key=True)
    score: Mapped[int] = mapped_column(Integer)
    reason: Mapped[Optional[str]] = mapped_column(Text)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.teacher_id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AnswerComment(Base):
    __tablename__ = "answer_comments"
    comment_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("test_sessions.session_id", ondelete="CASCADE"))
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.question_id", ondelete="CASCADE"))
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.teacher_id"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        UniqueConstraint("session_id", "question_id", name="uq_answer_comments_session_question"),
        Index("idx_answer_comments_session", "session_id"),
    )


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    token_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_role: Mapped[str] = mapped_column(String(16))
    user_id: Mapped[int] = mapped_column(BigInteger)
    token_hash: Mapped[str] = mapped_column(String(255), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_log"
    log_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    actor_role: Mapped[Optional[str]] = mapped_column(String(16))
    actor_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    action: Mapped[str] = mapped_column(String(64))
    target: Mapped[Optional[str]] = mapped_column(String(128))
    metadata_json: Mapped[Optional[Any]] = mapped_column("metadata", JSON)
    target_type: Mapped[Optional[str]] = mapped_column(String(32))
    target_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    ip_addr: Mapped[Optional[str]] = mapped_column(INET)
    reason: Mapped[Optional[str]] = mapped_column(Text)
    before_json: Mapped[Optional[Any]] = mapped_column(JSON)
    after_json: Mapped[Optional[Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        Index("idx_audit_actor", "actor_role", "actor_id"),
        Index("idx_audit_action", "action"),
        Index("idx_audit_created_at", "created_at"),
        Index("idx_audit_target", "target_type", "target_id", text("created_at DESC")),
        Index("idx_audit_role_time", "actor_role", text("created_at DESC")),
    )


class TeacherAuditLog(Base):
    """TZ tz-teacher-production-ready.md § 3.9 — журнал действий преподавателя."""
    __tablename__ = "teacher_audit_log"
    audit_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    teacher_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("teachers.teacher_id"))
    action: Mapped[str] = mapped_column(String(64))
    target_type: Mapped[str] = mapped_column(String(32))
    target_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    before: Mapped[Optional[Any]] = mapped_column(JSON)
    after: Mapped[Optional[Any]] = mapped_column(JSON)
    ip_addr: Mapped[Optional[str]] = mapped_column(INET)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        Index("idx_teacher_audit_teacher", "teacher_id", text("created_at DESC")),
        Index("idx_teacher_audit_action", "action", text("created_at DESC")),
    )


class TeacherGroup(Base):
    """TZ tz-teacher-production-ready.md § 6.1 — M-N преподаватель <-> группа."""
    __tablename__ = "teacher_groups"
    teacher_id: Mapped[int] = mapped_column(
        ForeignKey("teachers.teacher_id", ondelete="CASCADE"), primary_key=True
    )
    group_id: Mapped[int] = mapped_column(
        ForeignKey("groups.group_id", ondelete="CASCADE"), primary_key=True
    )
    __table_args__ = (
        Index("idx_teacher_groups_teacher", "teacher_id"),
        Index("idx_teacher_groups_group", "group_id"),
    )


class Notification(Base):
    __tablename__ = "notifications"
    notification_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_role: Mapped[str] = mapped_column(String(16))
    user_id: Mapped[int] = mapped_column(BigInteger)
    event_type: Mapped[str] = mapped_column(String(64))
    payload: Mapped[Optional[Any]] = mapped_column(JSON)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    recipient_role: Mapped[Optional[str]] = mapped_column(String(16))
    channel: Mapped[str] = mapped_column(String(32), server_default="user")
    severity: Mapped[int] = mapped_column(Integer, server_default="0")
    extra_metadata: Mapped[Optional[Any]] = mapped_column("metadata", JSON)
    hidden_admin_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    __table_args__ = (
        Index("idx_notifications_user", "user_role", "user_id", "created_at"),
        Index("idx_notifications_role_channel", "recipient_role", "channel", text("created_at DESC")),
        Index("idx_notifications_event_type", "event_type", text("created_at DESC")),
    )


class AnswerExtra(Base):
    __tablename__ = "answer_extra"
    answer_id: Mapped[int] = mapped_column(
        ForeignKey("student_answers.answer_id", ondelete="CASCADE"), primary_key=True
    )
    short_answer_raw: Mapped[Optional[str]] = mapped_column(Text)
    short_answer_ok: Mapped[Optional[bool]] = mapped_column(Boolean)
    match_pairs: Mapped[Optional[Any]] = mapped_column(JSON)


class ProctorEvent(Base):
    __tablename__ = "proctor_events"
    event_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("test_sessions.session_id", ondelete="CASCADE"))
    event_type: Mapped[str] = mapped_column(String(32))
    metadata_json: Mapped[Optional[Any]] = mapped_column("metadata", JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        Index("idx_proctor_session", "session_id"),
    )


class AiChat(Base):
    __tablename__ = "ai_chats"
    chat_id:     Mapped[int]           = mapped_column(BigInteger, primary_key=True)
    user_role:   Mapped[str]           = mapped_column(String(16))
    user_id:     Mapped[int]           = mapped_column(BigInteger)
    title:       Mapped[Optional[str]] = mapped_column(String(255))
    is_pinned:   Mapped[bool]          = mapped_column(Boolean, server_default="false", default=False)
    created_at:  Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:  Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    messages: Mapped[list["AiMessage"]] = relationship(
        back_populates="chat",
        cascade="all, delete-orphan",
        order_by="AiMessage.created_at",
    )
    __table_args__ = (
        Index("idx_ai_chats_user", "user_role", "user_id", "created_at"),
        Index("idx_ai_chats_user_pinned", "user_id", "is_pinned"),
        CheckConstraint("user_role IN ('student','teacher','admin')", name="chk_ai_chat_role"),
    )


class AiMessage(Base):
    __tablename__ = "ai_messages"
    message_id:  Mapped[int]           = mapped_column(BigInteger, primary_key=True)
    chat_id:     Mapped[int]           = mapped_column(ForeignKey("ai_chats.chat_id", ondelete="CASCADE"))
    role:        Mapped[str]           = mapped_column(String(16))
    content:     Mapped[str]           = mapped_column(Text)
    tokens_used: Mapped[Optional[int]] = mapped_column(Integer)
    model_used:  Mapped[Optional[str]] = mapped_column(String(128))
    created_at:  Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())
    chat: Mapped["AiChat"] = relationship(back_populates="messages")
    __table_args__ = (
        Index("idx_ai_messages_chat", "chat_id", "created_at"),
        CheckConstraint("role IN ('user','assistant','system')", name="chk_ai_msg_role"),
    )


class AiGenerationTask(Base):
    __tablename__ = "ai_generation_tasks"
    task_id:         Mapped[str]           = mapped_column(String(36), primary_key=True)
    teacher_id:      Mapped[int]           = mapped_column(ForeignKey("teachers.teacher_id"))
    discipline_id:   Mapped[int]           = mapped_column(ForeignKey("disciplines.discipline_id"))
    topic_id:        Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("discipline_topics.topic_id", ondelete="SET NULL")
    )
    status:          Mapped[str]           = mapped_column(String(16), server_default="processing")
    generated_count: Mapped[int]           = mapped_column(Integer, server_default="0")
    total_requested: Mapped[int]           = mapped_column(Integer, server_default="0", default=0)
    error_message:   Mapped[Optional[str]] = mapped_column(Text)
    created_at:      Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at:    Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        Index("idx_gen_tasks_teacher", "teacher_id", "created_at"),
        CheckConstraint("status IN ('processing','done','error')", name="chk_gen_status"),
    )


class AnswerFileUpload(Base):
    __tablename__ = "answer_file_uploads"
    upload_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    answer_id: Mapped[int] = mapped_column(ForeignKey("student_answers.answer_id", ondelete="CASCADE"))
    storage_key: Mapped[str] = mapped_column(Text, unique=True)
    original_name: Mapped[str] = mapped_column(Text)
    content_type: Mapped[str] = mapped_column(String(128))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    sha256_hex: Mapped[str] = mapped_column(String(64))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        Index("idx_answer_file_uploads_answer", "answer_id"),
    )


class FileUploadGrade(Base):
    __tablename__ = "file_upload_grades"
    grade_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    answer_id: Mapped[int] = mapped_column(ForeignKey("student_answers.answer_id", ondelete="CASCADE"), unique=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("teachers.teacher_id"))
    points_earned: Mapped[float] = mapped_column(Numeric)
    comment: Mapped[Optional[str]] = mapped_column(Text)
    graded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        Index("idx_file_upload_grades_answer", "answer_id"),
        Index("idx_file_upload_grades_teacher", "teacher_id"),
        CheckConstraint("points_earned >= 0", name="chk_file_upload_grade_positive"),
    )



class UserAvatarImage(Base):
    __tablename__ = "user_avatar_images"
    avatar_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_role: Mapped[str] = mapped_column(String(16), nullable=False)
    user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_key: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    original_name: Mapped[Optional[str]] = mapped_column(Text)
    content_type: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    width_px: Mapped[int] = mapped_column(Integer, nullable=False)
    height_px: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256_hex: Mapped[str] = mapped_column(String(64), nullable=False)
    crop_json: Mapped[Optional[dict]] = mapped_column(JSON)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        Index("idx_user_avatar_images_user", "user_role", "user_id", "created_at"),
        CheckConstraint("user_role IN ('student', 'teacher', 'admin')", name="chk_user_avatar_role"),
    )


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    auth_session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_role: Mapped[str] = mapped_column(String(16), nullable=False)
    user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    token_jti: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    revoked_reason: Mapped[Optional[str]] = mapped_column(String(64))
    ip_addr: Mapped[Optional[str]] = mapped_column(INET)
    user_agent: Mapped[Optional[str]] = mapped_column(Text)
    device_name: Mapped[Optional[str]] = mapped_column(String(160))
    client_kind: Mapped[str] = mapped_column(String(16), default="web", nullable=False)
    os_name: Mapped[Optional[str]] = mapped_column(String(80))
    os_version: Mapped[Optional[str]] = mapped_column(String(80))
    browser_name: Mapped[Optional[str]] = mapped_column(String(80))
    browser_version: Mapped[Optional[str]] = mapped_column(String(80))
    app_version: Mapped[Optional[str]] = mapped_column(String(80))
    locale: Mapped[Optional[str]] = mapped_column(String(32))
    timezone: Mapped[Optional[str]] = mapped_column(String(64))
    geo_country: Mapped[Optional[str]] = mapped_column(String(80))
    geo_region: Mapped[Optional[str]] = mapped_column(String(120))
    geo_city: Mapped[Optional[str]] = mapped_column(String(120))
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSON)
    __table_args__ = (
        Index("idx_auth_sessions_user_active", "user_role", "user_id", "revoked_at", "last_seen_at"),
        Index("idx_auth_sessions_expires", "expires_at"),
        CheckConstraint("user_role IN ('student', 'teacher', 'admin')", name="chk_auth_session_role"),
        CheckConstraint("client_kind IN ('web', 'tauri')", name="chk_auth_session_client_kind"),
    )


class BrandingAsset(Base):
    __tablename__ = "branding_assets"
    asset_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    asset_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    storage_key: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    original_name: Mapped[Optional[str]] = mapped_column(Text)
    content_type: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    width_px: Mapped[int] = mapped_column(Integer, nullable=False)
    height_px: Mapped[int] = mapped_column(Integer, nullable=False)
    display_width_px: Mapped[Optional[int]] = mapped_column(Integer)
    display_height_px: Mapped[Optional[int]] = mapped_column(Integer)
    sha256_hex: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_admin_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        Index("idx_branding_assets_kind_created", "asset_kind", "created_at"),
        CheckConstraint("asset_kind IN ('topbar_logo', 'institution_logo', 'login_banner')", name="chk_branding_asset_kind"),
    )


class AppBrandingSettings(Base):
    __tablename__ = "app_branding_settings"
    settings_id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1, server_default="1")
    app_name: Mapped[str] = mapped_column(String(80), default="Верифика", nullable=False)
    topbar_logo_asset_id: Mapped[Optional[int]] = mapped_column(ForeignKey("branding_assets.asset_id", ondelete="SET NULL"))
    institution_logo_asset_id: Mapped[Optional[int]] = mapped_column(ForeignKey("branding_assets.asset_id", ondelete="SET NULL"))
    institution_logo_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    institution_logo_display_size_px: Mapped[int] = mapped_column(Integer, default=56, server_default="56", nullable=False)
    login_banner_asset_id: Mapped[Optional[int]] = mapped_column(ForeignKey("branding_assets.asset_id", ondelete="SET NULL"))
    login_banner_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    updated_by_role: Mapped[Optional[str]] = mapped_column(String(16))
    updated_by_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    topbar_logo: Mapped[Optional[BrandingAsset]] = relationship("BrandingAsset", foreign_keys=[topbar_logo_asset_id])
    institution_logo: Mapped[Optional[BrandingAsset]] = relationship("BrandingAsset", foreign_keys=[institution_logo_asset_id])
    login_banner: Mapped[Optional[BrandingAsset]] = relationship("BrandingAsset", foreign_keys=[login_banner_asset_id])

    __table_args__ = (
        CheckConstraint("settings_id = 1", name="singleton_branding_settings"),
        CheckConstraint("institution_logo_display_size_px BETWEEN 40 AND 96", name="chk_institution_logo_display_size"),
    )
