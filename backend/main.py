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

Tracing (Cloud Trace)
    TRACE_TO_CLOUD=true                 – export ADK OpenTelemetry spans
                                          (invoke_agent, generate_content,
                                          execute_tool) to Cloud Trace in
                                          GOOGLE_CLOUD_PROJECT. LLM spans carry
                                          gen_ai.usage.* token counts; spans
                                          carry the ADK session ID as
                                          gen_ai.conversation.id.
    OTEL_TRACES_SAMPLER                  – defaults to always_on when tracing to
                                          Cloud. Cloud Run's incoming traceparent
                                          header is usually "not sampled", and
                                          the parent-based default would drop
                                          every agent span.
    ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS – whether prompts / responses are added
                                          to spans. Defaults to false here when
                                          tracing to Cloud (conversations hold
                                          health details and locations); set it
                                          to true to include them.

Metrics (Cloud Monitoring)
    METRICS_TO_CLOUD=true               – export ADK's GenAI metrics (token
                                          usage, LLM / agent / tool latency) to
                                          Cloud Monitoring through the Telemetry
                                          API (telemetry.googleapis.com, OTLP).

Cloud Run throttles CPU as soon as a response finishes, so the exporters'
background threads may never run. FlushTelemetryMiddleware exports pending
spans before each response's final chunk, and metrics at most every
METRICS_FLUSH_INTERVAL_S seconds (Cloud Monitoring rejects points written more
often than every 5 s; values are cumulative, so a skipped flush loses nothing).
Both are flushed again on shutdown.

Application API (/app-api, see backend/app_api)
    Patient accounts, login sessions, consultation logs and appointments in a
    separate database: APP_DB_URI, or Cloud SQL database APP_DB_NAME (default
    ``careconnect_app``) when INSTANCE_CONNECTION_NAME is set, otherwise a
    local SQLite file (.careconnect_app.db). Tables are created at startup.
    ConsultationLogPlugin (an ADK plugin) stores every message, agent reply and
    tool call of each consultation.

Run locally (from the repository root):
    uvicorn backend.main:app --port 8000
"""

from __future__ import annotations

import logging
import os
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import quote_plus

import anyio
import dotenv
from google.adk.cli.fast_api import get_fast_api_app
from opentelemetry import metrics, trace

from backend.app_api.db import dispose_db, init_db
from backend.app_api.routes import router as app_api_router

REPO_ROOT = Path(__file__).resolve().parent.parent

# Load .env for local development (no-op on Cloud Run, where env vars are set
# on the service).
dotenv.load_dotenv(REPO_ROOT / ".env")

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
logger = logging.getLogger("backend")


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.environ.get(name, "").strip().lower()
    return default if not value else value in {"1", "true", "yes", "on"}


TRACE_TO_CLOUD = _env_flag("TRACE_TO_CLOUD")
METRICS_TO_CLOUD = _env_flag("METRICS_TO_CLOUD")
# Never below Cloud Monitoring's 5 s minimum gap between points of a series.
METRICS_FLUSH_INTERVAL_S = max(5.5, float(os.environ.get("METRICS_FLUSH_INTERVAL_S", "10")))

if TRACE_TO_CLOUD:
    # Keep conversation text out of Cloud Trace unless explicitly enabled.
    # ADK reads this per run; token counts and timings are recorded either way.
    os.environ.setdefault("ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS", "false")
    # Cloud Run adds a traceparent header to every request, usually marked
    # "not sampled". The default OTel sampler follows the parent, which would
    # drop every agent span, so record all traces unless overridden. Must be
    # set before get_fast_api_app() creates the TracerProvider.
    os.environ.setdefault("OTEL_TRACES_SAMPLER", "always_on")
    logger.info(
        "Cloud Trace export enabled (sampler: %s, message content in spans: %s)",
        os.environ["OTEL_TRACES_SAMPLER"],
        os.environ["ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS"],
    )

if METRICS_TO_CLOUD:
    # Installs a global MeterProvider before ADK records its first metric. It
    # only sets up metrics; tracing is still configured by get_fast_api_app().
    import math

    import google.auth
    from google.adk.telemetry.google_cloud import get_gcp_resource
    from google.adk.telemetry.setup import OTelHooks, maybe_set_otel_providers
    from google.auth.transport.requests import AuthorizedSession
    from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader

    # Becomes the `job` label in Cloud Monitoring; the dashboard filters on the
    # Cloud Run service name, so local runs report under a different name.
    os.environ.setdefault(
        "OTEL_SERVICE_NAME", os.environ.get("K_SERVICE", "doctor-appointment-api-local")
    )
    # The Telemetry API rejects points without a location ("Unrecognized region
    # or location"). On Cloud Run the GCP resource detector supplies the real
    # region and overrides this; elsewhere (local runs) fall back to REGION.
    _attrs = os.environ.get("OTEL_RESOURCE_ATTRIBUTES", "")
    if os.environ.get("REGION") and "cloud.region=" not in _attrs:
        os.environ["OTEL_RESOURCE_ATTRIBUTES"] = ",".join(
            filter(None, [_attrs, f"cloud.region={os.environ['REGION']}"])
        )
    _credentials, _detected_project = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    _project = os.environ.get("GOOGLE_CLOUD_PROJECT") or _detected_project
    # Same OTLP exporter ADK uses for Cloud Monitoring (telemetry.googleapis.com),
    # but with background export disabled (math.inf): on Cloud Run that thread
    # is CPU-starved, and racing it against the per-request flush would write
    # points closer together than Cloud Monitoring's 5 s minimum.
    # FlushTelemetryMiddleware and the shutdown hook do all the exporting.
    _metric_reader = PeriodicExportingMetricReader(
        OTLPMetricExporter(
            session=AuthorizedSession(credentials=_credentials),
            endpoint="https://telemetry.googleapis.com/v1/metrics",
        ),
        export_interval_millis=math.inf,
    )
    maybe_set_otel_providers(
        otel_hooks_to_setup=[OTelHooks(metric_readers=[_metric_reader])],
        otel_resource=get_gcp_resource(_project),
    )
    logger.info("Cloud Monitoring metrics export enabled (service: %s)", os.environ["OTEL_SERVICE_NAME"])

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


# ── Telemetry flushing ──────────────────────────────────────────────────────

_flush_lock = threading.Lock()
_last_metrics_flush = 0.0
_MIN_POINT_GAP_S = 5.5  # Cloud Monitoring: at most one point per series per 5 s
_first_flush_logged: set[str] = set()


def _flush_provider(kind: str, provider) -> None:
    flush = getattr(provider, "force_flush", None)
    if not callable(flush):
        return
    started = time.monotonic()
    ok = flush(timeout_millis=10_000)
    elapsed = time.monotonic() - started
    if kind not in _first_flush_logged:
        _first_flush_logged.add(kind)
        logger.info("First %s flush: ok=%s in %.2fs", kind, ok, elapsed)
    if not ok:
        logger.warning("%s flush did not finish within 10s; data may be delayed or lost", kind)
    elif elapsed > 2:
        logger.info("%s flush took %.1fs", kind, elapsed)


def _flush_telemetry(force_metrics: bool = False) -> None:
    global _last_metrics_flush
    if TRACE_TO_CLOUD:
        _flush_provider("trace", trace.get_tracer_provider())
    if METRICS_TO_CLOUD:
        with _flush_lock:
            since_last = time.monotonic() - _last_metrics_flush
            if not force_metrics and since_last < METRICS_FLUSH_INTERVAL_S:
                return
            if force_metrics and since_last < _MIN_POINT_GAP_S:
                # Shutdown right after a request: wait out Cloud Monitoring's
                # minimum gap so this final write isn't rejected.
                time.sleep(_MIN_POINT_GAP_S - since_last)
            _last_metrics_flush = time.monotonic()
        _flush_provider("metrics", metrics.get_meter_provider())


class FlushTelemetryMiddleware:
    """Export telemetry before each HTTP response completes (see module docstring).

    For /run_sse, the agent run has finished by the final body chunk, so its
    spans and metric points are included.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_flush(message):
            if message["type"] == "http.response.body" and not message.get("more_body", False):
                try:
                    await anyio.to_thread.run_sync(_flush_telemetry)
                except Exception:  # never fail a response because of telemetry
                    logger.exception("Flushing telemetry failed")
            await send(message)

        await self.app(scope, receive, send_with_flush)


@asynccontextmanager
async def lifespan(_app):
    await init_db()
    yield
    await dispose_db()
    # Cloud Run sends SIGTERM and allows a short grace period with CPU before
    # stopping an instance: send whatever is still buffered.
    if TRACE_TO_CLOUD or METRICS_TO_CLOUD:
        try:
            await anyio.to_thread.run_sync(lambda: _flush_telemetry(force_metrics=True))
        except Exception:
            logger.exception("Flushing telemetry on shutdown failed")


# ── App ─────────────────────────────────────────────────────────────────────

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
    trace_to_cloud=TRACE_TO_CLOUD,
    lifespan=lifespan,
    # Stores every consultation turn in the application database.
    extra_plugins=["backend.app_api.log_plugin.consultation_log_plugin"],
)
app.include_router(app_api_router)

if TRACE_TO_CLOUD or METRICS_TO_CLOUD:
    app.add_middleware(FlushTelemetryMiddleware)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
