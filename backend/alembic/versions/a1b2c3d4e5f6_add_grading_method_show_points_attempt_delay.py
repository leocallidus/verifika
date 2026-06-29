"""add grading_method, show_question_points, attempt_delay_minutes, passing_score_percent, question points

Revision ID: a1b2c3d4e5f6
Revises: 8b64321488d4
Create Date: 2026-06-18 12:30:00.000000

tz-student-role-improvement.md §11 — новые поля управления попытками и оценкой.
Все поля имеют server_default / nullable, поэтому существующие данные не ломаются.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "8b64321488d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "teacher_topic_tests",
        sa.Column("passing_score_percent", sa.Integer(), nullable=True),
    )
    op.add_column(
        "teacher_topic_tests",
        sa.Column("grading_method", sa.String(length=8), server_default="best", nullable=False),
    )
    op.add_column(
        "teacher_topic_tests",
        sa.Column("show_question_points", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )
    op.add_column(
        "teacher_topic_tests",
        sa.Column("attempt_delay_minutes", sa.Integer(), nullable=True),
    )
    op.add_column(
        "questions",
        sa.Column("points", sa.Numeric(), server_default="1", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("questions", "points")
    op.drop_column("teacher_topic_tests", "attempt_delay_minutes")
    op.drop_column("teacher_topic_tests", "show_question_points")
    op.drop_column("teacher_topic_tests", "grading_method")
    op.drop_column("teacher_topic_tests", "passing_score_percent")
