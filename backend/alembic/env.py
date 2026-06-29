from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import get_settings
from app.db.session import Base

# Импортируем все модели, чтобы MetaData была заполнена
import app.db.models  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Генерация SQL без подключения к БД."""
    settings = get_settings()
    context.configure(
        url=settings.database_url.replace("+asyncpg", ""),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        render_as_batch=False,
    )
    with context.begin_transaction():
        # Advisory lock для предотвращения параллельного запуска миграций
        connection.execute(sa.text("SELECT pg_advisory_xact_lock(14863821)"))
        context.run_migrations()


async def run_migrations_online() -> None:
    """Применение миграций через async-engine."""
    settings = get_settings()
    connectable = create_async_engine(settings.database_url)

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
