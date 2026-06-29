from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import AsyncIterator
from urllib.parse import quote, unquote, urlsplit, urlunsplit

import asyncpg
import pytest_asyncio
from httpx import ASGITransport, AsyncClient


ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"
TEST_DB_ENV = "TEST_DATABASE_URL"


def _sync_dsn(async_dsn: str) -> str:
    return async_dsn.replace("postgresql+asyncpg://", "postgresql://", 1)


def _database_name(dsn: str) -> str:
    path = urlsplit(dsn).path.lstrip("/")
    return unquote(path.split("/", 1)[0])


def _with_database(dsn: str, database: str) -> str:
    parts = urlsplit(dsn)
    return urlunsplit((parts.scheme, parts.netloc, f"/{quote(database)}", parts.query, parts.fragment))


def _derive_test_database_url(database_url: str) -> str:
    name = _database_name(database_url)
    if not name:
        raise RuntimeError("DATABASE_URL must include a database name")
    if name.endswith("_test"):
        return database_url
    return _with_database(database_url, f"{name}_test")


def _assert_test_database(database_url: str) -> None:
    name = _database_name(database_url)
    if not (name.endswith("_test") or name.startswith("test_")):
        raise RuntimeError(
            f"Refusing to run backend tests on non-test database '{name}'. "
            f"Set {TEST_DB_ENV} to a dedicated database ending with '_test'."
        )


async def _ensure_database_exists(test_database_url: str) -> None:
    sync_test_url = _sync_dsn(test_database_url)
    db_name = _database_name(sync_test_url)
    server_url = _with_database(sync_test_url, "postgres")
    conn = await asyncpg.connect(server_url)
    try:
        exists = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", db_name)
        if not exists:
            await conn.execute(f'CREATE DATABASE "{db_name}"')
    finally:
        await conn.close()


async def _reset_public_schema(test_database_url: str) -> None:
    conn = await asyncpg.connect(_sync_dsn(test_database_url))
    try:
        await conn.execute("DROP SCHEMA IF EXISTS public CASCADE")
        await conn.execute("CREATE SCHEMA public")
        await conn.execute("GRANT ALL ON SCHEMA public TO public")
    finally:
        await conn.close()


def _run_env() -> dict[str, str]:
    env = os.environ.copy()
    env["DATABASE_URL"] = os.environ["DATABASE_URL"]
    env["SEED_DEMO"] = "1"
    return env


configured_database_url = os.environ.get(TEST_DB_ENV) or _derive_test_database_url(
    os.environ.get(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:12345678@localhost:5432/verifika",
    ),
)
_assert_test_database(configured_database_url)
os.environ["DATABASE_URL"] = configured_database_url
os.environ.setdefault("JWT_SECRET", "test-secret-for-backend-tests-32-chars")
os.environ.setdefault("AI_ENABLED", "false")

from app.main import app  # noqa: E402
from app.db.session import Base, engine  # noqa: E402
import app.db.models as _models  # noqa: E402,F401


@pytest_asyncio.fixture(scope="session", autouse=True, loop_scope="session")
async def _bootstrap_once():
    await _ensure_database_exists(configured_database_url)
    await _reset_public_schema(configured_database_url)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    proc = await asyncio.create_subprocess_exec(
        "alembic",
        "stamp",
        "head",
        cwd=BACKEND_DIR,
        env=_run_env(),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(
            "alembic stamp head failed:\n"
            f"{stdout.decode(errors='replace')}\n{stderr.decode(errors='replace')}"
        )

    proc_seed = await asyncio.create_subprocess_exec(
        "python",
        "-m",
        "scripts.seed",
        cwd=BACKEND_DIR,
        env=_run_env(),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc_seed.communicate()
    if proc_seed.returncode != 0:
        raise RuntimeError(
            "python -m scripts.seed failed:\n"
            f"{stdout.decode(errors='replace')}\n{stderr.decode(errors='replace')}"
        )


@pytest_asyncio.fixture(loop_scope="session")
async def client() -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
