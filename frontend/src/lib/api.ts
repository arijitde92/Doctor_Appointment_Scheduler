/**
 * Browser -> BFF client. The session lives in an HttpOnly cookie, so requests
 * carry no user id; the BFF derives it from the cookie.
 */
import { readSseStream } from "./sse";
import type { AdkEvent, AdkSession, Appointment, AppointmentDraft, ConsultationSummary, LogMessage, User } from "./types";
import type { RegistrationForm } from "./validation";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Field-level messages from the server (registration validation). */
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

// Called on any 401 so the auth context can sign the user out everywhere.
let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

/** FastAPI 422 `loc` (e.g. ["body", "dateOfBirth"]) -> form field name. */
function fieldFromLoc(loc: unknown): string | null {
  if (!Array.isArray(loc)) return null;
  const last = loc[loc.length - 1];
  return typeof last === "string" && last !== "body" ? last : null;
}

async function errorFrom(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  const fields: Record<string, string> = {};
  try {
    const body = await res.json();
    const detail = body?.error ?? body?.detail;
    if (typeof detail === "string") {
      message = detail;
    } else if (Array.isArray(detail)) {
      // FastAPI validation errors
      for (const item of detail) {
        const text = String(item?.msg ?? "").replace(/^Value error, /, "");
        const field = fieldFromLoc(item?.loc);
        if (field && !fields[field]) fields[field] = text;
        else if (!field && text) fields._form = text;
      }
      message = fields._form || Object.values(fields)[0] || "Please check the highlighted fields.";
    } else if (detail && typeof detail === "object") {
      if (typeof detail.message === "string") message = detail.message;
      if (typeof detail.field === "string") fields[detail.field] = message;
    }
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(message, res.status, fields);
}

async function request<T>(url: string, init: RequestInit = {}, { allow401 = false } = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  if (res.status === 401 && !allow401) unauthorizedHandler?.();
  if (!res.ok) throw await errorFrom(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const json = (body: unknown) => JSON.stringify(body);

// ── Auth ────────────────────────────────────────────────────────────────────

export async function register(form: RegistrationForm): Promise<User> {
  const body = {
    ...form,
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    address: form.address.trim(),
  };
  const res = await request<{ user: User }>("/api/auth/register", { method: "POST", body: json(body) }, { allow401: true });
  return res.user;
}

export async function login(email: string, password: string): Promise<User> {
  const res = await request<{ user: User }>(
    "/api/auth/login",
    { method: "POST", body: json({ email: email.trim(), password }) },
    { allow401: true },
  );
  return res.user;
}

export async function logout(): Promise<void> {
  await request<void>("/api/auth/logout", { method: "POST" }, { allow401: true });
}

/** The signed-in user, or null when signed out. */
export async function currentUser(): Promise<User | null> {
  try {
    const res = await request<{ user: User }>("/api/auth/me", {}, { allow401: true });
    return res.user;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

// ── Consultations ───────────────────────────────────────────────────────────

export function createSession(): Promise<AdkSession> {
  return request<AdkSession>("/api/sessions", { method: "POST" });
}

export function getSession(sessionId: string): Promise<AdkSession> {
  return request<AdkSession>(`/api/sessions/${encodeURIComponent(sessionId)}`);
}

export function listConsultations(): Promise<ConsultationSummary[]> {
  return request<ConsultationSummary[]>("/api/consultations");
}

export function consultationMessages(id: string): Promise<LogMessage[]> {
  return request<LogMessage[]>(`/api/consultations/${encodeURIComponent(id)}/messages`);
}

// ── Appointments ────────────────────────────────────────────────────────────

export function listAppointments(): Promise<Appointment[]> {
  return request<Appointment[]>("/api/appointments");
}

export function createAppointment(draft: AppointmentDraft): Promise<Appointment> {
  return request<Appointment>("/api/appointments", { method: "POST", body: json(draft) });
}

export function updateAppointment(
  id: string,
  update: { status: Appointment["status"]; calendarLink?: string },
): Promise<Appointment> {
  return request<Appointment>(`/api/appointments/${encodeURIComponent(id)}`, { method: "PATCH", body: json(update) });
}

export function bookedSlots(doctorId: number, clinicId: number, date: string): Promise<number[]> {
  const qs = new URLSearchParams({ doctorId: String(doctorId), clinicId: String(clinicId), date });
  return request<number[]>(`/api/appointments/booked-slots?${qs}`);
}

// ── Chat stream ─────────────────────────────────────────────────────────────

export interface StreamHandlers {
  onEvent: (event: AdkEvent) => void;
  onError: (message: string) => void;
}

/** Send a message and stream ADK events back (POST /api/chat -> /run_sse). */
export async function streamChat(
  params: { sessionId: string; message: string },
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(params),
    signal,
  });
  if (res.status === 401) unauthorizedHandler?.();
  if (!res.ok || !res.body) throw await errorFrom(res);

  await readSseStream(res.body, (payload) => {
    if (payload && typeof payload === "object" && "error" in payload && !("author" in payload)) {
      handlers.onError(String((payload as { error: unknown }).error));
      return;
    }
    handlers.onEvent(payload as AdkEvent);
  });
}
