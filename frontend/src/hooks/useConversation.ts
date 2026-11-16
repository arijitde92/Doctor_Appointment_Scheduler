import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { conversationReducer, initialConversation } from "../lib/adkEvents";
import { ApiError, createSession, getSession, streamChat } from "../lib/api";

const USER_KEY = "careconnect.userId";
const SESSION_KEY = "careconnect.sessionId";

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode) — the app still works for this tab */
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getUserId(): string {
  let id = storageGet(USER_KEY);
  if (!id) {
    id = newId();
    storageSet(USER_KEY, id);
  }
  return id;
}

const FRIENDLY_ERROR = "Something went wrong while contacting the assistant. Please try again.";

export function useConversation() {
  const [state, dispatch] = useReducer(conversationReducer, initialConversation);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const userIdRef = useRef<string>(getUserId());
  const sessionIdRef = useRef<string | null>(storageGet(SESSION_KEY));
  const abortRef = useRef<AbortController | null>(null);

  // Restore the previous conversation (sessions are persisted in Cloud SQL).
  useEffect(() => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      setRestoring(false);
      return;
    }
    let cancelled = false;
    getSession(userIdRef.current, sessionId)
      .then((session) => {
        if (!cancelled) dispatch({ type: "hydrate", events: session.events ?? [] });
      })
      .catch(() => {
        // Unknown/expired session: start fresh on the next message.
        sessionIdRef.current = null;
        storageSet(SESSION_KEY, null);
      })
      .finally(() => !cancelled && setRestoring(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const session = await createSession(userIdRef.current);
    sessionIdRef.current = session.id;
    storageSet(SESSION_KEY, session.id);
    return session.id;
  }, []);

  const send = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || busy) return;
      setBusy(true);
      dispatch({ type: "userMessage", id: newId(), text });
      const controller = new AbortController();
      abortRef.current = controller;

      const run = async (retryOnMissingSession: boolean): Promise<void> => {
        const sessionId = await ensureSession();
        try {
          await streamChat(
            { userId: userIdRef.current, sessionId, message: text },
            {
              onEvent: (event) => dispatch({ type: "event", event }),
              onError: (message) => {
                console.error("Agent error:", message);
                dispatch({ type: "streamError", message: FRIENDLY_ERROR });
              },
            },
            controller.signal,
          );
        } catch (err) {
          if (retryOnMissingSession && err instanceof ApiError && err.status === 404) {
            sessionIdRef.current = null;
            storageSet(SESSION_KEY, null);
            return run(false);
          }
          throw err;
        }
      };

      try {
        await run(true);
        dispatch({ type: "streamEnd" });
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error(err);
        const message =
          err instanceof ApiError && err.status === 429
            ? "You're sending messages a little too quickly. Please wait a moment and try again."
            : FRIENDLY_ERROR;
        dispatch({ type: "streamError", message });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setBusy(false);
      }
    },
    [busy, ensureSession],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    sessionIdRef.current = null;
    storageSet(SESSION_KEY, null);
    setBusy(false);
    dispatch({ type: "reset" });
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    dispatch({ type: "streamEnd" });
  }, []);

  return { state, busy, restoring, send, reset, stop };
}
