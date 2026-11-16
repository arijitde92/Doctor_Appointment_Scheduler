import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { conversationReducer, hydrate, initialConversation, type ConversationAction } from "./adkEvents";
import { upcomingDates, toIsoDate } from "./dates";
import { bookingPrompt, intakePrompt, parseBookingPrompt } from "./prompts";
import { parseAvailability, parseCalendarResult, parseRoute, toolboxRows } from "./results";
import { createSseParser, readSseStream } from "./sse";
import type { AdkEvent, ConversationState } from "./types";

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

function eventsFrom(sse: string): AdkEvent[] {
  const events: AdkEvent[] = [];
  const parser = createSseParser((data) => events.push(JSON.parse(data)));
  parser.push(sse);
  parser.end();
  return events;
}

function run(state: ConversationState, userText: string, sse: string): ConversationState {
  const actions: ConversationAction[] = [
    { type: "userMessage", id: `turn-${state.turns.length}`, text: userText },
    ...eventsFrom(sse).map((event) => ({ type: "event", event }) as ConversationAction),
    { type: "streamEnd" },
  ];
  return actions.reduce(conversationReducer, state);
}

describe("SSE parser", () => {
  it("handles chunks split mid-event, CRLF line endings and comments", () => {
    const got: string[] = [];
    const parser = createSseParser((d) => got.push(d));
    parser.push('data: {"a":');
    parser.push('1}\r\n\r\n: keep-alive\n\ndata: {"b":2}\n');
    parser.push("\n");
    parser.end();
    expect(got).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("reads a fetch body stream and parses JSON payloads", async () => {
    const encoder = new TextEncoder();
    const text = fixture("availability.sse");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        // Emit in awkward 37-byte chunks to exercise buffering.
        for (let i = 0; i < text.length; i += 37) controller.enqueue(encoder.encode(text.slice(i, i + 37)));
        controller.close();
      },
    });
    const payloads: unknown[] = [];
    await readSseStream(body, (p) => payloads.push(p));
    expect(payloads).toHaveLength(3);
  });
});

describe("conversation reducer", () => {
  const afterSearch = run(initialConversation, "Find a cardiologist in Kolkata", fixture("search.sse"));

  it("builds the chat transcript from partial + final text events", () => {
    const turn = afterSearch.turns[0];
    expect(turn.status).toBe("done");
    expect(turn.replies).toHaveLength(1);
    expect(turn.replies[0].author).toBe("doctor_matcher");
    expect(turn.replies[0].partial).toBe(false);
    expect(turn.replies[0].text).toContain("| 1 | Dr. Priyanka Roy | Manipal Clinic |");
    expect(turn.replies[0].text.match(/I found/g)).toHaveLength(1); // final event replaced the partials
  });

  it("records agent activity with friendly labels and sources", () => {
    const labels = afterSearch.turns[0].activities.map((a) => [a.label, a.source, a.status]);
    expect(labels).toEqual([
      ["Handing over to Doctor Matcher", undefined, "done"],
      ["Searching Cardiology in Kolkata", "Cloud SQL", "done"],
      ["Looking up clinic address", "Cloud SQL", "done"],
      ["Calculating distance & travel time", "Google Maps", "done"],
    ]);
  });

  it("extracts doctors grouped by id with their clinics", () => {
    expect(afterSearch.search?.doctorIds).toEqual([33, 64]);
    expect(afterSearch.search?.specialization).toBe("Cardiology");
    expect(afterSearch.doctors[33].clinicIds).toEqual([1, 2]);
    expect(afterSearch.doctors[33].yearsOfExperience).toBe(24);
    expect(afterSearch.clinics[2].fullAddress).toContain("Dhakuria");
  });

  it("attaches compute_routes results to the matching clinic", () => {
    expect(afterSearch.routes[2]).toMatchObject({ distanceMeters: 5230, distanceText: "5.2 km", durationText: "16 min" });
    expect(afterSearch.routes[1]).toBeUndefined();
  });

  it("parses availability (1 = booked, 0 = available)", () => {
    const state = run(afterSearch, "Check availability for Dr. Priyanka Roy (doctor_id 33) at Manipal Clinic (clinic_id 2) on Monday.", fixture("availability.sse"));
    expect(state.availability[0]).toMatchObject({ doctorId: 33, clinicId: 2, day: "Monday" });
    expect(state.availability[0].slots).toEqual(["booked", "available", "available", "booked", "available", "available", "booked"]);
  });

  it("tracks a booking from the structured prompt to calendar confirmation", () => {
    const prompt = bookingPrompt({
      doctor: "Priyanka Roy",
      specialization: "Cardiology",
      clinic: "Manipal Clinic",
      address: "C.I.T Scheme, Gariahat Rd, Dhakuria, Kolkata",
      date: "2026-11-23",
      time: "11:00 AM",
    });
    const pending = conversationReducer(afterSearch, { type: "userMessage", id: "b1", text: prompt });
    expect(pending.bookings[0]).toMatchObject({ status: "pending", details: { doctor: "Dr. Priyanka Roy", date: "2026-11-23" } });

    const done = run(afterSearch, prompt, fixture("booking.sse"));
    expect(done.bookings[0].status).toBe("confirmed");
    expect(done.bookings[0].eventLink).toBe("https://www.google.com/calendar/event?eid=abc123XYZ");
    const turn = done.turns[done.turns.length - 1];
    // thought parts are hidden from the transcript
    expect(turn.replies.map((r) => r.text)).toEqual([
      "Your appointment with Dr. Priyanka Roy is booked for Monday, 23 Nov 2026 at 11:00 AM.",
    ]);
  });

  it("restores the same state from stored session events", () => {
    const userEvent = (id: string, text: string): AdkEvent => ({ id, author: "user", content: { role: "user", parts: [{ text }] } });
    const restored = hydrate([
      userEvent("u1", "Find a cardiologist in Kolkata"),
      ...eventsFrom(fixture("search.sse")).filter((e) => !e.partial),
    ]);
    expect(restored.turns).toHaveLength(1);
    expect(restored.turns[0].userText).toBe("Find a cardiologist in Kolkata");
    expect(restored.turns[0].replies[0].text).toBe(afterSearch.turns[0].replies[0].text);
    expect(restored.search?.doctorIds).toEqual([33, 64]);
    expect(restored.routes[2]?.distanceMeters).toBe(5230);
  });

  it("surfaces model errors on the turn", () => {
    const state = run(initialConversation, "hi", 'data: {"author":"root_agent","errorCode":"429","errorMessage":"Quota exceeded"}\n\n');
    expect(state.turns[0].status).toBe("error");
    expect(state.turns[0].error).toBe("Quota exceeded");
  });
});

describe("tool response parsing", () => {
  it("treats Toolbox 'null' results as no rows", () => {
    expect(toolboxRows({ result: "null" })).toEqual([]);
    expect(toolboxRows({ result: "not json" })).toBeNull();
  });

  it("accepts boolean slot values", () => {
    expect(parseAvailability({ result: JSON.stringify([{ slot_1: true, slot_2: false, slot_3: false, slot_4: false, slot_5: false, slot_6: false, slot_7: false }]) })?.[0]).toBe("booked");
  });

  it("finds routes in structuredContent and ignores MCP errors", () => {
    expect(parseRoute({ structuredContent: { routes: [{ distanceMeters: 800, duration: "300s" }] } })).toMatchObject({ distanceText: "800 m", durationText: "5 min" });
    expect(parseRoute({ content: [{ type: "text", text: "quota exceeded" }], isError: true })).toBeNull();
  });

  it("detects calendar failures", () => {
    expect(parseCalendarResult({ content: [{ type: "text", text: '{"successful":false,"error":"invalid time"}' }] }).ok).toBe(false);
    expect(parseCalendarResult({ content: [{ type: "text", text: '{"successful":true}' }] }).ok).toBe(true);
  });
});

describe("prompts & dates", () => {
  it("composes the intake message with and without location", () => {
    expect(intakePrompt({ specialization: "Cardiology", city: "Kolkata", location: "Park Street", preferredDay: "Monday" })).toBe(
      "I'm looking for a Cardiology doctor in Kolkata. My current location is: Park Street. Please show the distance and travel time to each clinic, closest first. I'd prefer an appointment on a Monday.",
    );
    expect(intakePrompt({ specialization: "Cardiology", city: "Kolkata" })).toContain("I'd rather not share my location");
  });

  it("round-trips booking prompts", () => {
    const details = { doctor: "Arindam Sen", clinic: "Apex Clinic", date: "2026-11-24", time: "2:00 PM" };
    expect(parseBookingPrompt(bookingPrompt(details))).toEqual({ ...details, doctor: "Dr. Arindam Sen" });
    expect(parseBookingPrompt("hello")).toBeNull();
  });

  it("lists upcoming dates for a weekday, starting tomorrow", () => {
    const monday = new Date(2026, 10, 16); // Mon 16 Nov 2026
    expect(upcomingDates("Monday", 2, monday).map(toIsoDate)).toEqual(["2026-11-23", "2026-11-30"]);
    expect(upcomingDates("Tuesday", 1, monday).map(toIsoDate)).toEqual(["2026-11-17"]);
  });
});
