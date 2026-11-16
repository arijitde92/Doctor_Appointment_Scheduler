/**
 * Frontend server for Cloud Run.
 *
 *  - Serves the built React app (dist/) with an SPA fallback.
 *  - Exposes a deliberately NARROW "backend-for-frontend" API under /api/*:
 *        POST /api/sessions                      -> create an ADK session
 *        GET  /api/sessions/:userId/:sessionId   -> fetch a session (history)
 *        POST /api/chat                          -> stream an agent run (SSE)
 *    The browser never reaches arbitrary ADK routes on the private backend.
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
 */
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
const MAX_MESSAGE_CHARS = 4000;
const SSE_HEARTBEAT_MS = 15_000;

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

const chatLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });
const sessionLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });

// Create a new ADK session for an (anonymous) user.
api.post("/sessions", sessionLimiter, async (req, res) => {
  const userId = req.body?.userId;
  if (typeof userId !== "string" || !ID_PATTERN.test(userId)) return badRequest(res, "Invalid userId.");
  try {
    const upstream = await fetch(
      `${BACKEND_URL}/apps/${encodeURIComponent(APP_NAME)}/users/${encodeURIComponent(userId)}/sessions`,
      { method: "POST", headers: await backendHeaders({ "Content-Type": "application/json" }), body: "{}" },
    );
    await relayJson(upstream, res);
  } catch (err) {
    backendUnavailable(res, err);
  }
});

// Fetch a session (used to restore the conversation after a page reload).
api.get("/sessions/:userId/:sessionId", sessionLimiter, async (req, res) => {
  const { userId, sessionId } = req.params;
  if (!ID_PATTERN.test(userId) || !ID_PATTERN.test(sessionId)) return badRequest(res, "Invalid id.");
  try {
    const upstream = await fetch(
      `${BACKEND_URL}/apps/${encodeURIComponent(APP_NAME)}/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId)}`,
      { headers: await backendHeaders() },
    );
    await relayJson(upstream, res);
  } catch (err) {
    backendUnavailable(res, err);
  }
});

// Send a message and stream the agents' events back as Server-Sent Events.
api.post("/chat", chatLimiter, async (req, res) => {
  const { userId, sessionId, message } = req.body ?? {};
  if (typeof userId !== "string" || !ID_PATTERN.test(userId)) return badRequest(res, "Invalid userId.");
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
        userId,
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
    "Cache-Control": "no-cache, no-transform",
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
    res.set("Cache-Control", "no-cache");
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
