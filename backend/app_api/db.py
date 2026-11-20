"""Database engine for the application database (users, sessions, logs, appointments).

Connection (first match wins)
    1. APP_DB_URI                       – any async SQLAlchemy URI
    2. INSTANCE_CONNECTION_NAME is set  – Cloud SQL (MySQL) over the Cloud Run
                                          unix socket, database APP_DB_NAME
                                          (default ``careconnect_app``)
    3. otherwise                        – local SQLite file (.careconnect_app.db)
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from urllib.parse import quote_plus

from sqlalchemy import event, inspect, text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from .models import metadata

logger = logging.getLogger("backend.app_api")

REPO_ROOT = Path(__file__).resolve().parents[2]


def build_cloudsql_uri(db_name: str) -> str | None:
    """aiomysql URI for ``db_name`` via the Cloud SQL socket, or None when not on Cloud SQL."""
    instance = os.environ.get("INSTANCE_CONNECTION_NAME", "").strip()
    if not instance:
        return None
    user = os.environ.get("DB_USER", "")
    password = os.environ.get("DB_PASSWORD", "")
    if not user or not password:
        raise RuntimeError("INSTANCE_CONNECTION_NAME is set but DB_USER / DB_PASSWORD are missing.")
    return (
        f"mysql+aiomysql://{quote_plus(user)}:{quote_plus(password)}@/{db_name}"
        f"?unix_socket=/cloudsql/{instance}&charset=utf8mb4"
    )


def resolve_app_db_uri() -> str:
    explicit = os.environ.get("APP_DB_URI", "").strip()
    if explicit:
        return explicit
    cloudsql = build_cloudsql_uri(os.environ.get("APP_DB_NAME", "careconnect_app"))
    if cloudsql:
        return cloudsql
    return f"sqlite+aiosqlite:///{(REPO_ROOT / '.careconnect_app.db').as_posix()}"


def make_engine(uri: str) -> AsyncEngine:
    if uri.startswith("sqlite"):
        engine = create_async_engine(uri)

        @event.listens_for(engine.sync_engine, "connect")
        def _sqlite_fk(dbapi_conn, _record):  # enforce FOREIGN KEYs like MySQL does
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        return engine
    return create_async_engine(uri, pool_recycle=1800, pool_pre_ping=True, pool_size=5, max_overflow=5)


_engine: AsyncEngine | None = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = make_engine(resolve_app_db_uri())
    return _engine


def set_engine(engine: AsyncEngine) -> None:
    """Swap the engine (tests)."""
    global _engine
    _engine = engine


# Columns added after the first release. create_all() only creates missing
# tables, so these are added to existing tables here (additive, idempotent).
ADDED_COLUMNS: list[tuple[str, str, str]] = [
    ("appointments", "time_zone", "VARCHAR(64) NULL"),
]


def _add_missing_columns(sync_conn) -> None:
    inspector = inspect(sync_conn)
    for table, column, ddl in ADDED_COLUMNS:
        existing = {c["name"] for c in inspector.get_columns(table)}
        if column not in existing:
            sync_conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
            logger.info("Added column %s.%s", table, column)


async def init_db() -> None:
    """Create the application tables if they don't exist yet, then add new columns."""
    async with get_engine().begin() as conn:
        await conn.run_sync(metadata.create_all)
        await conn.run_sync(_add_missing_columns)
    logger.info("Application database ready")


async def dispose_db() -> None:
    if _engine is not None:
        await _engine.dispose()
