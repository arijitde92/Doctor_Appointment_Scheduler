/**
 * Event-sourced conversation state.
 *
 * The whole UI (chat transcript, agent activity, doctor cards, availability,
 * bookings) is derived from ADK events. Live streaming and restoring a session
 * after a reload therefore share exactly the same code path.
 */
import { describeToolCall } from "./activities";
import { parseBookingPrompt } from "./prompts";
import {
  matchClinicForRoute,
  mcpPayload,
  parseAvailability,
  parseCalendarResult,
  parseClinics,
  parseDoctorDetails,
  parseFindDoctors,
  parseRoute,
} from "./results";
import type { Activity, AdkEvent, Clinic, ConversationState, Doctor, Reply, Turn } from "./types";

export type ConversationAction =
  | { type: "reset" }
  | { type: "userMessage"; id: string; text: string }
  | { type: "event"; event: AdkEvent }
  | { type: "streamError"; message: string }
  | { type: "streamEnd" }
  | { type: "hydrate"; events: AdkEvent[] };

export const initialConversation: ConversationState = {
  turns: [],
  doctors: {},
  clinics: {},
  routes: {},
  search: undefined,
  availability: [],
  bookings: [],
  pendingCalls: {},
  resultsVersion: 0,
};

let localId = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(localId++).toString(36)}`;

export function conversationReducer(state: ConversationState, action: ConversationAction): ConversationState {
  switch (action.type) {
    case "reset":
      return initialConversation;
    case "userMessage":
      return startTurn(state, action.id, action.text);
    case "event":
      return applyEvent(state, action.event);
    case "streamError":
      return updateLastTurn(state, (turn) => ({
        ...finalizeTurn(turn),
        status: "error",
        error: action.message,
      }));
    case "streamEnd":
      return updateLastTurn(state, (turn) => finalizeTurn(turn));
    case "hydrate":
      return hydrate(action.events);
  }
}

/** Rebuild state from a stored ADK session's events. */
export function hydrate(events: AdkEvent[]): ConversationState {
  let state = initialConversation;
  for (const event of events) {
    if (event.author === "user") {
      const text = textOf(event);
      if (text) {
        state = updateLastTurn(state, finalizeTurn);
        state = startTurn(state, event.id ?? nextId("turn"), text);
      }
      continue;
    }
    state = applyEvent(state, event);
  }
  return {
    ...state,
    turns: state.turns.map((t) => finalizeTurn(t)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Turns & replies
// ─────────────────────────────────────────────────────────────────────────────
function startTurn(state: ConversationState, id: string, text: string): ConversationState {
  const turn: Turn = { id, userText: text, activities: [], replies: [], status: "running" };
  const booking = parseBookingPrompt(text);
  return {
    ...state,
    turns: [...state.turns, turn],
    bookings: booking ? [{ id, details: booking, status: "pending" }, ...state.bookings] : state.bookings,
    resultsVersion: booking ? state.resultsVersion + 1 : state.resultsVersion,
  };
}

function finalizeTurn(turn: Turn): Turn {
  return {
    ...turn,
    status: turn.status === "error" ? "error" : "done",
    replies: turn.replies.map((r) => (r.partial ? { ...r, partial: false } : r)),
    activities: turn.activities.map((a) => (a.status === "running" ? { ...a, status: "done" } : a)),
  };
}

function updateLastTurn(state: ConversationState, fn: (turn: Turn) => Turn): ConversationState {
  if (!state.turns.length) return state;
  const turns = state.turns.slice();
  turns[turns.length - 1] = fn(turns[turns.length - 1]);
  return { ...state, turns };
}

function ensureTurn(state: ConversationState): ConversationState {
  if (state.turns.length) return state;
  return startTurn(state, nextId("turn"), "");
}

function textOf(event: AdkEvent): string {
  return (event.content?.parts ?? [])
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("");
}

function applyText(turn: Turn, author: string, text: string, partial: boolean, eventId?: string): Turn {
  const replies = turn.replies.slice();
  const last = replies[replies.length - 1];
  if (last && last.partial && last.author === author) {
    replies[replies.length - 1] = partial
      ? { ...last, text: last.text + text }
      : { ...last, text, partial: false }; // final event carries the full text
  } else if (text.trim()) {
    const reply: Reply = { id: eventId ?? nextId("reply"), author, text, partial };
    replies.push(reply);
  }
  return { ...turn, replies };
}

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────
export function applyEvent(input: ConversationState, event: AdkEvent): ConversationState {
  let state = ensureTurn(input);
  const author = event.author ?? "assistant";
  const parts = event.content?.parts ?? [];

  if (event.errorMessage || (event.errorCode && event.errorCode !== "STOP")) {
    return updateLastTurn(state, (turn) => ({
      ...turn,
      status: "error",
      error: event.errorMessage || `The assistant stopped unexpectedly (${event.errorCode}).`,
    }));
  }

  const text = textOf(event);
  if (text) {
    state = updateLastTurn(state, (turn) => applyText(turn, author, text, !!event.partial, event.id));
  }

  // Tool calls/responses are only processed on complete (non-partial) events.
  if (event.partial) return state;

  for (const part of parts) {
    if (part.functionCall) {
      const call = part.functionCall;
      const id = call.id ?? nextId("call");
      const args = (call.args ?? {}) as Record<string, unknown>;
      const { label, source, detail } = describeToolCall(call.name, args);
      const activity: Activity = {
        id,
        name: call.name,
        label,
        source,
        detail,
        author,
        status: call.name === "transfer_to_agent" ? "done" : "running",
      };
      state = updateLastTurn(
        { ...state, pendingCalls: { ...state.pendingCalls, [id]: { name: call.name, args, author } } },
        (turn) => ({ ...turn, activities: [...turn.activities, activity] }),
      );
    }
    if (part.functionResponse) {
      state = applyFunctionResponse(state, part.functionResponse);
    }
  }
  return state;
}

function responseFailed(response: unknown): boolean {
  if (!response || typeof response !== "object") return false;
  const r = response as Record<string, unknown>;
  if (typeof r.error === "string" && r.error) return true;
  return mcpPayload(response).isError && "content" in r;
}

function applyFunctionResponse(
  state: ConversationState,
  fr: { id?: string; name: string; response?: unknown },
): ConversationState {
  const call = fr.id ? state.pendingCalls[fr.id] : undefined;
  const args = call?.args ?? {};
  const failed = responseFailed(fr.response);

  // Mark the activity complete.
  state = updateLastTurn(state, (turn) => {
    let matched = false;
    const activities = turn.activities.map((a) => {
      if (!matched && (a.id === fr.id || (!fr.id && a.name === fr.name && a.status === "running"))) {
        matched = true;
        return { ...a, status: failed ? ("error" as const) : ("done" as const) };
      }
      return a;
    });
    return { ...turn, activities };
  });

  if (failed) return state;
  const bump = (s: ConversationState) => ({ ...s, resultsVersion: s.resultsVersion + 1 });

  switch (fr.name) {
    case "find-doctors": {
      const rows = parseFindDoctors(fr.response);
      if (!rows) return state;
      const doctors = { ...state.doctors };
      const clinics = { ...state.clinics };
      const order: number[] = [];
      for (const row of rows) {
        const existing: Doctor = doctors[row.doctorId] ?? { id: row.doctorId, name: row.name, clinicIds: [] };
        const clinicIds = row.clinic && !existing.clinicIds.includes(row.clinic.id)
          ? [...existing.clinicIds, row.clinic.id]
          : existing.clinicIds;
        doctors[row.doctorId] = {
          ...existing,
          name: row.name,
          gender: row.gender ?? existing.gender,
          age: row.age ?? existing.age,
          yearsOfExperience: row.yearsOfExperience ?? existing.yearsOfExperience,
          specialization: row.specialization ?? existing.specialization,
          clinicIds,
        };
        if (row.clinic) clinics[row.clinic.id] = { ...clinics[row.clinic.id], ...row.clinic };
        if (!order.includes(row.doctorId)) order.push(row.doctorId);
      }
      return bump({
        ...state,
        doctors,
        clinics,
        search: {
          id: fr.id ?? nextId("search"),
          specialization: typeof args.specialization === "string" ? args.specialization : undefined,
          city: typeof args.city === "string" ? args.city : undefined,
          doctorIds: order,
        },
      });
    }
    case "get-doctor-details": {
      const row = parseDoctorDetails(fr.response);
      if (!row) return state;
      const existing = state.doctors[row.doctorId];
      return {
        ...state,
        doctors: {
          ...state.doctors,
          [row.doctorId]: {
            ...existing,
            id: row.doctorId,
            name: row.name,
            gender: row.gender,
            age: row.age,
            yearsOfExperience: row.yearsOfExperience,
            specialization: row.specialization,
            clinicIds: existing?.clinicIds ?? [],
          },
        },
      };
    }
    case "get-doctor-clinics":
    case "get-clinic-location": {
      const list = parseClinics(fr.response);
      if (!list?.length) return state;
      const clinics = { ...state.clinics };
      for (const c of list) clinics[c.id] = { ...clinics[c.id], ...stripUndefined(c) } as Clinic;
      let doctors = state.doctors;
      const doctorId = Number(args.doctor_id);
      if (fr.name === "get-doctor-clinics" && doctors[doctorId]) {
        const ids = Array.from(new Set([...doctors[doctorId].clinicIds, ...list.map((c) => c.id)]));
        doctors = { ...doctors, [doctorId]: { ...doctors[doctorId], clinicIds: ids } };
      }
      return { ...state, clinics, doctors };
    }
    case "get-doctor-availability": {
      const slots = parseAvailability(fr.response);
      const doctorId = Number(args.doctor_id);
      const clinicId = Number(args.clinic_id);
      const day = typeof args.day_of_week === "string" ? args.day_of_week : "";
      if (!slots || !Number.isFinite(doctorId) || !Number.isFinite(clinicId) || !day) return state;
      const key = `${doctorId}-${clinicId}-${day.toLowerCase()}`;
      const availability = [
        { id: key, doctorId, clinicId, day: capitalize(day), slots },
        ...state.availability.filter((a) => a.id !== key),
      ];
      return bump({ ...state, availability });
    }
    case "compute_routes": {
      const route = parseRoute(fr.response);
      if (!route) return state;
      const clinic = matchClinicForRoute(args, Object.values(state.clinics));
      if (!clinic) return state;
      return bump({ ...state, routes: { ...state.routes, [clinic.id]: route } });
    }
    case "COMPOSIO_MULTI_EXECUTE_TOOL": {
      const { ok, link } = parseCalendarResult(fr.response);
      const index = state.bookings.findIndex((b) => b.status === "pending");
      const bookings = state.bookings.slice();
      if (index >= 0) {
        bookings[index] = { ...bookings[index], status: ok ? "confirmed" : "failed", eventLink: link };
      } else if (ok) {
        bookings.unshift({ id: fr.id ?? nextId("booking"), details: {}, status: "confirmed", eventLink: link });
      } else {
        return state;
      }
      return bump({ ...state, bookings });
    }
    default:
      return state;
  }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== "")) as Partial<T>;
}
