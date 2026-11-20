/**
 * City and time-zone helpers.
 *
 * Doctors' slots (10 AM to 5 PM) are local to the clinic, so every date or time
 * shown for a booking is in the clinic's IANA time zone. The zone comes from the
 * clinic row (Clinic.time_zone) or, failing that, from the generated city
 * catalog. Built on Intl only; no date library.
 */
import { CITY_CATALOG, type CityInfo } from "../config/cities";

/** Used when the patient's own time zone has no city in the catalog. */
export const DEFAULT_CITY = "Kolkata";

/** Case- and accent-insensitive key: "Zürich" and "zurich" both find Zurich. */
function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

const BY_CITY = new Map(CITY_CATALOG.map((c) => [fold(c.city), c]));

export function findCity(name?: string | null): CityInfo | undefined {
  return name ? BY_CITY.get(fold(name)) : undefined;
}

/** Cities grouped by country, both sorted alphabetically (the catalog is already sorted). */
export const CITIES_BY_COUNTRY: ReadonlyArray<readonly [string, readonly CityInfo[]]> = Array.from(
  CITY_CATALOG.reduce((map, c) => map.set(c.country, [...(map.get(c.country) ?? []), c]), new Map<string, CityInfo[]>()),
);

export function isValidTimeZone(timeZone?: string | null): timeZone is string {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The clinic's zone: its own time_zone, else its city's zone from the catalog. */
export function clinicTimeZone(clinic?: { timeZone?: string; city?: string } | null): string | undefined {
  const own = clinic?.timeZone;
  if (isValidTimeZone(own)) return own;
  const fromCity = findCity(clinic?.city)?.timeZone;
  return isValidTimeZone(fromCity) ? fromCity : undefined;
}

export function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/** City preselected in the search form: one in the patient's own time zone, else Kolkata. */
export function defaultCity(timeZone: string | undefined = browserTimeZone()): string {
  return CITY_CATALOG.find((c) => c.timeZone === timeZone)?.city ?? DEFAULT_CITY;
}

/** Minutes that `timeZone` is ahead of UTC at the instant `at`. */
export function zoneOffsetMinutes(timeZone: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((wall - (at.getTime() - at.getMilliseconds())) / 60_000);
}

/** "10:00 AM" -> [10, 0]; "12:30 PM" -> [12, 30]. */
export function parseClockTime(time: string): [number, number] | null {
  const m = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(time.trim());
  if (!m) return null;
  const hour = (Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0);
  return [hour, Number(m[2])];
}

/** The instant at which it is `time` ("10:00 AM") on `isoDate` in `timeZone`. */
export function zonedInstant(isoDate: string, time: string, timeZone: string): Date | null {
  const hm = parseClockTime(time);
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!hm || !d || !isValidTimeZone(timeZone)) return null;
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), hm[0], hm[1]);
  // Two passes so the offset used is the one in force at the result (DST changes).
  let utc = wall - zoneOffsetMinutes(timeZone, new Date(wall)) * 60_000;
  utc = wall - zoneOffsetMinutes(timeZone, new Date(utc)) * 60_000;
  return new Date(utc);
}

/**
 * Today's calendar date in `timeZone`, as a local-midnight Date so it can be
 * compared with the dates on the month calendars. Browser zone when omitted.
 */
export function todayInZone(timeZone?: string | null, now: Date = new Date()): Date {
  if (!isValidTimeZone(timeZone)) return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(get("year"), get("month") - 1, get("day"));
}

/** "UTC+1", "UTC+5:30", "UTC−3" (true minus sign), "UTC". */
export function utcOffsetLabel(timeZone: string, at: Date = new Date()): string {
  const off = zoneOffsetMinutes(timeZone, at);
  if (off === 0) return "UTC";
  const abs = Math.abs(off);
  const minutes = abs % 60;
  return `UTC${off > 0 ? "+" : "−"}${Math.floor(abs / 60)}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}`;
}

/** "Europe/Paris" -> "Paris"; "America/Argentina/Buenos_Aires" -> "Buenos Aires". */
export function zoneCity(timeZone: string): string {
  return timeZone.split("/").pop()!.replace(/_/g, " ");
}

/** "Europe/Paris (UTC+1)" — the label used next to clinic-local times. */
export function zoneLabel(timeZone: string, at: Date = new Date()): string {
  return `${timeZone.replace(/_/g, " ")} (${utcOffsetLabel(timeZone, at)})`;
}

/**
 * The patient's own clock time for a clinic-local slot, or null when the two
 * zones agree at that moment. Adds the weekday when the day differs.
 * "4:30 AM" / "Mon 11:30 PM".
 */
export function viewerTime(
  isoDate: string,
  time: string,
  clinicZone: string | undefined,
  viewerZone: string | undefined = browserTimeZone(),
): string | null {
  if (!clinicZone || !viewerZone || !isValidTimeZone(viewerZone)) return null;
  const instant = zonedInstant(isoDate, time, clinicZone);
  if (!instant || zoneOffsetMinutes(clinicZone, instant) === zoneOffsetMinutes(viewerZone, instant)) return null;
  const sameDay =
    instant.toLocaleDateString("en-CA", { timeZone: clinicZone }) === instant.toLocaleDateString("en-CA", { timeZone: viewerZone });
  return instant.toLocaleString(undefined, {
    timeZone: viewerZone,
    hour: "numeric",
    minute: "2-digit",
    ...(sameDay ? {} : { weekday: "short" }),
  });
}
