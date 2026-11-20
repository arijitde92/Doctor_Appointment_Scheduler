import clsx from "clsx";
import { Building2, CalendarPlus, Car, Clock, MessageSquareText } from "lucide-react";

import { reviewsPrompt } from "../lib/prompts";
import type { Clinic, Doctor, Route } from "../lib/types";
import { Button, Card, initials } from "./ui";

function ClinicRow({
  doctor,
  clinic,
  route,
  busy,
  onBook,
}: {
  doctor: Doctor;
  clinic: Clinic;
  route?: Route;
  busy: boolean;
  onBook: (doctor: Doctor, clinic: Clinic) => void;
}) {
  return (
    <li className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <div className="flex items-start gap-2.5">
        <Building2 className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{clinic.name}</p>
          {clinic.address && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{clinic.address}</p>}
          {route && (route.distanceText || route.durationText) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {route.distanceText && (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[0.6875rem] font-medium text-emerald-700">
                  <Car className="size-3" aria-hidden />
                  {route.distanceText}
                </span>
              )}
              {route.durationText && (
                <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 text-[0.6875rem] font-medium text-sky-700">
                  <Clock className="size-3" aria-hidden />
                  {route.durationText}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <Button size="sm" variant="subtle" className="mt-2.5 w-full" disabled={busy} onClick={() => onBook(doctor, clinic)}>
        <CalendarPlus className="size-3.5" aria-hidden />
        Book at this clinic
      </Button>
    </li>
  );
}

export function DoctorCard({
  doctor,
  clinics,
  routes,
  busy,
  onAsk,
  onBook,
  highlight = false,
}: {
  doctor: Doctor;
  clinics: Clinic[];
  routes: Record<number, Route>;
  busy: boolean;
  onAsk: (prompt: string) => void;
  onBook: (doctor: Doctor, clinic: Clinic) => void;
  highlight?: boolean;
}) {
  const meta = [
    doctor.yearsOfExperience !== undefined ? `${doctor.yearsOfExperience} yrs experience` : null,
    doctor.gender,
    doctor.age !== undefined ? `${doctor.age} yrs` : null,
  ].filter(Boolean);

  return (
    <Card className={clsx("p-4 animate-fade-in", highlight && "ring-2 ring-brand-300")}>
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-50 to-brand-100 font-display text-sm font-bold text-brand-800 ring-1 ring-brand-200">
          {initials(doctor.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="truncate font-display text-[0.9375rem] font-bold text-ink">Dr. {doctor.name.replace(/^dr\.?\s+/i, "")}</h4>
          {doctor.specialization && (
            <span className="mt-0.5 inline-block rounded-md bg-brand-50 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-brand-800">
              {doctor.specialization}
            </span>
          )}
          {meta.length > 0 && <p className="mt-1 text-xs text-slate-500">{meta.join(" · ")}</p>}
        </div>
        {doctor.yearsOfExperience !== undefined && (
          <span className="shrink-0 rounded-lg bg-slate-50 px-2 py-1 text-center ring-1 ring-slate-200">
            <span className="block font-display text-sm leading-none font-bold text-ink">{doctor.yearsOfExperience}</span>
            <span className="text-[0.625rem] text-slate-500">yrs</span>
          </span>
        )}
      </div>

      {clinics.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {clinics.map((clinic) => (
            <ClinicRow key={clinic.id} doctor={doctor} clinic={clinic} route={routes[clinic.id]} busy={busy} onBook={onBook} />
          ))}
        </ul>
      )}

      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" disabled={busy} onClick={() => onAsk(reviewsPrompt(doctor))}>
          <MessageSquareText className="size-3.5" aria-hidden />
          Patient reviews
        </Button>
      </div>
    </Card>
  );
}
