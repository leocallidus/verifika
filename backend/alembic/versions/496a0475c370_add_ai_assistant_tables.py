"""add_ai_assistant_tables

Revision ID: 496a0475c370
Revises: 0fa13e384642
Create Date: 2026-06-19 11:00:26.368670
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers
revision: str = '496a0475c370'
down_revision: Union[str, None] = '0fa13e384642'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_chats",
        sa.Column("chat_id",     sa.BigInteger(), primary_key=True),
        sa.Column("user_role",   sa.String(16), nullable=False),
        sa.Column("user_id",     sa.BigInteger(), nullable=False),
        sa.Column("title",       sa.String(255), nullable=True),
        sa.Column("created_at",  sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at",  sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("user_role IN ('student','teacher','admin')", name="chk_ai_chat_role"),
    )
    op.create_index(
        "idx_ai_chats_user", "ai_chats",
        ["user_role", "user_id", "created_at"],
        postgresql_where=sa.text("archived_at IS NULL"),
    )
    op.create_table(
        "ai_messages",
        sa.Column("message_id",  sa.BigInteger(), primary_key=True),
        sa.Column("chat_id",     sa.BigInteger(),
                  sa.ForeignKey("ai_chats.chat_id", ondelete="CASCADE"), nullable=False),
        sa.Column("role",        sa.String(16), nullable=False),
        sa.Column("content",     sa.Text(), nullable=False),
        sa.Column("tokens_used", sa.Integer(), nullable=True),
        sa.Column("model_used",  sa.String(128), nullable=True),
        sa.Column("created_at",  sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("role IN ('user','assistant','system')", name="chk_ai_msg_role"),
    )
    op.create_index("idx_ai_messages_chat", "ai_messages", ["chat_id", "created_at"])


def downgrade() -> None:
    op.drop_table("ai_messages")
    op.drop_table("ai_chats")
