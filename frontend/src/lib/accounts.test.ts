import { describe, expect, it } from "vitest";

import { conversationReducer, initialConversation } from "./adkEvents";
import { addDays, monthMatrix, parseIsoDate, weekdayName } from "./calendar";
import { bookingPrompt, parseBookingPrompt, rebookPrompt } from "./prompts";
import type { AdkEvent } from "./types";
import { PASSWORD_RULES, passwordIsValid, validateRegistration, type RegistrationForm } from "./validation";

const valid: RegistrationForm = {
  firstName: "Asha",
  lastName: "Roy",
  phone: "+91 98300 12345",
  email: "asha@example.com",
  address: "12 Park Street, Kolkata 700016",
  dateOfBirth: "1990-04-02",
  password: "Str0ng!Pass",
  confirmPassword: "Str0ng!Pass",
};

describe("password & registration rules", () => {
  it("requires length, upper, lower, digit and special character", () => {
    expect(passwordIsValid("Str0ng!Pass")).toBe(true);
    for (const weak of ["Sh0rt!a", "alllower1!", "ALLUPPER1!", "NoDigits!!", "NoSpecial11"]) {
      expect(passwordIsValid(weak), weak).toBe(false);
    }
    const failing = PASSWORD_RULES.filter((r) => !r.test("abc")).map((r) => r.id);
    expect(failing).toEqual(["length", "upper", "digit", "special"]);
  });

  it("accepts a complete form", () => {
    expect(validateRegistration(valid, new Date(2026, 10, 16))).toEqual({});
  });

  it("flags mismatched passwords, bad phone/email and a future date of birth", () => {
    const errors = validateRegistration(
      { ...valid, confirmPassword: "Str0ng!Pas", phone: "12ab", email: "nope", dateOfBirth: "2030-01-01" },
      new Date(2026, 10, 16),
    );
    expect(Object.keys(errors).sort()).toEqual(["confirmPassword", "dateOfBirth", "email", "phone"]);
    expect(errors.confirmPassword).toMatch(/don't match/);
  });
});

describe("calendar helpers", () => {
  it("builds Monday-first month grids covering the whole month", () => {
    const weeks = monthMatrix(new Date(2026, 10, 1)); // November 2026 starts on a Sunday
    expect(weeks).toHaveLength(6);
    expect(weeks[0][0].getDay()).toBe(1); // Monday
    expect(weeks[0][6].getDate()).toBe(1); // Sunday 1 Nov is the last cell of week 1
    expect(weeks.flat().filter((d) => d.getMonth() === 10)).toHaveLength(30);
  });

  it("parses ISO dates in local time and names weekdays", () => {
    const d = parseIsoDate("2026-11-16");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 16]);
    expect(weekdayName(d)).toBe("Monday");
    expect(addDays(d, 20).getMonth()).toBe(11);
  });
});

describe("rebooking & appointment references", () => {
  it("rebook prompt names the doctor id and asks for clinics", () => {
    const text = rebookPrompt({ id: 7, name: "Dr. Anita Sen", specialization: "Cardiology" });
    expect(text).toContain("Dr. Anita Sen (Cardiology), doctor_id 7");
    expect(text).toMatch(/clinics/);
  });

  it("seedDoctor pre-selects the doctor", () => {
    const state = conversationReducer(initialConversation, {
      type: "seedDoctor",
      doctor: { id: 7, name: "Anita Sen", specialization: "Cardiology" },
    });
    expect(state.selectedDoctorId).toBe(7);
    expect(state.doctors[7]).toMatchObject({ name: "Anita Sen", clinicIds: [] });
  });

  it("links a booking to its stored appointment through the reference line", () => {
    const text = bookingPrompt({ doctor: "Anita Sen", clinic: "City Heart", date: "2026-11-20", time: "10:00 AM", reference: "abc-123" });
    expect(parseBookingPrompt(text)?.reference).toBe("abc-123");
    const state = conversationReducer(initialConversation, { type: "userMessage", id: "t1", text });
    expect(state.bookings[0]).toMatchObject({ status: "pending", appointmentId: "abc-123" });
  });

  it("a successful retry after a failed calendar call confirms the same booking", () => {
    const calendar = (ok: boolean, id: string): AdkEvent => ({
      author: "scheduler_agent",
      content: {
        parts: [
          {
            functionResponse: {
              id,
              name: "COMPOSIO_MULTI_EXECUTE_TOOL",
              response: {
                content: [
                  {
                    type: "text",
                    text: ok
                      ? '{"successful": true, "htmlLink": "https://www.google.com/calendar/event?eid=abc123"}'
                      : '{"successful": false, "error": "calendar unavailable"}',
                  },
                ],
              },
            },
          },
        ],
      },
    });
    let state = conversationReducer(initialConversation, {
      type: "userMessage",
      id: "t1",
      text: bookingPrompt({ doctor: "Anita Sen", date: "2026-11-20", time: "10:00 AM", reference: "abc-123" }),
    });
    state = conversationReducer(state, { type: "event", event: calendar(false, "c1") });
    expect(state.bookings[0].status).toBe("failed");
    state = conversationReducer(state, { type: "event", event: calendar(true, "c2") });
    expect(state.bookings).toHaveLength(1);
    expect(state.bookings[0]).toMatchObject({
      status: "confirmed",
      appointmentId: "abc-123",
      eventLink: "https://www.google.com/calendar/event?eid=abc123",
    });
  });
});
