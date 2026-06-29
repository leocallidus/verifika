"""add_ai_generation_fields

Revision ID: b094bf95c97e
Revises: 496a0475c370
Create Date: 2026-06-19 11:00:26.800693
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers
revision: str = 'b094bf95c97e'
down_revision: Union[str, None] = '496a0475c370'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Поля в questions
    op.add_column("questions", sa.Column("ai_status",       sa.String(32),  nullable=True))
    op.add_column("questions", sa.Column("ai_model_used",   sa.String(128), nullable=True))
    op.add_column("questions", sa.Column("ai_reviewed_by",  sa.Integer(),   nullable=True))
    op.add_column("questions", sa.Column("ai_reviewed_at",  sa.DateTime(timezone=True), nullable=True))
    op.add_column("questions", sa.Column("ai_generated_at", sa.DateTime(timezone=True), nullable=True))

    op.create_foreign_key(
        "fk_questions_ai_reviewed_by",
        "questions", "teachers",
        ["ai_reviewed_by"], ["teacher_id"],
    )
    op.create_check_constraint(
        "chk_questions_ai_status",
        "questions",
        "ai_status IS NULL OR ai_status IN ('pending_review', 'approved')",
    )
    op.create_index(
        "idx_questions_ai_status", "questions",
        ["ai_status", "discipline_id"],
        postgresql_where=sa.text("ai_status = 'pending_review'"),
    )

    # Таблица задач генерации
    op.create_table(
        "ai_generation_tasks",
        sa.Column("task_id",         sa.String(36),  primary_key=True),
        sa.Column("teacher_id",      sa.Integer(),
                  sa.ForeignKey("teachers.teacher_id"), nullable=False),
        sa.Column("discipline_id",   sa.Integer(),
                  sa.ForeignKey("disciplines.discipline_id"), nullable=False),
        sa.Column("topic_id",        sa.BigInteger(),
                  sa.ForeignKey("discipline_topics.topic_id", ondelete="SET NULL"), nullable=True),
        sa.Column("status",          sa.String(16), server_default="processing"),
        sa.Column("generated_count", sa.Integer(),  server_default="0"),
        sa.Column("error_message",   sa.Text(),     nullable=True),
        sa.Column("created_at",      sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at",    sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('processing','done','error')", name="chk_gen_status"),
    )
    op.create_index("idx_gen_tasks_teacher", "ai_generation_tasks", ["teacher_id", "created_at"])


def downgrade() -> None:
    op.drop_table("ai_generation_tasks")
    op.drop_index("idx_questions_ai_status", table_name="questions")
    op.drop_constraint("chk_questions_ai_status", "questions")
    op.drop_constraint("fk_questions_ai_reviewed_by", "questions")
    op.drop_column("questions", "ai_generated_at")
    op.drop_column("questions", "ai_reviewed_at")
    op.drop_column("questions", "ai_reviewed_by")
    op.drop_column("questions", "ai_model_used")
    op.drop_column("questions", "ai_status")
