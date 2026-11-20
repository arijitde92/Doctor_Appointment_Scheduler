import { describe, expect, it } from "vitest";

import { CITY_CATALOG } from "../config/cities";
import { bookingPrompt, parseBookingPrompt } from "./prompts";
import {
  CITIES_BY_COUNTRY,
  clinicTimeZone,
  defaultCity,
  findCity,
  isValidTimeZone,
  parseClockTime,
  todayInZone,
  utcOffsetLabel,
  viewerTime,
  zoneLabel,
  zonedInstant,
} from "./timezones";

describe("city catalog", () => {
  it("lists every seeded city once, each with a valid IANA zone", () => {
    expect(CITY_CATALOG.length).toBe(170);
    expect(new Set(CITY_CATALOG.map((c) => c.city)).size).toBe(CITY_CATALOG.length);
    expect(CITY_CATALOG.every((c) => isValidTimeZone(c.timeZone))).toBe(true);
    expect(CITIES_BY_COUNTRY.length).toBe(44);
    expect(CITIES_BY_COUNTRY.find(([country]) => country === "India")?.[1].map((c) => c.city)).toEqual(["Kolkata"]);
  });

  it("finds cities regardless of case and accents", () => {
    expect(findCity("Zürich")?.timeZone).toBe("Europe/Zurich");
    expect(findCity("  SAO PAULO ")?.country).toBe("Brazil");
    expect(findCity("Atlantis")).toBeUndefined();
  });

  it("maps cities in multi-zone countries to their own zone", () => {
    expect(findCity("Houston")?.timeZone).toBe("America/Chicago");
    expect(findCity("Perth")?.timeZone).toBe("Australia/Perth");
    expect(findCity("Denpasar")?.timeZone).toBe("Asia/Makassar");
  });
});

describe("clinicTimeZone / defaultCity", () => {
  it("prefers the clinic's own zone, then its city's", () => {
    expect(clinicTimeZone({ timeZone: "Europe/Paris", city: "Kolkata" })).toBe("Europe/Paris");
    expect(clinicTimeZone({ city: "Kolkata" })).toBe("Asia/Kolkata");
    expect(clinicTimeZone({ timeZone: "Not/AZone", city: "Tokyo" })).toBe("Asia/Tokyo");
    expect(clinicTimeZone({ city: "Atlantis" })).toBeUndefined();
    expect(clinicTimeZone(undefined)).toBeUndefined();
  });

  it("preselects a city in the patient's zone, else Kolkata", () => {
    expect(defaultCity("Asia/Kolkata")).toBe("Kolkata");
    expect(findCity(defaultCity("Europe/Paris"))?.country).toBe("France");
    expect(defaultCity("Antarctica/Troll")).toBe("Kolkata");
    expect(defaultCity(undefined)).toBe("Kolkata");
  });
});

describe("zone arithmetic", () => {
  it("parses slot times", () => {
    expect(parseClockTime("10:00 AM")).toEqual([10, 0]);
    expect(parseClockTime("12:00 PM")).toEqual([12, 0]);
    expect(parseClockTime("4:30 pm")).toEqual([16, 30]);
    expect(parseClockTime("16:00")).toBeNull();
  });

  it("turns a clinic-local slot into the right instant, including DST and half-hour zones", () => {
    expect(zonedInstant("2026-11-23", "10:00 AM", "Asia/Kolkata")?.toISOString()).toBe("2026-11-23T04:30:00.000Z");
    expect(zonedInstant("2026-11-23", "10:00 AM", "Europe/Paris")?.toISOString()).toBe("2026-11-23T09:00:00.000Z");
    expect(zonedInstant("2026-07-01", "10:00 AM", "Europe/Paris")?.toISOString()).toBe("2026-07-01T08:00:00.000Z");
    // US daylight saving starts on 8 March 2026: 10 AM that day is already EDT (UTC-4).
    expect(zonedInstant("2026-03-08", "10:00 AM", "America/New_York")?.toISOString()).toBe("2026-03-08T14:00:00.000Z");
    expect(zonedInstant("2026-03-07", "10:00 AM", "America/New_York")?.toISOString()).toBe("2026-03-07T15:00:00.000Z");
    expect(zonedInstant("bad", "10:00 AM", "Asia/Tokyo")).toBeNull();
  });

  it("knows today's date at the clinic", () => {
    const now = new Date("2026-11-20T20:00:00Z");
    const ymd = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];
    expect(ymd(todayInZone("Asia/Tokyo", now))).toEqual([2026, 11, 21]);
    expect(ymd(todayInZone("America/Los_Angeles", now))).toEqual([2026, 11, 20]);
  });

  it("labels offsets", () => {
    const nov = new Date("2026-11-20T12:00:00Z");
    expect(utcOffsetLabel("Asia/Kolkata", nov)).toBe("UTC+5:30");
    expect(utcOffsetLabel("America/Sao_Paulo", nov)).toBe("UTC−3");
    expect(utcOffsetLabel("Europe/London", nov)).toBe("UTC");
    expect(zoneLabel("America/Argentina/Buenos_Aires", nov)).toBe("America/Argentina/Buenos Aires (UTC−3)");
  });
});

describe("viewerTime", () => {
  it("shows the patient's own time only when it differs", () => {
    expect(viewerTime("2026-11-23", "10:00 AM", "Europe/Paris", "Asia/Kolkata")).toMatch(/2:30/);
    expect(viewerTime("2026-11-23", "10:00 AM", "Asia/Kolkata", "Asia/Kolkata")).toBeNull();
    expect(viewerTime("2026-11-23", "10:00 AM", undefined, "Asia/Kolkata")).toBeNull();
  });

  it("adds the weekday when the slot falls on another day for the patient", () => {
    // 10 AM Monday in Auckland (UTC+13) is 1 PM Sunday in Los Angeles (UTC-8).
    const text = viewerTime("2026-11-23", "10:00 AM", "Pacific/Auckland", "America/Los_Angeles");
    expect(text).toMatch(/1:00/);
    expect(text).toMatch(/Sun/);
  });
});

describe("booking prompt", () => {
  it("carries the clinic's time zone and parses it back", () => {
    const details = { doctor: "Camille Dubois", clinic: "Clinique des Tilleuls", date: "2026-11-23", time: "10:00 AM", timeZone: "Europe/Paris" };
    const text = bookingPrompt(details);
    expect(text).toContain("- Time zone: Europe/Paris");
    expect(parseBookingPrompt(text)).toEqual({ ...details, doctor: "Dr. Camille Dubois" });
  });
});
