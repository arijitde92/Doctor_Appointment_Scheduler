import clsx from "clsx";
import { CalendarCheck, CalendarDays, Loader2, MapPin, Repeat2, Stethoscope, Users } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import type { Clinic, ConversationState, Doctor } from "../lib/types";
import { AvailabilityGrid } from "./AvailabilityGrid";
import { BookingCard } from "./BookingCard";
import type { BookingTarget } from "./booking/DatePickerDialog";
import { DoctorCard } from "./DoctorCard";
import { Card, SectionTitle } from "./ui";

function EmptyResults() {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <div className="relative mb-5">
        <span className="grid size-16 place-items-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
          <Stethoscope className="size-7" aria-hidden />
        </span>
        <span className="absolute -right-3 -bottom-2 grid size-8 place-items-center rounded-xl bg-white text-amber-500 shadow-card ring-1 ring-slate-200">
          <CalendarCheck className="size-4" aria-hidden />
        </span>
      </div>
      <h3 className="font-display text-base font-bold text-ink">Your matches will appear here</h3>
      <p className="mt-1 max-w-xs text-sm text-slate-500">
        Doctor profiles, clinic distances, open time slots and your booking, updated as the conversation goes.
      </p>
      <ul className="mt-5 flex flex-col gap-2 text-left text-[0.8125rem] text-slate-600">
        <li className="flex items-center gap-2">
          <Users className="size-4 text-brand-600" aria-hidden /> Compare doctors side by side
        </li>
        <li className="flex items-center gap-2">
          <MapPin className="size-4 text-brand-600" aria-hidden /> See travel time to each clinic
        </li>
        <li className="flex items-center gap-2">
          <CalendarDays className="size-4 text-brand-600" aria-hidden /> Pick a date and time to book
        </li>
      </ul>
    </div>
  );
}

export function ResultsPanel({
  state,
  busy,
  onAsk,
  onBook,
  className,
}: {
  state: ConversationState;
  busy: boolean;
  onAsk: (prompt: string) => void;
  /** Open the calendar booking flow. */
  onBook: (target: BookingTarget) => void;
  className?: string;
}) {
  const selectedDoctor = state.selectedDoctorId !== undefined ? state.doctors[state.selectedDoctorId] : undefined;
  const doctors = useMemo(() => {
    const list = (state.search?.doctorIds ?? []).map((id) => state.doctors[id]).filter((d): d is Doctor => !!d);
    // Closest first when travel distances are known, otherwise keep search order (experience).
    const nearest = (d: Doctor) =>
      Math.min(...d.clinicIds.map((c) => state.routes[c]?.distanceMeters ?? Number.POSITIVE_INFINITY));
    if (list.some((d) => Number.isFinite(nearest(d)))) {
      return [...list].sort((a, b) => nearest(a) - nearest(b));
    }
    return list;
  }, [state.search, state.doctors, state.routes]);

  const hasAnything = !!selectedDoctor || doctors.length > 0 || state.availability.length > 0 || state.bookings.length > 0;
  const book = (doctor: Doctor, clinic: Clinic) => onBook({ doctor, clinic });

  // New bookings / slots are inserted at the top: bring them into view.
  const scrollRef = useRef<HTMLDivElement>(null);
  const latestKey = `${state.bookings[0]?.id}:${state.bookings[0]?.status}|${state.availability[0]?.id}|${state.search?.id}`;
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [latestKey]);

  return (
    <Card className={clsx("flex min-h-0 flex-col overflow-hidden", className)}>
      <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
        <h2 className="font-display text-[0.9375rem] font-bold text-ink">Your results</h2>
        <p className="text-xs text-slate-500">
          {state.search
            ? `${doctors.length} ${state.search.specialization ?? ""} ${doctors.length === 1 ? "doctor" : "doctors"}${state.search.city ? ` in ${state.search.city}` : ""}`.replace(/\s+/g, " ")
            : "Live updates from your consultation"}
        </p>
      </div>

      <div ref={scrollRef} className="panel-scroll min-h-0 flex-1 overflow-y-auto bg-slate-50/50 p-3 sm:p-4">
        {!hasAnything ? (
          <EmptyResults />
        ) : (
          <div className="flex flex-col gap-6">
            {selectedDoctor && (
              <section aria-label="Rebooking">
                <SectionTitle icon={<Repeat2 className="size-3.5" aria-hidden />}>Booking again with</SectionTitle>
                <DoctorCard
                  doctor={selectedDoctor}
                  clinics={selectedDoctor.clinicIds.map((id) => state.clinics[id]).filter(Boolean)}
                  routes={state.routes}
                  busy={busy}
                  onAsk={onAsk}
                  onBook={book}
                  highlight
                />
                {selectedDoctor.clinicIds.length === 0 && (
                  <p className="mt-2 flex items-center gap-2 px-1 text-xs text-slate-500">
                    {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                    {busy ? "Loading this doctor's clinics…" : "Ask the assistant to list this doctor's clinics."}
                  </p>
                )}
              </section>
            )}

            {state.bookings.length > 0 && (
              <section aria-label="Bookings">
                <SectionTitle icon={<CalendarCheck className="size-3.5" aria-hidden />}>Appointments</SectionTitle>
                <div className="flex flex-col gap-3">
                  {state.bookings.slice(0, 3).map((b) => (
                    <BookingCard key={b.id} booking={b} />
                  ))}
                </div>
              </section>
            )}

            {state.availability.length > 0 && (
              <section aria-label="Open time slots">
                <SectionTitle icon={<CalendarDays className="size-3.5" aria-hidden />}>Open time slots</SectionTitle>
                <div className="flex flex-col gap-3">
                  {state.availability.slice(0, 3).map((a) => (
                    <AvailabilityGrid
                      key={a.id}
                      availability={a}
                      doctor={state.doctors[a.doctorId]}
                      clinic={state.clinics[a.clinicId]}
                      busy={busy}
                      onSelectSlot={(slotIndex) => {
                        const doctor = state.doctors[a.doctorId];
                        const clinic = state.clinics[a.clinicId];
                        if (doctor && clinic) onBook({ doctor, clinic, weekday: a.day, slotIndex });
                      }}
                    />
                  ))}
                </div>
              </section>
            )}

            {doctors.length > 0 && (
              <section aria-label="Matching doctors">
                <SectionTitle
                  icon={<Stethoscope className="size-3.5" aria-hidden />}
                  aside={<span className="text-xs text-slate-400">{doctors.length} found</span>}
                >
                  Matching doctors
                </SectionTitle>
                <div className="flex flex-col gap-3">
                  {doctors.map((d) => (
                    <DoctorCard
                      key={d.id}
                      doctor={d}
                      clinics={d.clinicIds.map((id) => state.clinics[id]).filter(Boolean)}
                      routes={state.routes}
                      busy={busy}
                      onAsk={onAsk}
                      onBook={book}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
