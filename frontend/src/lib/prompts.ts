/**
 * Prompt builders for UI actions.
 *
 * Every button in the UI simply sends a chat message to the root agent, so the
 * backend and agent instructions stay unchanged. Messages include the IDs the
 * doctor_matcher tools need (doctor_id, clinic_id).
 */
import type { BookingDetails, Clinic, Doctor } from "./types";

export interface IntakeInput {
  specialization: string;
  city: string;
  location?: string;
  /** Preferred weekdays in week order. Empty or all seven means "any day". */
  preferredDays?: readonly string[];
}

export function intakePrompt({ specialization, city, location, preferredDays = [] }: IntakeInput): string {
  const lines = [`I'm looking for a ${specialization} doctor in ${city}.`];
  if (location?.trim()) {
    lines.push(
      `My current location is: ${location.trim()}. Please show the distance and travel time to each clinic, closest first.`,
    );
  } else {
    lines.push("I'd rather not share my location, so please skip distance and travel time.");
  }
  if (preferredDays.length > 0 && preferredDays.length < 7) {
    lines.push(`I'd prefer an appointment on a ${joinWithOr(preferredDays)}.`);
  }
  return lines.join(" ");
}

/** ["Monday"] -> "Monday"; ["Monday", "Wednesday", "Friday"] -> "Monday, Wednesday or Friday". */
function joinWithOr(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

export function reviewsPrompt(doctor: Pick<Doctor, "name" | "id">): string {
  return `What do patients say about Dr. ${stripDr(doctor.name)} (doctor_id ${doctor.id})? Please summarise their reviews.`;
}

export function availabilityPrompt(doctor: Pick<Doctor, "name" | "id">, clinic: Pick<Clinic, "name" | "id">, day: string): string {
  return `Check availability for Dr. ${stripDr(doctor.name)} (doctor_id ${doctor.id}) at ${clinic.name} (clinic_id ${clinic.id}) on ${day}.`;
}

export function clinicsPrompt(doctor: Pick<Doctor, "name" | "id">): string {
  return `Which clinics does Dr. ${stripDr(doctor.name)} (doctor_id ${doctor.id}) practise at?`;
}

const BOOKING_HEADER = "Please book this appointment for me:";
const BOOKING_FIELDS: Array<[keyof BookingDetails, string]> = [
  ["doctor", "Doctor"],
  ["specialization", "Specialization"],
  ["clinic", "Clinic"],
  ["address", "Address"],
  ["date", "Date"],
  ["time", "Time"],
];

/** Mirrors the delegation format the root agent uses for scheduler_agent. */
export function bookingPrompt(details: BookingDetails): string {
  const lines = [BOOKING_HEADER];
  for (const [key, label] of BOOKING_FIELDS) {
    let value = details[key];
    if (!value) continue;
    if (key === "doctor") value = `Dr. ${stripDr(value)}`;
    lines.push(`- ${label}: ${value}`);
  }
  return lines.join("\n");
}

/** Parse a message produced by bookingPrompt (used when replaying a session). */
export function parseBookingPrompt(text: string): BookingDetails | null {
  if (!text.startsWith(BOOKING_HEADER)) return null;
  const details: BookingDetails = {};
  for (const line of text.split("\n").slice(1)) {
    const match = /^-\s*([A-Za-z]+):\s*(.+)$/.exec(line.trim());
    if (!match) continue;
    const field = BOOKING_FIELDS.find(([, label]) => label.toLowerCase() === match[1].toLowerCase());
    if (field) details[field[0]] = match[2].trim();
  }
  return details;
}

export function stripDr(name: string): string {
  return name.replace(/^dr\.?\s+/i, "").trim();
}
