/** Subset of the ADK Event JSON (camelCase, as serialized by the ADK API server). */
export interface AdkPart {
  text?: string;
  thought?: boolean;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response?: unknown };
}

export interface AdkEvent {
  id?: string;
  invocationId?: string;
  author?: string;
  timestamp?: number;
  partial?: boolean;
  turnComplete?: boolean;
  errorCode?: string;
  errorMessage?: string;
  content?: { role?: string; parts?: AdkPart[] };
  actions?: { transferToAgent?: string; [key: string]: unknown };
}

export interface AdkSession {
  id: string;
  appName: string;
  userId: string;
  events?: AdkEvent[];
  lastUpdateTime?: number;
}

/** Error payload ADK (or the BFF) writes into the SSE stream. */
export interface StreamError {
  error: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI state
// ─────────────────────────────────────────────────────────────────────────────
export type ActivityStatus = "running" | "done" | "error";

export interface Activity {
  id: string;
  name: string;
  label: string;
  source?: string;
  detail?: string;
  author: string;
  status: ActivityStatus;
}

export interface Reply {
  id: string;
  author: string;
  text: string;
  partial: boolean;
}

export interface Turn {
  id: string;
  userText: string;
  activities: Activity[];
  replies: Reply[];
  status: "running" | "done" | "error";
  error?: string;
}

export interface Clinic {
  id: number;
  name: string;
  address: string;
  city?: string;
  country?: string;
  pinCode?: string;
  fullAddress?: string;
  /** IANA time zone; slot times are local to the clinic. */
  timeZone?: string;
}

export interface Route {
  distanceMeters?: number;
  durationSeconds?: number;
  distanceText?: string;
  durationText?: string;
}

export interface Doctor {
  id: number;
  name: string;
  gender?: string;
  age?: number;
  yearsOfExperience?: number;
  specialization?: string;
  clinicIds: number[];
}

export interface SearchResult {
  id: string;
  specialization?: string;
  city?: string;
  doctorIds: number[];
}

export type SlotState = "available" | "booked";

export interface AvailabilityResult {
  id: string;
  doctorId: number;
  clinicId: number;
  day: string;
  slots: SlotState[]; // index 0 => slot_1 (10:00 AM)
}

export interface BookingDetails {
  doctor?: string;
  specialization?: string;
  clinic?: string;
  address?: string;
  date?: string;
  time?: string;
  /** Clinic's IANA time zone; date and time are local to it. */
  timeZone?: string;
  /** CareConnect appointment id (links the chat booking to the stored appointment). */
  reference?: string;
}

export interface Booking {
  id: string;
  details: BookingDetails;
  status: "pending" | "confirmed" | "failed";
  eventLink?: string;
  /** Appointment row (POST /api/appointments) this booking request belongs to. */
  appointmentId?: string;
}

export interface ConversationState {
  turns: Turn[];
  doctors: Record<number, Doctor>;
  clinics: Record<number, Clinic>;
  routes: Record<number, Route>; // keyed by clinic id
  search?: SearchResult;
  availability: AvailabilityResult[]; // newest first
  bookings: Booking[]; // newest first
  pendingCalls: Record<string, { name: string; args: Record<string, unknown>; author: string }>;
  /** Monotonic counter so the UI can badge "new results". */
  resultsVersion: number;
  /** Doctor chosen up front (rebooking from the dashboard). */
  selectedDoctorId?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Accounts, appointments and consultation history (BFF /api/*)
// ─────────────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  dateOfBirth: string; // YYYY-MM-DD
}

export type AppointmentStatus = "pending" | "confirmed" | "failed" | "cancelled";

export interface AppointmentDraft {
  consultationId?: string | null;
  doctorId: number;
  doctorName: string;
  specialization?: string | null;
  clinicId: number;
  clinicName: string;
  clinicAddress?: string | null;
  appointmentDate: string; // YYYY-MM-DD
  slotIndex: number; // 0-6 -> SLOT_TIMES
  startTime: string;
  endTime: string;
  /** Clinic's IANA time zone (null for appointments booked before zones were stored). */
  timeZone?: string | null;
}

export interface Appointment extends AppointmentDraft {
  id: string;
  status: AppointmentStatus;
  calendarLink?: string | null;
  createdAt: string;
}

export interface ConsultationSummary {
  id: string;
  title?: string | null;
  startedAt: string;
  lastActivityAt: string;
  messageCount: number;
}

export interface LogMessage {
  id: number;
  author: string;
  kind: "user" | "agent" | "tool_call" | "tool_result";
  toolName?: string | null;
  content: string;
  createdAt: string;
}

/** A doctor to rebook, carried from the dashboard to the consultation page. */
export interface RebookRequest {
  doctorId: number;
  doctorName: string;
  specialization?: string | null;
}
