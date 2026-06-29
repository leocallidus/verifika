"""add_institution_logo_enabled

Revision ID: 3b6f0e1a7c91
Revises: 9757a7246c52
Create Date: 2026-06-28 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "3b6f0e1a7c91"
down_revision: Union[str, None] = "9757a7246c52"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "app_branding_settings",
        sa.Column(
            "institution_logo_enabled",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("app_branding_settings", "institution_logo_enabled")
