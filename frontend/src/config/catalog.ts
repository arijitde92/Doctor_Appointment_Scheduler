/** Product name shown in the UI. Change it here to rebrand the app. */
export const BRAND_NAME = "CareConnect";
export const BRAND_TAGLINE = "Doctor Appointment Scheduler";

/**
 * Specializations exactly as stored in Cloud SQL
 * (see data_creation_artifacts/generate_data.py). The Toolbox `find-doctors`
 * query uses an exact match, so these values must not be "prettified".
 */
export const SPECIALIZATIONS = [
  "General",
  "Cardiology",
  "Neurology",
  "Orthopedic",
  "Pediatrics",
  "Gastroenterology",
  "Pulmonology",
  "Obstetrics and Gynecology (OB/GYN)",
  "Psychiatry",
  "Psychology",
  "Radiology",
  "Pathology",
] as const;

/** Cities with clinics in the seed data. Free text is still allowed. */
export const CITIES = ["Kolkata"] as const;

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export type Day = (typeof DAYS)[number];

/** slot_1..slot_7 => one-hour slots from 10 AM to 5 PM (doctor_matcher instructions). */
export const SLOT_TIMES = [
  { start: "10:00 AM", end: "11:00 AM" },
  { start: "11:00 AM", end: "12:00 PM" },
  { start: "12:00 PM", end: "1:00 PM" },
  { start: "1:00 PM", end: "2:00 PM" },
  { start: "2:00 PM", end: "3:00 PM" },
  { start: "3:00 PM", end: "4:00 PM" },
  { start: "4:00 PM", end: "5:00 PM" },
] as const;

/** Friendly names for the ADK agents (event.author). */
export const AGENT_NAMES: Record<string, string> = {
  root_agent: "Care Coordinator",
  doctor_matcher: "Doctor Matcher",
  doctor_rag_agent: "Review Analyst",
  scheduler_agent: "Appointment Scheduler",
};

export function agentName(author: string | undefined): string {
  if (!author) return "Assistant";
  return AGENT_NAMES[author] ?? author.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const EMERGENCY_NUMBER = "112";

/** Contact point shown in the footer and on the Contact Us page (mailto link). */
export const CONTACT_EMAIL = "arijitde2050@gmail.com";
