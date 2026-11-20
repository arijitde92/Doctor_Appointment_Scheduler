import { Building2, CalendarDays, Globe2, Stethoscope } from "lucide-react";
import { useMemo, useState } from "react";

import { addDays, startOfDay } from "../../lib/calendar";
import { stripDr } from "../../lib/prompts";
import { clinicTimeZone, todayInZone, zoneLabel } from "../../lib/timezones";
import type { Clinic, Doctor } from "../../lib/types";
import { Modal } from "../Modal";
import { MonthCalendar } from "../MonthCalendar";
import { Button } from "../ui";

/** How far ahead patients can book. */
export const BOOKING_WINDOW_DAYS = 60;

export interface BookingTarget {
  doctor: Doctor;
  clinic: Clinic;
  /** Restrict the calendar to one weekday (opened from an availability card). */
  weekday?: string;
  /** Slot to preselect in the time pop-up. */
  slotIndex?: number;
}

export function clinicAddress(clinic?: Clinic): string | undefined {
  // Seed addresses already include city + PIN, so prefer them over full_address
  // (which concatenates city and PIN again).
  return clinic?.address || clinic?.fullAddress || [clinic?.city, clinic?.pinCode].filter(Boolean).join(", ") || undefined;
}

export function BookingSummary({ doctor, clinic }: { doctor: Doctor; clinic: Clinic }) {
  const address = clinicAddress(clinic);
  return (
    <ul className="flex flex-col gap-2 rounded-2xl bg-slate-50 p-3.5 text-sm">
      <li className="flex items-start gap-2.5">
        <Stethoscope className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
        <span>
          <span className="font-semibold text-ink">Dr. {stripDr(doctor.name)}</span>
          {doctor.specialization && <span className="text-slate-500"> · {doctor.specialization}</span>}
        </span>
      </li>
      <li className="flex items-start gap-2.5">
        <Building2 className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
        <span>
          <span className="font-medium text-ink">{clinic.name}</span>
          {address && <span className="block text-xs text-slate-500">{address}</span>}
        </span>
      </li>
    </ul>
  );
}

/** Step 1 of booking: pick a date on a month calendar. */
export function DatePickerDialog({
  target,
  initialDate,
  onClose,
  onPick,
}: {
  target: BookingTarget;
  initialDate?: Date | null;
  onClose: () => void;
  onPick: (date: Date) => void;
}) {
  const timeZone = clinicTimeZone(target.clinic);
  // "Today" at the clinic, not on the patient's device.
  const today = timeZone ? todayInZone(timeZone) : startOfDay(new Date());
  // Same-day bookings are excluded: the slot may already have passed.
  const first = addDays(today, 1);
  const last = addDays(today, BOOKING_WINDOW_DAYS);
  const weekday = target.weekday?.toLowerCase();

  const isDisabled = useMemo(
    () => (date: Date) =>
      date < first ||
      date > last ||
      (!!weekday && date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase() !== weekday),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekday, first.getTime(), last.getTime()],
  );

  const firstAllowed = useMemo(() => {
    for (let d = first; d <= last; d = addDays(d, 1)) if (!isDisabled(d)) return d;
    return first;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDisabled]);

  const [selected, setSelected] = useState<Date | null>(initialDate ?? null);
  const [month, setMonth] = useState<Date>(() => {
    const d = initialDate ?? firstAllowed;
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  return (
    <Modal
      title="Choose a date"
      subtitle={
        target.weekday
          ? `Showing ${target.weekday}s in the next ${BOOKING_WINDOW_DAYS} days.`
          : `Pick any day in the next ${BOOKING_WINDOW_DAYS} days. Next, you'll choose a time.`
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" disabled={!selected} onClick={() => selected && onPick(selected)}>
            <CalendarDays className="size-4" aria-hidden />
            See time slots
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <BookingSummary doctor={target.doctor} clinic={target.clinic} />
        {timeZone && (
          <p className="-mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <Globe2 className="size-3.5 shrink-0 text-slate-400" aria-hidden />
            Dates and times are local to the clinic: {zoneLabel(timeZone)}.
          </p>
        )}
        <MonthCalendar
          label="Appointment date"
          month={month}
          onMonthChange={setMonth}
          selected={selected}
          onSelect={(date) => {
            setSelected(date);
            onPick(date); // open the time pop-up straight away
          }}
          isDisabled={isDisabled}
          minMonth={today}
          maxMonth={last}
        />
        <p className="flex items-center gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-md ring-2 ring-brand-200 ring-inset" aria-hidden /> Today
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-md bg-brand-700" aria-hidden /> Selected
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-400">
            <span className="line-through">12</span> Unavailable
          </span>
        </p>
      </div>
    </Modal>
  );
}
