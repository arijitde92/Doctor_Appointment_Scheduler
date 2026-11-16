import { readSseStream } from "./sse";
import type { AdkEvent, AdkSession } from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  try {
    const body = await res.json();
    message = body?.error || body?.detail || message;
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(typeof message === "string" ? message : JSON.stringify(message), res.status);
}

export async function createSession(userId: string): Promise<AdkSession> {
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) throw await errorFrom(res);
  return res.json();
}

export async function getSession(userId: string, sessionId: string): Promise<AdkSession> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(userId)}/${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw await errorFrom(res);
  return res.json();
}

export interface StreamHandlers {
  onEvent: (event: AdkEvent) => void;
  onError: (message: string) => void;
}

/** Send a message and stream ADK events back (POST /api/chat -> /run_sse). */
export async function streamChat(
  params: { userId: string; sessionId: string; message: string },
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(params),
    signal,
  });
  if (!res.ok || !res.body) throw await errorFrom(res);

  await readSseStream(res.body, (payload) => {
    if (payload && typeof payload === "object" && "error" in payload && !("author" in payload)) {
      handlers.onError(String((payload as { error: unknown }).error));
      return;
    }
    handlers.onEvent(payload as AdkEvent);
  });
}
