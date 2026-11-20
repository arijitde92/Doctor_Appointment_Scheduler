/**
 * Who is signed in.
 *
 * The session itself is an HttpOnly cookie the browser can't read, so the
 * truth always comes from GET /api/auth/me. It is re-checked whenever a page
 * might be shown from a stale state:
 *   - on load,
 *   - when the page is restored from the back/forward cache (pageshow),
 *   - when the tab becomes visible again,
 *   - whenever any API call returns 401,
 *   - when another tab logs out (BroadcastChannel).
 * Logging out clears every locally stored trace of the session and replaces
 * the history entry, so Back can't return to a signed-in page.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";

import * as api from "../lib/api";
import type { User } from "../lib/types";
import type { RegistrationForm } from "../lib/validation";

type Status = "loading" | "authed" | "anon";

interface AuthValue {
  status: Status;
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  register: (form: RegistrationForm) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

const STORAGE_PREFIX = "careconnect.";
const CHANNEL = "careconnect-auth";
const RECHECK_MS = 30_000;

/** Remove everything this app keeps in the browser (consultation ids, etc.). */
export function clearLocalData() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key);
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(STORAGE_PREFIX)) sessionStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const lastCheck = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);

  const signedOut = useCallback(() => {
    clearLocalData();
    setUser(null);
    setStatus("anon");
  }, []);

  const refresh = useCallback(async () => {
    lastCheck.current = Date.now();
    try {
      const current = await api.currentUser();
      if (current) {
        setUser(current);
        setStatus("authed");
      } else {
        signedOut();
      }
    } catch {
      // Network / backend error: keep the current state (don't sign out on a blip).
      setStatus((s) => (s === "loading" ? "anon" : s));
    }
  }, [signedOut]);

  // Initial check + any 401 from the API signs the user out.
  useEffect(() => {
    void refresh();
    api.onUnauthorized(signedOut);
    return () => api.onUnauthorized(null);
  }, [refresh, signedOut]);

  // Re-check when a page may be shown from cache or after a while away.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastCheck.current > RECHECK_MS) void refresh();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Keep tabs in sync: logging out (or in) in one tab applies to all of them.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(CHANNEL);
    channel.current = ch;
    ch.onmessage = (e) => {
      if (e.data === "logout") {
        signedOut();
        navigate("/login", { replace: true });
      } else if (e.data === "login") {
        void refresh();
      }
    };
    return () => {
      ch.close();
      channel.current = null;
    };
  }, [navigate, refresh, signedOut]);

  const login = useCallback(async (email: string, password: string) => {
    clearLocalData();
    const u = await api.login(email, password);
    setUser(u);
    setStatus("authed");
    channel.current?.postMessage("login");
    return u;
  }, []);

  const register = useCallback(async (form: RegistrationForm) => {
    clearLocalData();
    const u = await api.register(form);
    setUser(u);
    setStatus("authed");
    channel.current?.postMessage("login");
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* the cookie is cleared server-side when reachable; sign out locally regardless */
    }
    signedOut();
    channel.current?.postMessage("logout");
    navigate("/login", { replace: true, state: { loggedOut: true } });
  }, [navigate, signedOut]);

  const value = useMemo(
    () => ({ status, user, login, register, logout, refresh }),
    [status, user, login, register, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
