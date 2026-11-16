/**
 * Extract structured data from ADK tool responses (functionResponse parts).
 *
 * Response shapes seen in this app:
 *  - MCP Toolbox (Cloud SQL) tools are ADK function tools that return a string,
 *    which ADK wraps as `{ "result": "<JSON array of rows | 'null'>" }`.
 *  - MCP tools (Google Maps, Composio) return a CallToolResult:
 *    `{ "content": [{ "type": "text", "text": "..." }], "isError": false, "structuredContent"?: {...} }`.
 *
 * Everything here is best-effort: if a shape is unexpected we return null and
 * the chat transcript still carries the information.
 */
import type { Clinic, Route, SlotState } from "./types";

type Row = Record<string, unknown>;

function tryParseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || !/^[[{]/.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

/** Return the rows of a Toolbox (Cloud SQL) tool response, or null. */
export function toolboxRows(response: unknown): Row[] | null {
  let payload: unknown = response;
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "result" in payload) {
    payload = (payload as { result: unknown }).result;
  }
  payload = tryParseJson(payload);
  if (payload === null || payload === "null") return [];
  if (Array.isArray(payload)) return payload.filter((r): r is Row => !!r && typeof r === "object");
  if (payload && typeof payload === "object") {
    // Some transports wrap rows again, e.g. { result: [...] }.
    const inner = (payload as Row).result;
    if (Array.isArray(inner)) return inner as Row[];
  }
  return null;
}

/** Concatenated text + parsed JSON for an MCP CallToolResult-style response. */
export function mcpPayload(response: unknown): { isError: boolean; text: string; json: unknown[] } {
  const result = { isError: false, text: "", json: [] as unknown[] };
  if (!response || typeof response !== "object") return result;
  const r = response as Row;
  result.isError = r.isError === true || r.is_error === true || "error" in r;
  if (r.structuredContent && typeof r.structuredContent === "object") result.json.push(r.structuredContent);
  const content = Array.isArray(r.content) ? r.content : [];
  const texts: string[] = [];
  for (const item of content) {
    if (item && typeof item === "object" && typeof (item as Row).text === "string") {
      const text = (item as Row).text as string;
      texts.push(text);
      const parsed = tryParseJson(text);
      if (parsed !== text) result.json.push(parsed);
    }
  }
  if (typeof r.result === "string") {
    texts.push(r.result);
    const parsed = tryParseJson(r.result);
    if (parsed !== r.result) result.json.push(parsed);
  } else if (r.result && typeof r.result === "object") {
    result.json.push(r.result);
  }
  if (typeof r.error === "string") texts.push(r.error);
  result.text = texts.join("\n");
  return result;
}

const num = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

// ─────────────────────────────────────────────────────────────────────────────
// Cloud SQL tools
// ─────────────────────────────────────────────────────────────────────────────
export interface DoctorClinicRow {
  doctorId: number;
  name: string;
  gender?: string;
  age?: number;
  yearsOfExperience?: number;
  specialization?: string;
  clinic?: Clinic;
}

/** Rows from `find-doctors` (doctor joined with clinic). */
export function parseFindDoctors(response: unknown): DoctorClinicRow[] | null {
  const rows = toolboxRows(response);
  if (!rows) return null;
  const out: DoctorClinicRow[] = [];
  for (const row of rows) {
    const doctorId = num(row.doctor_id ?? row.id);
    const name = str(row.name);
    if (doctorId === undefined || !name) continue;
    const clinicId = num(row.clinic_id);
    out.push({
      doctorId,
      name,
      gender: str(row.gender),
      age: num(row.age),
      yearsOfExperience: num(row.years_of_experience),
      specialization: str(row.specialization),
      clinic:
        clinicId !== undefined
          ? {
              id: clinicId,
              name: str(row.clinic_name) ?? `Clinic ${clinicId}`,
              address: str(row.address) ?? "",
              city: str(row.city),
              pinCode: row.pin_code != null ? String(row.pin_code) : undefined,
            }
          : undefined,
    });
  }
  return out;
}

/** Rows from `get-doctor-clinics` / `get-clinic-location`. */
export function parseClinics(response: unknown): Clinic[] | null {
  const rows = toolboxRows(response);
  if (!rows) return null;
  const out: Clinic[] = [];
  for (const row of rows) {
    const id = num(row.id ?? row.clinic_id);
    if (id === undefined) continue;
    out.push({
      id,
      name: str(row.name ?? row.clinic_name) ?? `Clinic ${id}`,
      address: str(row.address) ?? "",
      city: str(row.city),
      pinCode: row.pin_code != null ? String(row.pin_code) : undefined,
      fullAddress: str(row.full_address),
    });
  }
  return out;
}

/** Row from `get-doctor-details`. */
export function parseDoctorDetails(response: unknown): DoctorClinicRow | null {
  const rows = toolboxRows(response);
  const row = rows?.[0];
  if (!row) return null;
  const doctorId = num(row.id ?? row.doctor_id);
  const name = str(row.name);
  if (doctorId === undefined || !name) return null;
  return {
    doctorId,
    name,
    gender: str(row.gender),
    age: num(row.age),
    yearsOfExperience: num(row.years_of_experience),
    specialization: str(row.specialization),
  };
}

/**
 * Row from `get-doctor-availability`. In the seed data each slot is a
 * BOOLEAN where 1 = booked and 0 = available.
 */
export function parseAvailability(response: unknown): SlotState[] | null {
  const rows = toolboxRows(response);
  const row = rows?.[0];
  if (!row) return null;
  const slots: SlotState[] = [];
  for (let i = 1; i <= 7; i++) {
    const value = row[`slot_${i}`];
    if (value === undefined) return null;
    const booked = value === true || value === 1 || value === "1" || value === "true";
    slots.push(booked ? "booked" : "available");
  }
  return slots;
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Maps (compute_routes)
// ─────────────────────────────────────────────────────────────────────────────
function parseDurationSeconds(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const m = /^(\d+(?:\.\d+)?)s$/.exec(value.trim());
    if (m) return Number(m[1]);
  }
  if (value && typeof value === "object" && "seconds" in value) return num((value as Row).seconds);
  return undefined;
}

function findRouteLike(node: unknown, depth = 0): Row | null {
  if (!node || typeof node !== "object" || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRouteLike(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const row = node as Row;
  if ("distanceMeters" in row || "distance_meters" in row) return row;
  for (const value of Object.values(row)) {
    const found = findRouteLike(value, depth + 1);
    if (found) return found;
  }
  return null;
}

export function formatDistance(meters?: number): string | undefined {
  if (meters === undefined) return undefined;
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds?: number): string | undefined {
  if (seconds === undefined) return undefined;
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function parseRoute(response: unknown): Route | null {
  const { json, isError } = mcpPayload(response);
  if (isError) return null;
  for (const candidate of json) {
    const route = findRouteLike(candidate);
    if (!route) continue;
    const distanceMeters = num(route.distanceMeters ?? route.distance_meters);
    const durationSeconds = parseDurationSeconds(route.duration ?? route.staticDuration);
    if (distanceMeters === undefined && durationSeconds === undefined) continue;
    return {
      distanceMeters,
      durationSeconds,
      distanceText: formatDistance(distanceMeters),
      durationText: formatDuration(durationSeconds),
    };
  }
  return null;
}

/** All string values inside a tool-call args object (destination may be nested). */
export function argStrings(args: unknown, depth = 0): string[] {
  if (depth > 4 || args == null) return [];
  if (typeof args === "string") return [args];
  if (Array.isArray(args)) return args.flatMap((a) => argStrings(a, depth + 1));
  if (typeof args === "object") return Object.values(args as Row).flatMap((v) => argStrings(v, depth + 1));
  return [];
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Find the clinic a compute_routes destination refers to. */
export function matchClinicForRoute(args: Record<string, unknown>, clinics: Clinic[]): Clinic | undefined {
  const destination =
    argStrings(args.destination ?? args.destinations ?? args.to).join(" ") || argStrings(args).slice(1).join(" ");
  const dest = normalize(destination);
  if (!dest) return undefined;
  let best: { clinic: Clinic; score: number } | undefined;
  for (const clinic of clinics) {
    let score = 0;
    const full = normalize(clinic.fullAddress ?? "");
    const address = normalize(clinic.address);
    if (full && dest.includes(full)) score = 3;
    else if (address && dest.includes(address.slice(0, 40))) score = 2;
    else if (clinic.name && dest.includes(normalize(clinic.name))) score = 1;
    if (score && (!best || score > best.score)) best = { clinic, score };
  }
  return best?.clinic;
}

// ─────────────────────────────────────────────────────────────────────────────
// Composio (Google Calendar)
// ─────────────────────────────────────────────────────────────────────────────
export function parseCalendarResult(response: unknown): { ok: boolean; link?: string } {
  const { isError, text } = mcpPayload(response);
  const link = /https:\/\/www\.google\.com\/calendar\/event\?eid=[A-Za-z0-9_\-=%]+/.exec(text)?.[0];
  if (link) return { ok: true, link };
  const explicitFailure = /"successful"\s*:\s*false/.test(text) || /"error"\s*:\s*"[^"]+"/.test(text);
  return { ok: !isError && !explicitFailure };
}
