"""ADK plugin that records every consultation turn in the application database.

Loaded through ``get_fast_api_app(extra_plugins=[...])`` in backend/main.py, so
the agents package stays unchanged. For each run it stores:
  * the patient's message                       (kind = "user")
  * every final (non-partial) agent text reply  (kind = "agent")
  * every tool call and tool result             (kind = "tool_call" / "tool_result")

Rows are keyed by consultation (= ADK session id), user and login session
(``auth_session_id`` from the session state the BFF sets when it creates the
session). Sessions with no ``consultations`` row (e.g. the ADK dev UI) are
skipped. Logging failures never break the conversation.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from google.adk.agents.invocation_context import InvocationContext
from google.adk.events.event import Event
from google.adk.plugins.base_plugin import BasePlugin
from google.genai import types
from sqlalchemy import insert, select, update

from .db import get_engine
from .models import consultation_messages, consultations
from .routes import utcnow

logger = logging.getLogger("backend.app_api.log_plugin")

MAX_CONTENT_CHARS = 64_000
TITLE_CHARS = 120


def _clip(text: str) -> str:
    return text if len(text) <= MAX_CONTENT_CHARS else text[: MAX_CONTENT_CHARS - 15] + "… [truncated]"


def _json(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        return str(value)


def _text_of(content: types.Content | None) -> str:
    if not content or not content.parts:
        return ""
    return "".join(p.text for p in content.parts if p.text and not p.thought).strip()


def rows_for_event(event: Event) -> list[dict[str, Any]]:
    """Message rows (without ids / timestamps) for one runner event."""
    if event.partial or not event.content or not event.content.parts:
        return []
    rows: list[dict[str, Any]] = []
    base = {"author": event.author or "agent", "event_id": event.id, "invocation_id": event.invocation_id}
    for part in event.content.parts:
        if part.function_call:
            fc = part.function_call
            rows.append({**base, "kind": "tool_call", "tool_name": fc.name, "content": _clip(_json(fc.args or {}))})
        elif part.function_response:
            fr = part.function_response
            rows.append({**base, "kind": "tool_result", "tool_name": fr.name, "content": _clip(_json(fr.response))})
    text = _text_of(event.content)
    if text and event.author != "user":
        rows.append({**base, "kind": "agent", "tool_name": None, "content": _clip(text)})
    return rows


class ConsultationLogPlugin(BasePlugin):
    def __init__(self, name: str = "consultation_log") -> None:
        super().__init__(name=name)

    async def _write(self, ctx: InvocationContext, rows: list[dict[str, Any]], title: str | None = None) -> None:
        if not rows:
            return
        session = ctx.session
        try:
            async with get_engine().begin() as conn:
                current = (
                    await conn.execute(
                        select(consultations.c.user_id, consultations.c.title).where(consultations.c.id == session.id)
                    )
                ).first()
                if current is None or current.user_id != session.user_id:
                    return  # not an app consultation
                now = utcnow()
                auth_session_id = session.state.get("auth_session_id") if session.state else None
                await conn.execute(
                    insert(consultation_messages),
                    [
                        {
                            "consultation_id": session.id,
                            "user_id": session.user_id,
                            "auth_session_id": auth_session_id,
                            "created_at": now,
                            **row,
                        }
                        for row in rows
                    ],
                )
                values: dict[str, Any] = {"last_activity_at": now}
                if title and not current.title:
                    values["title"] = title
                await conn.execute(update(consultations).where(consultations.c.id == session.id).values(**values))
        except Exception:  # never let logging break a consultation
            logger.exception("Failed to log consultation %s", session.id)

    async def on_user_message_callback(
        self, *, invocation_context: InvocationContext, user_message: types.Content
    ) -> Optional[types.Content]:
        text = _text_of(user_message)
        if text:
            first_line = text.splitlines()[0]
            title = first_line if len(first_line) <= TITLE_CHARS else first_line[: TITLE_CHARS - 1] + "…"
            await self._write(
                invocation_context,
                [
                    {
                        "author": "user",
                        "kind": "user",
                        "tool_name": None,
                        "content": _clip(text),
                        "event_id": None,
                        "invocation_id": invocation_context.invocation_id,
                    }
                ],
                title=title,
            )
        return None

    async def on_event_callback(self, *, invocation_context: InvocationContext, event: Event) -> Optional[Event]:
        await self._write(invocation_context, rows_for_event(event))
        return None


consultation_log_plugin = ConsultationLogPlugin()
