import clsx from "clsx";
import { Building2, CalendarCheck, Clock, Stethoscope, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { SLOT_TIMES } from "../config/catalog";
import { toIsoDate, upcomingDates } from "../lib/dates";
import { bookingPrompt } from "../lib/prompts";
import type { AvailabilityResult, Clinic, Doctor } from "../lib/types";
import { Button } from "./ui";

export interface SlotSelection {
  availability: AvailabilityResult;
  slotIndex: number;
}

export function BookingDialog({
  selection,
  doctor,
  clinic,
  onClose,
  onConfirm,
}: {
  selection: SlotSelection;
  doctor?: Doctor;
  clinic?: Clinic;
  onClose: () => void;
  onConfirm: (prompt: string) => void;
}) {
  const dates = useMemo(() => upcomingDates(selection.availability.day, 4), [selection.availability.day]);
  const [dateIso, setDateIso] = useState(() => (dates[0] ? toIsoDate(dates[0]) : ""));
  const dialogRef = useRef<HTMLDivElement>(null);
  const time = SLOT_TIMES[selection.slotIndex];

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input");
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  const doctorName = doctor ? doctor.name.replace(/^dr\.?\s+/i, "") : undefined;
  // Seed addresses already include city + PIN, so prefer them over full_address
  // (which concatenates city and PIN again).
  const address = clinic?.address || clinic?.fullAddress || [clinic?.city, clinic?.pinCode].filter(Boolean).join(", ");

  function confirm() {
    onConfirm(
      bookingPrompt({
        doctor: doctorName ?? `doctor_id ${selection.availability.doctorId}`,
        specialization: doctor?.specialization,
        clinic: clinic?.name ?? `clinic_id ${selection.availability.clinicId}`,
        address: address || undefined,
        date: dateIso,
        time: time.start,
      }),
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-title"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl bg-white shadow-pop animate-fade-in sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="booking-title" className="font-display text-lg font-bold text-ink">
              Confirm your appointment
            </h2>
            <p className="text-sm text-slate-500">Choose a date for this {selection.availability.day} slot.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ink" aria-label="Close">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <ul className="flex flex-col gap-2.5 rounded-2xl bg-slate-50 p-4 text-sm">
            <li className="flex items-start gap-2.5">
              <Stethoscope className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
              <span>
                <span className="font-semibold text-ink">{doctorName ? `Dr. ${doctorName}` : `Doctor #${selection.availability.doctorId}`}</span>
                {doctor?.specialization && <span className="text-slate-500"> · {doctor.specialization}</span>}
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <Building2 className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
              <span>
                <span className="font-medium text-ink">{clinic?.name ?? `Clinic #${selection.availability.clinicId}`}</span>
                {address && <span className="block text-xs text-slate-500">{address}</span>}
              </span>
            </li>
            <li className="flex items-center gap-2.5">
              <Clock className="size-4 shrink-0 text-brand-600" aria-hidden />
              <span className="font-medium text-ink">
                {time.start} – {time.end}
              </span>
            </li>
          </ul>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">Date</legend>
            <div className="grid grid-cols-2 gap-2">
              {dates.map((date, i) => {
                const iso = toIsoDate(date);
                const selected = iso === dateIso;
                return (
                  <button
                    key={iso}
                    type="button"
                    data-autofocus={i === 0 ? true : undefined}
                    aria-pressed={selected}
                    onClick={() => setDateIso(iso)}
                    className={clsx(
                      "rounded-xl border px-3 py-2 text-left transition-colors",
                      selected ? "border-brand-600 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 hover:border-brand-300",
                    )}
                  >
                    <span className="block text-sm font-semibold text-ink">
                      {date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {i === 0 ? "Next " : ""}
                      {date.toLocaleDateString(undefined, { weekday: "long" })}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <p className="text-xs text-slate-500">
            The scheduling assistant will create a Google Calendar event with the clinic address and appointment details.
          </p>
        </div>

        <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={confirm} disabled={!dateIso}>
            <CalendarCheck className="size-4" aria-hidden />
            Book appointment
          </Button>
        </div>
      </div>
    </div>
  );
}
