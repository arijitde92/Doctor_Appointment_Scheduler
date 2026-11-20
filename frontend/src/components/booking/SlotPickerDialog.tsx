import clsx from "clsx";
import { ArrowLeft, CalendarCheck, CircleAlert, Clock, Loader2, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { SLOT_TIMES } from "../../config/catalog";
import { ApiError, bookedSlots } from "../../lib/api";
import { formatLongDate, weekdayName } from "../../lib/calendar";
import { toIsoDate } from "../../lib/dates";
import type { AvailabilityResult } from "../../lib/types";
import { Modal } from "../Modal";
import { Button } from "../ui";
import { BookingSummary, type BookingTarget } from "./DatePickerDialog";

type SlotView = "available" | "booked" | "taken";

/**
 * Step 2 of booking: a pop-up with the day's time slots.
 *
 * Slot state combines the doctor's weekly schedule for that weekday (fetched by
 * the agent: get-doctor-availability) with appointments already booked through
 * CareConnect on that exact date.
 */
export function SlotPickerDialog({
  target,
  date,
  availability,
  busy,
  onRequestAvailability,
  onChangeDate,
  onClose,
  onConfirm,
}: {
  target: BookingTarget;
  date: Date;
  availability?: AvailabilityResult;
  busy: boolean;
  /** Ask the agent for this weekday's schedule (shows in the chat too). */
  onRequestAvailability: () => void;
  onChangeDate: () => void;
  onClose: () => void;
  /** Create the appointment and send the booking request. */
  onConfirm: (slotIndex: number) => Promise<void>;
}) {
  const iso = toIsoDate(date);
  const weekday = weekdayName(date);
  const [taken, setTaken] = useState<number[] | null>(null);
  const [selected, setSelected] = useState<number | null>(target.slotIndex ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Weekly schedule from the agent ───────────────────────────────────────
  const [requested, setRequested] = useState(false);
  const [agentWorked, setAgentWorked] = useState(false);
  const request = useCallback(() => {
    setRequested(true);
    setAgentWorked(false);
    onRequestAvailability();
  }, [onRequestAvailability]);

  useEffect(() => {
    if (!availability && !requested && !busy) request();
  }, [availability, requested, busy, request]);

  useEffect(() => {
    if (requested && busy) setAgentWorked(true);
  }, [requested, busy]);

  const scheduleFailed = !availability && requested && agentWorked && !busy;

  // ── Date-specific bookings ───────────────────────────────────────────────
  const loadTaken = useCallback(async () => {
    try {
      setTaken(await bookedSlots(target.doctor.id, target.clinic.id, iso));
    } catch {
      setTaken([]); // the confirmation still fails safely server-side (409)
    }
  }, [target.doctor.id, target.clinic.id, iso]);

  useEffect(() => {
    void loadTaken();
  }, [loadTaken]);

  const slots: SlotView[] | null =
    availability && taken
      ? availability.slots.map((s, i) => (s === "booked" ? "booked" : taken.includes(i) ? "taken" : "available"))
      : null;

  // Drop a preselected slot that turns out to be unavailable.
  useEffect(() => {
    if (slots && selected !== null && slots[selected] !== "available") setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots?.join()]);

  const openCount = slots?.filter((s) => s === "available").length ?? 0;

  async function confirm() {
    if (selected === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(selected);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("Sorry, that slot was just booked by someone else. Please choose another time.");
        setSelected(null);
        void loadTaken();
      } else {
        setError(err instanceof ApiError ? err.message : "We couldn't reserve this slot. Please try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="Choose a time"
      subtitle={formatLongDate(date)}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onChangeDate} disabled={submitting}>
            <ArrowLeft className="size-4" aria-hidden />
            Change date
          </Button>
          <Button className="flex-1" onClick={confirm} disabled={selected === null || submitting || busy}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CalendarCheck className="size-4" aria-hidden />}
            {selected === null ? "Select a time" : `Book ${SLOT_TIMES[selected].start}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <BookingSummary doctor={target.doctor} clinic={target.clinic} />

        <div aria-live="polite">
          {!slots ? (
            scheduleFailed ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50/60 p-5 text-center">
                <CircleAlert className="size-6 text-rose-500" aria-hidden />
                <p className="text-sm text-rose-800">We couldn't load the {weekday} schedule.</p>
                <Button variant="secondary" size="sm" onClick={request} disabled={busy}>
                  <RotateCw className="size-3.5" aria-hidden />
                  Try again
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50/60 p-6 text-center">
                <Loader2 className="size-6 animate-spin text-brand-600" aria-hidden />
                <p className="text-sm font-medium text-ink">Checking the {weekday} schedule…</p>
                <p className="text-xs text-slate-500">The assistant is looking up open slots. You can follow along in the chat.</p>
              </div>
            )
          ) : (
            <fieldset>
              <legend className="mb-2 flex w-full items-center justify-between text-sm font-medium text-slate-700">
                <span className="flex items-center gap-1.5">
                  <Clock className="size-4 text-brand-600" aria-hidden />
                  Available times
                </span>
                <span
                  className={clsx(
                    "rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold",
                    openCount ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
                  )}
                >
                  {openCount ? `${openCount} of ${slots.length} open` : "Fully booked"}
                </span>
              </legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Time slots">
                {slots.map((state, i) => {
                  const time = SLOT_TIMES[i];
                  const available = state === "available";
                  const isSelected = selected === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      disabled={!available || submitting}
                      data-autofocus={isSelected || (selected === null && available && slots.indexOf("available") === i) ? true : undefined}
                      onClick={() => setSelected(i)}
                      className={clsx(
                        "rounded-xl border px-3 py-2 text-left transition-colors",
                        isSelected && "border-brand-600 bg-brand-700 text-white shadow-sm ring-2 ring-brand-100",
                        !isSelected && available && "border-emerald-200 bg-emerald-50/60 text-emerald-900 hover:border-emerald-400 hover:bg-emerald-100",
                        !available && "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400",
                      )}
                    >
                      <span className={clsx("block text-sm font-semibold", !available && "line-through")}>{time.start}</span>
                      <span className={clsx("block text-[0.6875rem]", isSelected ? "text-brand-100" : "opacity-80")}>
                        {available ? `until ${time.end}` : state === "taken" ? "Just booked" : "Booked"}
                      </span>
                    </button>
                  );
                })}
              </div>
              {openCount === 0 && (
                <p className="mt-3 text-sm text-slate-500">No open times on this day. Try another date.</p>
              )}
            </fieldset>
          )}
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        <p className="text-xs text-slate-500">
          After you book, the scheduling assistant adds the appointment to Google Calendar and it appears on your dashboard.
        </p>
      </div>
    </Modal>
  );
}
