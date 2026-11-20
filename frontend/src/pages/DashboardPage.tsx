import clsx from "clsx";
import {
  ArrowRight,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CircleAlert,
  Clock,
  ExternalLink,
  History,
  Loader2,
  MessageSquareText,
  MessagesSquare,
  Plus,
  Repeat2,
  Stethoscope,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { Markdown } from "../components/Markdown";
import { Modal } from "../components/Modal";
import { MonthCalendar } from "../components/MonthCalendar";
import { PageShell } from "../components/layout/PageShell";
import { Button, Card, SectionTitle } from "../components/ui";
import { agentName } from "../config/catalog";
import { consultationMessages, listAppointments, listConsultations } from "../lib/api";
import { formatLongDate, parseIsoDate, startOfDay } from "../lib/calendar";
import { isValidTimeZone, todayInZone, viewerTime, zoneCity, zonedInstant, zoneLabel } from "../lib/timezones";
import type { Appointment, AppointmentStatus, ConsultationSummary, LogMessage } from "../lib/types";
import type { ConsultNavState } from "./ConsultPage";

const STATUS_STYLE: Record<AppointmentStatus, { label: string; chip: string; badge: string }> = {
  confirmed: { label: "Confirmed", chip: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100", badge: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  pending: { label: "Pending", chip: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100", badge: "bg-amber-50 text-amber-800 ring-amber-200" },
  failed: { label: "Not completed", chip: "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100", badge: "bg-rose-50 text-rose-700 ring-rose-200" },
  cancelled: { label: "Cancelled", chip: "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100", badge: "bg-slate-100 text-slate-600 ring-slate-200" },
};
const PAST_CHIP = "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200";

/** Past at the clinic: compare with "today" in the appointment's own time zone. */
const isPast = (a: Appointment, today: Date) =>
  parseIsoDate(a.appointmentDate) < (isValidTimeZone(a.timeZone) ? todayInZone(a.timeZone) : today);

/** "10:00 AM (Paris)" when the appointment's time zone is known. */
function timeWithZone(a: Appointment) {
  return isValidTimeZone(a.timeZone) ? `${a.startTime} (${zoneCity(a.timeZone)})` : a.startTime;
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** "10:00 AM" -> "10 AM" */
function shortTime(t: string) {
  return t.replace(":00", "");
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [consultations, setConsultations] = useState<ConsultationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = startOfDay(new Date());
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<ConsultationSummary | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [a, c] = await Promise.all([listAppointments(), listConsultations()]);
      setAppointments(a);
      setConsultations(c);
    } catch {
      setError("We couldn't load your dashboard. Please try again.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments ?? []) {
      if (a.status === "cancelled") continue;
      map.set(a.appointmentDate, [...(map.get(a.appointmentDate) ?? []), a]);
    }
    for (const list of map.values()) list.sort((x, y) => x.slotIndex - y.slotIndex);
    return map;
  }, [appointments]);

  const visible = (appointments ?? []).filter((a) => a.status !== "cancelled");
  const upcoming = visible
    .filter((a) => !isPast(a, today) && a.status !== "failed")
    .sort((x, y) => x.appointmentDate.localeCompare(y.appointmentDate) || x.slotIndex - y.slotIndex);
  const past = visible.filter((a) => isPast(a, today) && a.status === "confirmed");
  const doctorsSeen = new Set(visible.filter((a) => a.status === "confirmed").map((a) => a.doctorId)).size;
  const selected = visible.find((a) => a.id === selectedId) ?? null;

  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  const monthAppointments = visible
    .filter((a) => a.appointmentDate.startsWith(monthKey))
    .sort((x, y) => x.appointmentDate.localeCompare(y.appointmentDate) || x.slotIndex - y.slotIndex);
  const dayAppointments = selectedDay ? byDay.get(isoKey(selectedDay)) ?? [] : [];

  function rebook(a: Appointment) {
    const state: ConsultNavState = {
      rebook: { doctorId: a.doctorId, doctorName: a.doctorName, specialization: a.specialization },
    };
    navigate("/consult", { state });
  }

  function select(a: Appointment) {
    setSelectedId(a.id);
    setSelectedDay(parseIsoDate(a.appointmentDate));
  }

  return (
    <PageShell title="My dashboard">
      <div className="mx-auto max-w-6xl px-4 py-8 lg:px-6">
        {/* Greeting */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-slate-500">{formatLongDate(today)}</p>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink">
              {greeting()}, {user?.firstName}
            </h1>
            <p className="mt-1 text-slate-600">Your appointments and consultations, all in one place.</p>
          </div>
          <Link
            to="/consult"
            state={{ fresh: true } satisfies ConsultNavState}
            className="inline-flex h-11 items-center gap-2 self-start rounded-xl bg-brand-700 px-5 text-sm font-semibold text-white shadow-sm hover:bg-brand-800 sm:self-auto"
          >
            <Plus className="size-4" aria-hidden />
            New consultation
          </Link>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          <Stat icon={CalendarClock} label="Upcoming" value={upcoming.length} tone="bg-brand-50 text-brand-700" />
          <Stat icon={History} label="Past visits" value={past.length} tone="bg-sky-50 text-sky-700" />
          <Stat icon={Stethoscope} label="Doctors seen" value={doctorsSeen} tone="bg-violet-50 text-violet-700" />
        </div>

        {error && (
          <div role="alert" className="mt-6 flex items-center justify-between gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
            <span className="flex items-center gap-2">
              <CircleAlert className="size-4" aria-hidden />
              {error}
            </span>
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          {/* Calendar */}
          <Card className="p-4 sm:p-5">
            <div className="mb-1 flex items-center justify-between">
              <SectionTitle icon={<CalendarDays className="size-3.5" aria-hidden />}>Appointment calendar</SectionTitle>
              {appointments === null && !error && <Loader2 className="size-4 animate-spin text-slate-400" aria-label="Loading" />}
            </div>

            {/* Large grid with doctor names (tablet & desktop) */}
            <div className="hidden md:block">
              <MonthCalendar
                size="large"
                label="Your appointments"
                month={month}
                onMonthChange={setMonth}
                selected={selectedDay}
                onSelect={(d) => {
                  setSelectedDay(d);
                  const list = byDay.get(isoKey(d)) ?? [];
                  setSelectedId(list.length === 1 ? list[0].id : null);
                }}
                dayLabel={(d) => {
                  const n = byDay.get(isoKey(d))?.length ?? 0;
                  return n ? `${n} appointment${n > 1 ? "s" : ""}` : undefined;
                }}
                renderExtra={(d) => {
                  const list = byDay.get(isoKey(d)) ?? [];
                  return (
                    <div className="flex min-w-0 flex-col gap-1">
                      {list.slice(0, 2).map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          tabIndex={-1}
                          onClick={() => select(a)}
                          title={`Dr. ${a.doctorName} · ${timeWithZone(a)} · ${a.clinicName}`}
                          className={clsx(
                            "w-full truncate rounded-md border px-1.5 py-0.5 text-left text-[0.6875rem] leading-tight font-medium transition-colors",
                            a.id === selectedId && "ring-2 ring-brand-400",
                            isPast(a, today) && a.status === "confirmed" ? PAST_CHIP : STATUS_STYLE[a.status].chip,
                          )}
                        >
                          <span className="block truncate">Dr. {a.doctorName}</span>
                          <span className="block opacity-75">{shortTime(a.startTime)}</span>
                        </button>
                      ))}
                      {list.length > 2 && (
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => {
                            setSelectedDay(d);
                            setSelectedId(null);
                          }}
                          className="text-left text-[0.6875rem] font-medium text-brand-700 hover:underline"
                        >
                          +{list.length - 2} more
                        </button>
                      )}
                    </div>
                  );
                }}
              />
            </div>

            {/* Compact grid + agenda (phones) */}
            <div className="md:hidden">
              <MonthCalendar
                label="Your appointments"
                month={month}
                onMonthChange={setMonth}
                selected={selectedDay}
                onSelect={(d) => {
                  setSelectedDay(d);
                  const list = byDay.get(isoKey(d)) ?? [];
                  setSelectedId(list.length === 1 ? list[0].id : null);
                }}
                dayLabel={(d) => {
                  const n = byDay.get(isoKey(d))?.length ?? 0;
                  return n ? `${n} appointment${n > 1 ? "s" : ""}` : undefined;
                }}
              />
              <p className="mt-2 text-xs text-slate-500">Dates with appointments are listed below.</p>
            </div>

            <Legend />

            <div className="mt-4 border-t border-slate-100 pt-4">
              <h3 className="mb-2 text-sm font-semibold text-ink">This month</h3>
              {monthAppointments.length === 0 ? (
                <p className="text-sm text-slate-500">No appointments this month.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {monthAppointments.map((a) => (
                    <AgendaRow key={a.id} a={a} today={today} active={a.id === selectedId} onSelect={() => select(a)} />
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {/* Side panel */}
          <div className="flex flex-col gap-6">
            {selected ? (
              <AppointmentDetails a={selected} today={today} onRebook={() => rebook(selected)} onClose={() => setSelectedId(null)} />
            ) : selectedDay && dayAppointments.length > 1 ? (
              <Card className="p-5">
                <SectionTitle>{formatLongDate(selectedDay)}</SectionTitle>
                <ul className="flex flex-col gap-2">
                  {dayAppointments.map((a) => (
                    <AgendaRow key={a.id} a={a} today={today} active={false} onSelect={() => select(a)} />
                  ))}
                </ul>
              </Card>
            ) : (
              <Card className="p-5">
                <SectionTitle icon={<CalendarClock className="size-3.5" aria-hidden />}>Next up</SectionTitle>
                {upcoming.length === 0 ? (
                  <EmptyUpcoming hasPast={past.length > 0} />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {upcoming.slice(0, 4).map((a) => (
                      <AgendaRow key={a.id} a={a} today={today} active={false} onSelect={() => select(a)} />
                    ))}
                  </ul>
                )}
                {past.length > 0 && (
                  <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                    <Repeat2 className="mr-1 inline size-3.5 text-brand-600" aria-hidden />
                    Select a past appointment on the calendar to book that doctor again.
                  </p>
                )}
              </Card>
            )}

            <Card className="p-5">
              <SectionTitle icon={<MessagesSquare className="size-3.5" aria-hidden />}>Recent consultations</SectionTitle>
              {consultations === null ? (
                <p className="text-sm text-slate-500">{error ? "—" : "Loading…"}</p>
              ) : consultations.length === 0 ? (
                <p className="text-sm text-slate-500">Your conversations with the care coordinator will appear here.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-slate-100">
                  {consultations.slice(0, 6).map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setTranscript(c)}
                        className="group flex w-full items-start gap-3 py-2.5 text-left"
                      >
                        <MessageSquareText className="mt-0.5 size-4 shrink-0 text-slate-400 group-hover:text-brand-600" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink group-hover:text-brand-800">
                            {c.title || "Consultation"}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {new Date(c.lastActivityAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} ·{" "}
                            {c.messageCount} messages
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>

      {transcript && <TranscriptDialog consultation={transcript} onClose={() => setTranscript(null)} />}
    </PageShell>
  );
}

function isoKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Stat({ icon: Icon, label, value, tone }: { icon: typeof CalendarCheck; label: string; value: number; tone: string }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className={clsx("grid size-10 shrink-0 place-items-center rounded-xl max-sm:hidden", tone)}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div>
        <p className="font-display text-2xl leading-none font-bold text-ink">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{label}</p>
      </div>
    </Card>
  );
}

function Legend() {
  const items = [
    ["Upcoming · confirmed", STATUS_STYLE.confirmed.chip],
    ["Pending", STATUS_STYLE.pending.chip],
    ["Past visit", PAST_CHIP],
    ["Not completed", STATUS_STYLE.failed.chip],
  ] as const;
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500" aria-label="Legend">
      {items.map(([label, cls]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span className={clsx("size-3 rounded border", cls)} aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  );
}

function AgendaRow({ a, today, active, onSelect }: { a: Appointment; today: Date; active: boolean; onSelect: () => void }) {
  const date = parseIsoDate(a.appointmentDate);
  const pastVisit = isPast(a, today);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={clsx(
          "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors",
          active ? "border-brand-300 bg-brand-50/60" : "border-slate-100 hover:border-brand-200 hover:bg-slate-50",
        )}
      >
        <span
          className={clsx(
            "grid w-12 shrink-0 place-items-center rounded-lg py-1 text-center",
            pastVisit ? "bg-slate-100 text-slate-600" : "bg-brand-50 text-brand-800",
          )}
        >
          <span className="text-[0.625rem] font-semibold uppercase">{date.toLocaleDateString(undefined, { month: "short" })}</span>
          <span className="font-display text-lg leading-none font-bold">{date.getDate()}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">Dr. {a.doctorName}</span>
          <span className="block truncate text-xs text-slate-500">
            {timeWithZone(a)} · {a.clinicName}
          </span>
        </span>
        <StatusBadge a={a} today={today} />
      </button>
    </li>
  );
}

function StatusBadge({ a, today }: { a: Appointment; today: Date }) {
  const pastVisit = isPast(a, today) && a.status === "confirmed";
  const style = STATUS_STYLE[a.status];
  return (
    <span
      className={clsx(
        "shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ring-1 ring-inset",
        pastVisit ? "bg-slate-100 text-slate-600 ring-slate-200" : style.badge,
      )}
    >
      {pastVisit ? "Visited" : style.label}
    </span>
  );
}

function EmptyUpcoming({ hasPast }: { hasPast: boolean }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm text-slate-500">
        {hasPast ? "No upcoming appointments." : "You haven't booked any appointments yet."}
      </p>
      <Link
        to="/consult"
        state={{ fresh: true } satisfies ConsultNavState}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-900"
      >
        Find a doctor <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

function AppointmentDetails({ a, today, onRebook, onClose }: { a: Appointment; today: Date; onRebook: () => void; onClose: () => void }) {
  const date = parseIsoDate(a.appointmentDate);
  const pastVisit = isPast(a, today);
  const zone = isValidTimeZone(a.timeZone) ? a.timeZone : undefined;
  const yours = viewerTime(a.appointmentDate, a.startTime, zone);
  return (
    <Card className="overflow-hidden animate-fade-in">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">{pastVisit ? "Past appointment" : "Appointment"}</p>
          <h2 className="mt-1 truncate font-display text-lg font-bold text-ink">Dr. {a.doctorName}</h2>
          {a.specialization && (
            <span className="mt-1 inline-block rounded-md bg-brand-50 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-brand-800">
              {a.specialization}
            </span>
          )}
        </div>
        <StatusBadge a={a} today={today} />
      </div>
      <dl className="flex flex-col gap-3 p-5 text-sm">
        <div className="flex items-start gap-2.5">
          <CalendarDays className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
          <div>
            <dt className="sr-only">Date</dt>
            <dd className="font-medium text-ink">{formatLongDate(date)}</dd>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <Clock className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
          <div>
            <dt className="sr-only">Time</dt>
            <dd className="font-medium text-ink">
              {a.startTime} – {a.endTime}
            </dd>
            {zone && (
              <dd className="text-xs text-slate-500">
                Clinic local time · {zoneLabel(zone, zonedInstant(a.appointmentDate, a.startTime, zone) ?? undefined)}
                {yours && ` · ${yours} your time`}
              </dd>
            )}
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <Building2 className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
          <div>
            <dt className="sr-only">Clinic</dt>
            <dd className="font-medium text-ink">{a.clinicName}</dd>
            {a.clinicAddress && <dd className="text-xs text-slate-500">{a.clinicAddress}</dd>}
          </div>
        </div>
        {a.calendarLink && (
          <a
            href={a.calendarLink}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-900"
          >
            <ExternalLink className="size-4" aria-hidden />
            Open in Google Calendar
          </a>
        )}
      </dl>
      <div className="flex gap-2 border-t border-slate-100 p-4">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button className="flex-1" onClick={onRebook}>
          <Repeat2 className="size-4" aria-hidden />
          {pastVisit ? `Book Dr. ${a.doctorName.split(" ")[0]} again` : "Book another visit"}
        </Button>
      </div>
    </Card>
  );
}

function TranscriptDialog({ consultation, onClose }: { consultation: ConsultationSummary; onClose: () => void }) {
  const [messages, setMessages] = useState<LogMessage[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    consultationMessages(consultation.id)
      .then((m) => !cancelled && setMessages(m))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [consultation.id]);

  const started = new Date(consultation.startedAt);
  return (
    <Modal
      size="lg"
      title={consultation.title || "Consultation"}
      subtitle={started.toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}
      onClose={onClose}
    >
      {failed ? (
        <p className="text-sm text-rose-700">We couldn't load this transcript.</p>
      ) : messages === null ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading transcript…
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {messages.map((m) =>
            m.kind === "user" ? (
              <li key={m.id} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-700 px-3.5 py-2 text-sm whitespace-pre-wrap text-white">{m.content}</p>
              </li>
            ) : m.kind === "agent" ? (
              <li key={m.id} className="max-w-[90%]">
                <p className="mb-1 text-[0.6875rem] font-semibold text-slate-500">{agentName(m.author)}</p>
                <div className="rounded-2xl rounded-tl-md bg-slate-100 px-3.5 py-2">
                  <Markdown text={m.content} />
                </div>
              </li>
            ) : m.kind === "tool_call" ? (
              <li key={m.id} className="flex items-center gap-1.5 pl-1 text-xs text-slate-400">
                <Wrench className="size-3" aria-hidden />
                {agentName(m.author)} used <code className="rounded bg-slate-100 px-1 text-slate-600">{m.toolName}</code>
              </li>
            ) : null,
          )}
        </ol>
      )}
    </Modal>
  );
}
