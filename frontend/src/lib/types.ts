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
  pinCode?: string;
  fullAddress?: string;
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
}

export interface Booking {
  id: string;
  details: BookingDetails;
  status: "pending" | "confirmed" | "failed";
  eventLink?: string;
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
}
