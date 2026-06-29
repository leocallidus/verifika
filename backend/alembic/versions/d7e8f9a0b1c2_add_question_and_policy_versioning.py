"""add question and test policy versioning

Revision ID: d7e8f9a0b1c2
Revises: c7d8e9f00123
Create Date: 2026-06-23 12:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d7e8f9a0b1c2"
down_revision: Union[str, None] = "c7d8e9f00123"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _drop_fk_if_exists(table_name: str, constraint_name: str) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    names = {fk["name"] for fk in inspector.get_foreign_keys(table_name)}
    if constraint_name in names:
        op.drop_constraint(constraint_name, table_name, type_="foreignkey")


def upgrade() -> None:
    op.create_table(
        "question_versions",
        sa.Column("question_version_id", sa.BigInteger(), primary_key=True),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("created_by_teacher_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["question_id"], ["questions.question_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_teacher_id"], ["teachers.teacher_id"]),
        sa.UniqueConstraint("question_id", "version_no", name="uq_question_versions_question_no"),
    )
    op.create_index("idx_question_versions_question", "question_versions", ["question_id", "version_no"])

    op.create_table(
        "test_policy_versions",
        sa.Column("policy_version_id", sa.BigInteger(), primary_key=True),
        sa.Column("scope", sa.String(length=16), nullable=False),
        sa.Column("teacher_id", sa.Integer(), nullable=False),
        sa.Column("discipline_id", sa.Integer(), nullable=False),
        sa.Column("topic_id", sa.BigInteger(), nullable=True),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("created_by_teacher_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("scope IN ('discipline','topic')", name="test_policy_versions_scope_check"),
        sa.ForeignKeyConstraint(["teacher_id"], ["teachers.teacher_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["discipline_id"], ["disciplines.discipline_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["topic_id"], ["discipline_topics.topic_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_teacher_id"], ["teachers.teacher_id"]),
    )
    op.create_index(
        "idx_test_policy_versions_scope",
        "test_policy_versions",
        ["scope", "teacher_id", "discipline_id", "topic_id", "version_no"],
    )
    op.create_index(
        "uq_test_policy_versions_discipline_no",
        "test_policy_versions",
        ["teacher_id", "discipline_id", "version_no"],
        unique=True,
        postgresql_where=sa.text("scope = 'discipline' AND topic_id IS NULL"),
    )
    op.create_index(
        "uq_test_policy_versions_topic_no",
        "test_policy_versions",
        ["teacher_id", "discipline_id", "topic_id", "version_no"],
        unique=True,
        postgresql_where=sa.text("scope = 'topic' AND topic_id IS NOT NULL"),
    )

    op.add_column("test_sessions", sa.Column("policy_version_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_test_sessions_policy_version_id_test_policy_versions",
        "test_sessions",
        "test_policy_versions",
        ["policy_version_id"],
        ["policy_version_id"],
    )

    op.create_table(
        "test_session_questions",
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("question_version_id", sa.BigInteger(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["test_sessions.session_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["question_id"], ["questions.question_id"]),
        sa.ForeignKeyConstraint(["question_version_id"], ["question_versions.question_version_id"]),
        sa.PrimaryKeyConstraint("session_id", "question_id"),
        sa.UniqueConstraint("session_id", "position", name="uq_test_session_questions_position"),
    )
    op.create_index("idx_test_session_questions_version", "test_session_questions", ["question_version_id"])

    _drop_fk_if_exists("student_answers", "fk_student_answers_selected_option_id_answer_options")


def downgrade() -> None:
    op.create_foreign_key(
        "fk_student_answers_selected_option_id_answer_options",
        "student_answers",
        "answer_options",
        ["selected_option_id"],
        ["option_id"],
    )
    op.drop_index("idx_test_session_questions_version", table_name="test_session_questions")
    op.drop_table("test_session_questions")
    op.drop_constraint(
        "fk_test_sessions_policy_version_id_test_policy_versions",
        "test_sessions",
        type_="foreignkey",
    )
    op.drop_column("test_sessions", "policy_version_id")
    op.drop_index("uq_test_policy_versions_topic_no", table_name="test_policy_versions")
    op.drop_index("uq_test_policy_versions_discipline_no", table_name="test_policy_versions")
    op.drop_index("idx_test_policy_versions_scope", table_name="test_policy_versions")
    op.drop_table("test_policy_versions")
    op.drop_index("idx_question_versions_question", table_name="question_versions")
    op.drop_table("question_versions")
