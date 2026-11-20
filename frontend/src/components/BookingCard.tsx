import clsx from "clsx";
import { CalendarCheck, CircleAlert, Clock3, ExternalLink } from "lucide-react";

import { isValidTimeZone, zoneCity } from "../lib/timezones";
import type { Booking } from "../lib/types";
import { Card } from "./ui";

const STATUS = {
  pending: { icon: Clock3, title: "Booking requested", tone: "bg-amber-50 text-amber-800 ring-amber-200", note: "The scheduler is confirming your appointment…" },
  confirmed: { icon: CalendarCheck, title: "Appointment confirmed", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200", note: "Added to Google Calendar." },
  failed: { icon: CircleAlert, title: "Booking not completed", tone: "bg-rose-50 text-rose-800 ring-rose-200", note: "Ask the assistant to try again." },
} as const;

export function BookingCard({ booking }: { booking: Booking }) {
  const s = STATUS[booking.status];
  const Icon = s.icon;
  const d = booking.details;
  const rows: Array<[string, string | undefined]> = [
    ["Doctor", d.doctor],
    ["Speciality", d.specialization],
    ["Clinic", d.clinic],
    ["Date", d.date ? formatDate(d.date) : undefined],
    ["Time", d.time && isValidTimeZone(d.timeZone) ? `${d.time} (${zoneCity(d.timeZone)} time)` : d.time],
  ];

  return (
    <Card className="overflow-hidden animate-fade-in">
      <div className={clsx("flex items-center gap-2 px-4 py-2.5 text-sm font-semibold ring-1 ring-inset", s.tone)}>
        <Icon className="size-4" aria-hidden />
        {s.title}
      </div>
      <div className="p-4">
        {rows.some(([, v]) => v) && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {rows.map(([label, value]) =>
              value ? (
                <div key={label} className="contents">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="font-medium text-ink">{value}</dd>
                </div>
              ) : null,
            )}
          </dl>
        )}
        {d.address && <p className="mt-2 text-xs text-slate-500">{d.address}</p>}
        <p className="mt-3 text-xs text-slate-500">{s.note}</p>
        {booking.eventLink && (
          <a
            href={booking.eventLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-brand-700 hover:text-brand-900"
          >
            Open in Google Calendar
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </div>
    </Card>
  );
}

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
