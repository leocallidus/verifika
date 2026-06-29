"""add unique answer comments per session question

Revision ID: e8f9a0b1c2d3
Revises: 15fa183094d0
Create Date: 2026-06-25 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op


revision: str = "e8f9a0b1c2d3"
down_revision: Union[str, None] = "15fa183094d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        DELETE FROM answer_comments ac
         USING answer_comments newer
         WHERE ac.session_id = newer.session_id
           AND ac.question_id = newer.question_id
           AND (
             newer.created_at > ac.created_at
             OR (newer.created_at = ac.created_at AND newer.comment_id > ac.comment_id)
           )
        """
    )
    op.create_unique_constraint(
        "uq_answer_comments_session_question",
        "answer_comments",
        ["session_id", "question_id"],
    )
    op.create_index(
        "idx_answer_comments_session",
        "answer_comments",
        ["session_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_answer_comments_session", table_name="answer_comments")
    op.drop_constraint(
        "uq_answer_comments_session_question",
        "answer_comments",
        type_="unique",
    )
