import clsx from "clsx";
import { CalendarDays } from "lucide-react";

import { SLOT_TIMES } from "../config/catalog";
import { clinicTimeZone, zoneCity } from "../lib/timezones";
import type { AvailabilityResult, Clinic, Doctor } from "../lib/types";
import { Card } from "./ui";

export function AvailabilityGrid({
  availability,
  doctor,
  clinic,
  busy,
  onSelectSlot,
}: {
  availability: AvailabilityResult;
  doctor?: Doctor;
  clinic?: Clinic;
  busy: boolean;
  onSelectSlot: (slotIndex: number) => void;
}) {
  const open = availability.slots.filter((s) => s === "available").length;
  const timeZone = clinicTimeZone(clinic);
  return (
    <Card className="p-4 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <CalendarDays className="size-4 text-brand-600" aria-hidden />
            {availability.day}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {doctor ? `Dr. ${doctor.name.replace(/^dr\.?\s+/i, "")}` : `Doctor #${availability.doctorId}`}
            {" · "}
            {clinic?.name ?? `Clinic #${availability.clinicId}`}
            {timeZone && ` · ${zoneCity(timeZone)} time`}
          </p>
        </div>
        <span
          className={clsx(
            "shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold",
            open ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
          )}
        >
          {open ? `${open} of 7 open` : "Fully booked"}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3">
        {availability.slots.map((state, i) => {
          const time = SLOT_TIMES[i];
          const available = state === "available";
          return (
            <button
              key={i}
              type="button"
              disabled={!available || busy}
              onClick={() => onSelectSlot(i)}
              aria-label={`${time.start} to ${time.end}, ${available ? `available, pick a ${availability.day} to book` : "booked"}`}
              className={clsx(
                "rounded-lg border px-2 py-1.5 text-left transition-colors",
                available
                  ? "border-emerald-200 bg-emerald-50/60 text-emerald-800 hover:border-emerald-400 hover:bg-emerald-100 disabled:opacity-60"
                  : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400",
              )}
            >
              <span className={clsx("block text-xs font-semibold", !available && "line-through")}>{time.start}</span>
              <span className="block text-[0.625rem] tracking-wide uppercase">{available ? "Available" : "Booked"}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 text-[0.6875rem] text-slate-500">Weekly schedule. Tap a time, then choose a {availability.day} on the calendar.</p>
    </Card>
  );
}
