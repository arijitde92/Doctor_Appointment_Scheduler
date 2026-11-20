import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { conversationReducer, initialConversation } from "../lib/adkEvents";
import { ApiError, createSession, getSession, streamChat } from "../lib/api";
import type { Doctor } from "../lib/types";

/** The open consultation is remembered per signed-in user (cleared on logout). */
const sessionKey = (userId: string) => `careconnect.sessionId.${userId}`;

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

const FRIENDLY_ERROR = "Something went wrong while contacting the assistant. Please try again.";

export function useConversation(userId: string) {
  const [state, dispatch] = useReducer(conversationReducer, initialConversation);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [restoring, setRestoring] = useState(true);
  const key = sessionKey(userId);
  const sessionIdRef = useRef<string | null>(storageGet(key));
  const abortRef = useRef<AbortController | null>(null);

  const setBusyBoth = (value: boolean) => {
    busyRef.current = value;
    setBusy(value);
  };

  // Restore the previous conversation (sessions are persisted in Cloud SQL).
  useEffect(() => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) {
      setRestoring(false);
      return;
    }
    let cancelled = false;
    getSession(sessionId)
      .then((session) => {
        if (!cancelled) dispatch({ type: "hydrate", events: session.events ?? [] });
      })
      .catch(() => {
        // Unknown/expired session: start fresh on the next message.
        sessionIdRef.current = null;
        storageSet(key, null);
      })
      .finally(() => !cancelled && setRestoring(false));
    return () => {
      cancelled = true;
    };
  }, [key]);

  // Leaving the page (or logging out) stops any running stream.
  useEffect(() => () => abortRef.current?.abort(), []);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const session = await createSession();
    sessionIdRef.current = session.id;
    storageSet(key, session.id);
    return session.id;
  }, [key]);

  const send = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || busyRef.current) return;
      setBusyBoth(true);
      dispatch({ type: "userMessage", id: newId(), text });
      const controller = new AbortController();
      abortRef.current = controller;

      const run = async (retryOnMissingSession: boolean): Promise<void> => {
        const sessionId = await ensureSession();
        try {
          await streamChat(
            { sessionId, message: text },
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
            storageSet(key, null);
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
            : err instanceof ApiError && err.status === 401
              ? "Your session has expired. Please log in again."
              : FRIENDLY_ERROR;
        dispatch({ type: "streamError", message });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setBusyBoth(false);
      }
    },
    [ensureSession, key],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    sessionIdRef.current = null;
    storageSet(key, null);
    setBusyBoth(false);
    dispatch({ type: "reset" });
  }, [key]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusyBoth(false);
    dispatch({ type: "streamEnd" });
  }, []);

  const seedDoctor = useCallback((doctor: Pick<Doctor, "id" | "name" | "specialization">) => {
    dispatch({ type: "seedDoctor", doctor });
  }, []);

  /** Current consultation id (null before the first message). */
  const currentSessionId = useCallback(() => sessionIdRef.current, []);

  return { state, busy, restoring, send, reset, stop, seedDoctor, currentSessionId };
}
