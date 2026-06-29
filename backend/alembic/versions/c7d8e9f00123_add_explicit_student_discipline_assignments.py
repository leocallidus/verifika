"""add explicit student discipline assignments

Revision ID: c7d8e9f00123
Revises: 26d71aa38bc4
Create Date: 2026-06-23 00:00:00.000000

R-01: student discipline availability must come from explicit group/student
assignments, not from teacher_disciplines.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7d8e9f00123"
down_revision: Union[str, None] = "26d71aa38bc4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "group_disciplines",
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("discipline_id", sa.Integer(), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("assigned_by_admin_id", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(["group_id"], ["groups.group_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["discipline_id"], ["disciplines.discipline_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assigned_by_admin_id"], ["admins.admin_id"]),
        sa.PrimaryKeyConstraint("group_id", "discipline_id"),
    )
    op.create_index("idx_group_disciplines_group", "group_disciplines", ["group_id"])
    op.create_index("idx_group_disciplines_discipline", "group_disciplines", ["discipline_id"])

    op.create_table(
        "student_disciplines",
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("discipline_id", sa.Integer(), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("assigned_by_admin_id", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(["student_id"], ["students.student_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["discipline_id"], ["disciplines.discipline_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assigned_by_admin_id"], ["admins.admin_id"]),
        sa.PrimaryKeyConstraint("student_id", "discipline_id"),
    )
    op.create_index("idx_student_disciplines_student", "student_disciplines", ["student_id"])
    op.create_index("idx_student_disciplines_discipline", "student_disciplines", ["discipline_id"])

    # Preserve existing deployments: what used to be globally visible because a
    # teacher was attached becomes an explicit assignment for every active group.
    op.execute(
        """
        INSERT INTO group_disciplines (group_id, discipline_id)
        SELECT DISTINCT s.group_id, td.discipline_id
          FROM students s
          JOIN teacher_disciplines td ON TRUE
          JOIN disciplines d ON d.discipline_id = td.discipline_id
         WHERE s.archived_at IS NULL
           AND d.archived_at IS NULL
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index("idx_student_disciplines_discipline", table_name="student_disciplines")
    op.drop_index("idx_student_disciplines_student", table_name="student_disciplines")
    op.drop_table("student_disciplines")
    op.drop_index("idx_group_disciplines_discipline", table_name="group_disciplines")
    op.drop_index("idx_group_disciplines_group", table_name="group_disciplines")
    op.drop_table("group_disciplines")
