"""
Backend API service — FastAPI + Google ADK

This is the production entrypoint for the Doctor Appointment Scheduler agents.
It exposes the ADK API server (sessions, /run, /run_sse, ...) WITHOUT the ADK
developer web UI. The patient-facing React UI lives in ../frontend and talks to
this service through its own server-side proxy (Cloud Run service-to-service
auth with Google ID tokens).

App name
    The ADK app name is the name of the agent package folder: ``agents``.
    ``agents/__init__.py`` exports ``root_agent``.

Session storage (first match wins)
    1. SESSION_SERVICE_URI              – any URI ADK understands
    2. INSTANCE_CONNECTION_NAME is set  – Cloud SQL (MySQL) via the Cloud Run
                                          unix socket, database SESSION_DB_NAME
                                          (default ``adk_sessions``), using
                                          DB_USER / DB_PASSWORD
    3. otherwise                        – local SQLite file (.adk_sessions.db)

Run locally (from the repository root):
    uvicorn backend.main:app --port 8000
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from urllib.parse import quote_plus

import dotenv
from google.adk.cli.fast_api import get_fast_api_app

REPO_ROOT = Path(__file__).resolve().parent.parent

# Load .env for local development (no-op on Cloud Run, where env vars are set
# on the service).
dotenv.load_dotenv(REPO_ROOT / ".env")

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
logger = logging.getLogger("backend")

# The directory that CONTAINS the agent package (``agents/``).
AGENTS_DIR = str(REPO_ROOT)


def resolve_session_uri() -> str:
    """Pick the session store from the environment (see module docstring)."""
    explicit = os.environ.get("SESSION_SERVICE_URI", "").strip()
    if explicit:
        return explicit

    instance = os.environ.get("INSTANCE_CONNECTION_NAME", "").strip()
    if instance:
        user = os.environ.get("DB_USER", "")
        password = os.environ.get("DB_PASSWORD", "")
        if not user or not password:
            raise RuntimeError(
                "INSTANCE_CONNECTION_NAME is set but DB_USER / DB_PASSWORD are missing."
            )
        db_name = os.environ.get("SESSION_DB_NAME", "adk_sessions")
        # ADK's DatabaseSessionService uses async SQLAlchemy -> aiomysql driver.
        return (
            f"mysql+aiomysql://{quote_plus(user)}:{quote_plus(password)}@/{db_name}"
            f"?unix_socket=/cloudsql/{instance}"
        )

    return f"sqlite+aiosqlite:///{(REPO_ROOT / '.adk_sessions.db').as_posix()}"


def _redact(uri: str) -> str:
    """Hide the password when logging a database URI."""
    if "@" in uri and "://" in uri:
        scheme, rest = uri.split("://", 1)
        creds, host = rest.split("@", 1)
        user = creds.split(":", 1)[0]
        return f"{scheme}://{user}:***@{host}"
    return uri


SESSION_SERVICE_URI = resolve_session_uri()
ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()
]
logger.info("Session store: %s", _redact(SESSION_SERVICE_URI))

session_db_kwargs = (
    {"pool_recycle": 1800} if SESSION_SERVICE_URI.startswith("mysql") else None
)

app = get_fast_api_app(
    agents_dir=AGENTS_DIR,
    session_service_uri=SESSION_SERVICE_URI,
    session_db_kwargs=session_db_kwargs,
    # The agents don't produce artifacts; keep them out of the container FS.
    artifact_service_uri=os.environ.get("ARTIFACT_SERVICE_URI", "memory://"),
    allow_origins=ALLOWED_ORIGINS or None,
    web=False,  # API only — the React frontend is a separate Cloud Run service.
)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
