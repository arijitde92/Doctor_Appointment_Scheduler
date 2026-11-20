/**
 * Frontend server for Cloud Run.
 *
 *  - Serves the built React app (dist/) with an SPA fallback.
 *  - Exposes a deliberately NARROW "backend-for-frontend" API under /api/*.
 *    Every patient is signed in: the backend issues an opaque session token
 *    that lives only in an HttpOnly cookie (cc_session). The BFF resolves the
 *    cookie to a user on every request and uses THAT user id for all backend
 *    calls — the browser never chooses whose data it reads.
 *
 *        POST /api/auth/register                 -> create account + sign in
 *        POST /api/auth/login                    -> sign in
 *        POST /api/auth/logout                   -> revoke session, clear cookie
 *        GET  /api/auth/me                       -> current user (401 if signed out)
 *
 *        POST /api/sessions                      -> start a consultation (ADK session)
 *        GET  /api/sessions/:sessionId           -> fetch a consultation (history)
 *        POST /api/chat                          -> stream an agent run (SSE)
 *
 *        GET  /api/consultations                 -> past consultations
 *        GET  /api/consultations/:id/messages    -> stored transcript
 *        GET  /api/appointments                  -> the patient's appointments
 *        POST /api/appointments                  -> hold a slot (pending)
 *        PATCH /api/appointments/:id             -> confirm / fail / cancel
 *        GET  /api/appointments/booked-slots     -> slots taken on a date
 *
 *    The browser never reaches arbitrary routes on the private backend.
 *  - Authenticates to the private backend Cloud Run service with a Google ID
 *    token minted for this service's identity (service-to-service auth).
 *
 * Environment:
 *    PORT          Port to listen on (Cloud Run sets this; default 8080)
 *    BACKEND_URL   Backend base URL, e.g. https://doctor-appointment-api-xxxx.run.app
 *                  (default http://localhost:8000 for local development)
 *    ADK_APP_NAME  ADK app name (default "agents")
 *    BACKEND_AUTH  "auto" (default: ID token unless BACKEND_URL is http://localhost…)
 *                  | "id-token" | "none"
 *    SESSION_COOKIE_HOURS  cookie lifetime (default 12, matches the backend)
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import compression from "compression";
import express from "express";
import { rateLimit } from "express-rate-limit";
import { GoogleAuth } from "google-auth-library";
import helmet from "helmet";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "..", "dist");

const PORT = Number(process.env.PORT || 8080);
const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:8000").replace(/\/+$/, "");
const APP_NAME = process.env.ADK_APP_NAME || "agents";
const AUTH_MODE = process.env.BACKEND_AUTH || "auto";
const USE_ID_TOKEN =
  AUTH_MODE === "id-token" ||
  (AUTH_MODE === "auto" && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BACKEND_URL));

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MESSAGE_CHARS = 4000;
const SSE_HEARTBEAT_MS = 15_000;

const COOKIE_NAME = "cc_session";
const COOKIE_MAX_AGE_S = Math.round(Number(process.env.SESSION_COOKIE_HOURS || 12) * 3600);
const SESSION_CACHE_MS = 10_000;

// ─────────────────────────────────────────────────────────────────────────────
// Service-to-service auth (Cloud Run -> Cloud Run)
// google-auth-library caches the ID token and refreshes it before expiry.
// ─────────────────────────────────────────────────────────────────────────────
const auth = new GoogleAuth();
let idTokenClientPromise = null;

async function backendHeaders(extra = {}) {
  const headers = { ...extra };
  if (USE_ID_TOKEN) {
    idTokenClientPromise ??= auth.getIdTokenClient(BACKEND_URL);
    try {
      const client = await idTokenClientPromise;
      const authHeaders = await client.getRequestHeaders();
      const value =
        typeof authHeaders.get === "function"
          ? authHeaders.get("authorization")
          : authHeaders.Authorization ?? authHeaders.authorization;
      if (value) headers.Authorization = value;
    } catch (err) {
      idTokenClientPromise = null; // retry on the next request
      throw err;
    }
  }
  return headers;
}

/** JSON request to the backend. `userId` adds the verified X-User-Id header. */
async function backendFetch(pathname, { method = "GET", body, userId, token, signal } = {}) {
  const extra = {};
  if (body !== undefined) extra["Content-Type"] = "application/json";
  if (userId) extra["X-User-Id"] = userId;
  if (token) extra["X-Session-Token"] = token;
  return fetch(`${BACKEND_URL}${pathname}`, {
    method,
    headers: await backendHeaders(extra),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
}

async function relayJson(upstream, res) {
  const text = await upstream.text();
  res.status(upstream.status);
  res.type(upstream.headers.get("content-type") || "application/json");
  res.send(text);
}

function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

function backendUnavailable(res, err) {
  console.error("[bff] backend request failed:", err?.message || err);
  if (!res.headersSent) {
    res.status(502).json({ error: "The scheduling service is unavailable. Please try again." });
  }
}

/** Wrap an async handler so backend/network failures become a 502. */
const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    backendUnavailable(res, err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Session cookie
// ─────────────────────────────────────────────────────────────────────────────
function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      const value = part.slice(index + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function cookieAttributes(req, maxAge) {
  // Cloud Run terminates TLS; `trust proxy` makes req.secure honour X-Forwarded-Proto.
  const attrs = [`Path=/`, `HttpOnly`, `SameSite=Lax`, `Max-Age=${maxAge}`];
  if (req.secure) attrs.push("Secure");
  return attrs.join("; ");
}

function setSessionCookie(req, res, token) {
  res.append("Set-Cookie", `${COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieAttributes(req, COOKIE_MAX_AGE_S)}`);
}

function clearSessionCookie(req, res) {
  res.append("Set-Cookie", `${COOKIE_NAME}=; ${cookieAttributes(req, 0)}`);
}

const tokenKey = (token) => createHash("sha256").update(token).digest("hex");
/** token hash -> { session, expires } — avoids a backend round trip per request. */
const sessionCache = new Map();

async function resolveSession(token) {
  const key = tokenKey(token);
  const cached = sessionCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.session;
  sessionCache.delete(key);

  const upstream = await backendFetch("/app-api/auth/session", { token });
  if (upstream.status === 401 || upstream.status === 422) return null;
  if (!upstream.ok) throw new Error(`session lookup failed: ${upstream.status}`);
  const session = await upstream.json();
  if (sessionCache.size > 5000) sessionCache.clear();
  sessionCache.set(key, { session, expires: Date.now() + SESSION_CACHE_MS });
  return session;
}

/** Require a signed-in patient: sets req.user and req.authSessionId. */
async function requireUser(req, res, next) {
  const token = readCookie(req, COOKIE_NAME);
  if (!token || token.length > 128) return res.status(401).json({ error: "Please log in." });
  try {
    const session = await resolveSession(token);
    if (!session) {
      clearSessionCookie(req, res);
      return res.status(401).json({ error: "Your session has expired. Please log in again." });
    }
    req.user = session.user;
    req.authSessionId = session.authSessionId;
    next();
  } catch (err) {
    backendUnavailable(res, err);
  }
}

/** Public user fields returned to the browser. */
const publicUser = (user) => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  phone: user.phone,
  address: user.address,
  dateOfBirth: user.dateOfBirth,
});

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────
const app = express();
app.disable("x-powered-by");
// Cloud Run's Google Front End appends the real client IP as the last
// X-Forwarded-For hop; trust exactly one hop so rate limiting can't be spoofed.
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
        "img-src": ["'self'", "data:"],
        "connect-src": ["'self'"],
        "frame-ancestors": ["'none'"],
        // Cloud Run is HTTPS-only already; this would break local http previews.
        "upgrade-insecure-requests": null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

// Never compress the SSE stream (compression buffers chunks).
app.use(compression({ filter: (req, res) => req.path !== "/api/chat" && compression.filter(req, res) }));

app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

const api = express.Router();
api.use(express.json({ limit: "16kb" }));

// Signed-in data must never be cached (Back button after logout, shared PCs).
api.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// CSRF: the session cookie is SameSite=Lax; additionally refuse state-changing
// requests that a browser marks as coming from another site.
api.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") return next();
  const origin = req.get("origin");
  if (origin) {
    let host;
    try {
      host = new URL(origin).host;
    } catch {
      host = null;
    }
    if (host !== req.get("host")) return res.status(403).json({ error: "Cross-site request blocked." });
  } else if (req.get("sec-fetch-site") && !["same-origin", "none"].includes(req.get("sec-fetch-site"))) {
    return res.status(403).json({ error: "Cross-site request blocked." });
  }
  next();
});

const limiter = (limit, windowMs = 60_000) =>
  rateLimit({ windowMs, limit, standardHeaders: "draft-8", legacyHeaders: false });
const chatLimiter = limiter(20);
const sessionLimiter = limiter(30);
const dataLimiter = limiter(60);
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many sign-in attempts. Please wait a few minutes and try again." },
});
const registerLimiter = limiter(10, 60 * 60_000);

// ── Auth ────────────────────────────────────────────────────────────────────

async function signIn(req, res, pathname) {
  const body = { ...(req.body ?? {}), client: { ip: req.ip, userAgent: req.get("user-agent")?.slice(0, 255) } };
  const upstream = await backendFetch(pathname, { method: "POST", body });
  if (!upstream.ok) return relayJson(upstream, res);
  const result = await upstream.json();
  setSessionCookie(req, res, result.token);
  res.status(upstream.status).json({ user: publicUser(result.user) });
}

api.post("/auth/register", registerLimiter, handle((req, res) => signIn(req, res, "/app-api/auth/register")));
api.post("/auth/login", loginLimiter, handle((req, res) => signIn(req, res, "/app-api/auth/login")));

api.post(
  "/auth/logout",
  handle(async (req, res) => {
    const token = readCookie(req, COOKIE_NAME);
    clearSessionCookie(req, res);
    if (token && token.length <= 128) {
      sessionCache.delete(tokenKey(token));
      await backendFetch("/app-api/auth/logout", { method: "POST", token });
    }
    res.status(204).end();
  }),
);

api.get("/auth/me", sessionLimiter, requireUser, (req, res) => res.json({ user: publicUser(req.user) }));

// ── Consultations (ADK sessions) ────────────────────────────────────────────

const adkSessionsPath = (userId) =>
  `/apps/${encodeURIComponent(APP_NAME)}/users/${encodeURIComponent(userId)}/sessions`;

// Start a consultation for the signed-in patient.
api.post(
  "/sessions",
  sessionLimiter,
  requireUser,
  handle(async (req, res) => {
    const upstream = await backendFetch(adkSessionsPath(req.user.id), {
      method: "POST",
      // Read by the consultation log plugin (per login-session logging).
      body: { state: { auth_session_id: req.authSessionId, user_first_name: req.user.firstName } },
    });
    if (!upstream.ok) return relayJson(upstream, res);
    const session = await upstream.json();
    const recorded = await backendFetch("/app-api/consultations", {
      method: "POST",
      userId: req.user.id,
      body: { id: session.id, authSessionId: req.authSessionId },
    });
    if (!recorded.ok) {
      console.error("[bff] failed to record consultation:", recorded.status, await recorded.text());
      return res.status(502).json({ error: "Could not start a consultation. Please try again." });
    }
    res.status(200).json(session);
  }),
);

// Fetch a consultation (used to restore the conversation after a page reload).
api.get(
  "/sessions/:sessionId",
  sessionLimiter,
  requireUser,
  handle(async (req, res) => {
    const { sessionId } = req.params;
    if (!ID_PATTERN.test(sessionId)) return badRequest(res, "Invalid id.");
    const upstream = await backendFetch(`${adkSessionsPath(req.user.id)}/${encodeURIComponent(sessionId)}`);
    await relayJson(upstream, res);
  }),
);

// Send a message and stream the agents' events back as Server-Sent Events.
api.post("/chat", chatLimiter, requireUser, async (req, res) => {
  const { sessionId, message } = req.body ?? {};
  if (typeof sessionId !== "string" || !ID_PATTERN.test(sessionId)) return badRequest(res, "Invalid sessionId.");
  if (typeof message !== "string" || !message.trim() || message.length > MAX_MESSAGE_CHARS) {
    return badRequest(res, `Message must be 1-${MAX_MESSAGE_CHARS} characters.`);
  }

  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) controller.abort();
  });

  let upstream;
  try {
    upstream = await fetch(`${BACKEND_URL}/run_sse`, {
      method: "POST",
      headers: await backendHeaders({ "Content-Type": "application/json", Accept: "text/event-stream" }),
      body: JSON.stringify({
        appName: APP_NAME,
        userId: req.user.id, // from the session cookie, never from the browser
        sessionId,
        newMessage: { role: "user", parts: [{ text: message.trim() }] },
        streaming: true,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) return;
    return backendUnavailable(res, err);
  }

  if (!upstream.ok || !upstream.body) {
    return relayJson(upstream, res);
  }

  res.status(200);
  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  // SSE comments keep idle connections alive while long tool calls run.
  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), SSE_HEARTBEAT_MS);
  const body = Readable.fromWeb(upstream.body);
  body.on("data", (chunk) => res.write(chunk));
  body.on("end", () => {
    clearInterval(heartbeat);
    res.end();
  });
  body.on("error", (err) => {
    clearInterval(heartbeat);
    if (!controller.signal.aborted) {
      console.error("[bff] stream error:", err?.message || err);
      res.write(`data: ${JSON.stringify({ error: "The connection to the scheduling service was interrupted." })}\n\n`);
    }
    res.end();
  });
  res.on("close", () => clearInterval(heartbeat));
});

// ── Consultation history ────────────────────────────────────────────────────

api.get(
  "/consultations",
  dataLimiter,
  requireUser,
  handle(async (req, res) => relayJson(await backendFetch("/app-api/consultations", { userId: req.user.id }), res)),
);

api.get(
  "/consultations/:id/messages",
  dataLimiter,
  requireUser,
  handle(async (req, res) => {
    if (!ID_PATTERN.test(req.params.id)) return badRequest(res, "Invalid id.");
    const upstream = await backendFetch(`/app-api/consultations/${encodeURIComponent(req.params.id)}/messages`, {
      userId: req.user.id,
    });
    await relayJson(upstream, res);
  }),
);

// ── Appointments ────────────────────────────────────────────────────────────

api.get(
  "/appointments",
  dataLimiter,
  requireUser,
  handle(async (req, res) => relayJson(await backendFetch("/app-api/appointments", { userId: req.user.id }), res)),
);

api.get(
  "/appointments/booked-slots",
  dataLimiter,
  requireUser,
  handle(async (req, res) => {
    const { doctorId, clinicId, date } = req.query;
    if (!/^\d{1,9}$/.test(String(doctorId)) || !/^\d{1,9}$/.test(String(clinicId)) || !DATE_PATTERN.test(String(date))) {
      return badRequest(res, "doctorId, clinicId and date (YYYY-MM-DD) are required.");
    }
    const qs = new URLSearchParams({ doctorId: String(doctorId), clinicId: String(clinicId), date: String(date) });
    await relayJson(await backendFetch(`/app-api/appointments/booked-slots?${qs}`, { userId: req.user.id }), res);
  }),
);

api.post(
  "/appointments",
  dataLimiter,
  requireUser,
  handle(async (req, res) =>
    relayJson(await backendFetch("/app-api/appointments", { method: "POST", userId: req.user.id, body: req.body ?? {} }), res),
  ),
);

api.patch(
  "/appointments/:id",
  dataLimiter,
  requireUser,
  handle(async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) return badRequest(res, "Invalid id.");
    const upstream = await backendFetch(`/app-api/appointments/${req.params.id}`, {
      method: "PATCH",
      userId: req.user.id,
      body: req.body ?? {},
    });
    await relayJson(upstream, res);
  }),
);

api.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use("/api", api);

// ─────────────────────────────────────────────────────────────────────────────
// Static React build + SPA fallback
// ─────────────────────────────────────────────────────────────────────────────
if (existsSync(DIST_DIR)) {
  app.use(
    "/assets",
    express.static(path.join(DIST_DIR, "assets"), { immutable: true, maxAge: "1y", fallthrough: false }),
  );
  app.use(express.static(DIST_DIR, { index: false, maxAge: "1h" }));
  app.get("/{*splat}", (_req, res) => {
    // no-store: after logout the Back button must not show a cached signed-in page.
    res.set("Cache-Control", "no-store");
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
} else {
  console.warn(`[bff] ${DIST_DIR} not found — serving the API only (use "npm run dev:client" for the UI).`);
}

// Quiet 404s for missing static files; log anything else.
app.use((err, _req, res, _next) => {
  const status = err?.status || err?.statusCode || 500;
  if (status >= 500) console.error("[bff] unhandled error:", err);
  if (!res.headersSent) res.status(status).end();
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `[bff] listening on :${PORT} -> backend ${BACKEND_URL} (app "${APP_NAME}", auth: ${USE_ID_TOKEN ? "id-token" : "none"})`,
  );
});
