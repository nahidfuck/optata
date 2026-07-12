"""Tests run against the real Postgres from DATABASE_URL (Supabase dev).

Isolation: every test runs inside one outer transaction on one connection;
the app's sessions join it via savepoints, and the whole thing is rolled
back at the end. Nothing a test writes ever lands in the database.
"""

import uuid
from collections.abc import AsyncIterator

import pytest
from alembic import command
from alembic.config import Config as AlembicConfig
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncConnection, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import get_settings
from app.db import get_db
from app.main import app
from app.rate_limit import limiter


@pytest.fixture(scope="session", autouse=True)
def apply_migrations() -> None:
    command.upgrade(AlembicConfig("alembic.ini"), "head")


@pytest.fixture(autouse=True)
def disable_rate_limits() -> AsyncIterator[None]:
    limiter.enabled = False
    yield
    limiter.enabled = True


class StorageRecorder:
    """What the app THINKS it stored/deleted. Tests never touch real storage."""

    def __init__(self) -> None:
        self.uploads: dict[str, bytes] = {}
        self.deletes: list[str] = []
        self.fail_uploads = False
        self.fail_deletes = False


@pytest.fixture(autouse=True)
def fake_storage(monkeypatch: pytest.MonkeyPatch) -> StorageRecorder:
    from app.storage import Storage, StorageError

    recorder = StorageRecorder()

    async def fake_upload(self: Storage, path: str, content: bytes) -> None:
        if recorder.fail_uploads:
            raise StorageError
        recorder.uploads[path] = content

    async def fake_delete(self: Storage, path: str) -> None:
        if recorder.fail_deletes:
            return  # real impl logs and swallows — same observable behavior
        recorder.deletes.append(path)

    monkeypatch.setattr(Storage, "upload_item_image", fake_upload)
    monkeypatch.setattr(Storage, "delete_item_image", fake_delete)
    return recorder


@pytest.fixture
async def db_connection() -> AsyncIterator[AsyncConnection]:
    engine = create_async_engine(get_settings().database_url, poolclass=NullPool)
    async with engine.connect() as connection:
        transaction = await connection.begin()
        try:
            yield connection
        finally:
            await transaction.rollback()
    await engine.dispose()


@pytest.fixture
async def db_session(db_connection: AsyncConnection):
    """Direct DB access joining the same rolled-back transaction as the app."""
    session_factory = async_sessionmaker(
        bind=db_connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    async with session_factory() as session:
        yield session


@pytest.fixture
async def client(db_connection: AsyncConnection) -> AsyncIterator[AsyncClient]:
    session_factory = async_sessionmaker(
        bind=db_connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def unique() -> str:
    """Suffix so fixtures never collide, even if a rollback is ever skipped."""
    return uuid.uuid4().hex[:8]
