import clsx from "clsx";
import { ClipboardList, LayoutList, MessagesSquare, RotateCcw, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { useLocation, useNavigate } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { ChatPanel } from "../components/ChatPanel";
import { IntakePanel } from "../components/IntakePanel";
import { ResultsPanel } from "../components/ResultsPanel";
import { clinicAddress, DatePickerDialog, type BookingTarget } from "../components/booking/DatePickerDialog";
import { SlotPickerDialog } from "../components/booking/SlotPickerDialog";
import { useDocumentTitle } from "../components/layout/PageShell";
import { SiteFooter } from "../components/layout/SiteFooter";
import { SiteHeader } from "../components/layout/SiteHeader";
import { Button } from "../components/ui";
import { SLOT_TIMES } from "../config/catalog";
import { useConversation } from "../hooks/useConversation";
import { createAppointment, updateAppointment } from "../lib/api";
import { weekdayName } from "../lib/calendar";
import { toIsoDate } from "../lib/dates";
import { availabilityPrompt, bookingPrompt, rebookPrompt, stripDr } from "../lib/prompts";
import { clinicTimeZone } from "../lib/timezones";
import type { RebookRequest, User } from "../lib/types";

type Tab = "intake" | "chat" | "results";

type BookingFlow =
  | { step: "date"; target: BookingTarget; date?: Date }
  | { step: "slot"; target: BookingTarget; date: Date };

export interface ConsultNavState {
  /** Rebook a doctor from the dashboard. */
  rebook?: RebookRequest;
  /** Start a new, empty consultation. */
  fresh?: boolean;
}

export default function ConsultPage() {
  const { user } = useAuth();
  // <RequireAuth> guarantees a user; keying by id resets everything on account switch.
  return user ? <Consultation key={user.id} user={user} /> : null;
}

function Consultation({ user }: { user: User }) {
  useDocumentTitle("Consultation");
  const { state, busy, restoring, send, reset, stop, seedDoctor, currentSessionId } = useConversation(user.id);
  const [tab, setTab] = useState<Tab>("chat");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [flow, setFlow] = useState<BookingFlow | null>(null);
  const [seenVersion, setSeenVersion] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (tab === "results") setSeenVersion(state.resultsVersion);
  }, [tab, state.resultsVersion]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  /** Send a message and bring the conversation into view on small screens. */
  const ask = useCallback(
    (text: string) => {
      setTab("chat");
      setDrawerOpen(false);
      void send(text);
    },
    [send],
  );

  const newConsultation = useCallback(() => {
    reset();
    setFlow(null);
    setSeenVersion(0);
    setTab("chat");
  }, [reset]);

  // ── Arriving from the dashboard: new consultation or rebook a doctor ─────
  const navState = location.state as ConsultNavState | null;
  const handledNav = useRef(false);
  useEffect(() => {
    if (restoring || handledNav.current || !navState || (!navState.rebook && !navState.fresh)) return;
    handledNav.current = true;
    // Drop the state so a refresh doesn't start another consultation.
    navigate(location.pathname, { replace: true, state: null });
    newConsultation();
    const rebook = navState.rebook;
    if (rebook) {
      seedDoctor({ id: rebook.doctorId, name: rebook.doctorName, specialization: rebook.specialization ?? undefined });
      void send(rebookPrompt({ id: rebook.doctorId, name: rebook.doctorName, specialization: rebook.specialization }));
    }
  }, [restoring, navState, navigate, location.pathname, newConsultation, seedDoctor, send]);

  // ── Keep stored appointments in step with the scheduler's outcome ────────
  const synced = useRef(new Set<string>());
  useEffect(() => {
    for (const b of state.bookings) {
      if (!b.appointmentId || b.status === "pending") continue;
      const key = `${b.appointmentId}:${b.status}`;
      if (synced.current.has(key)) continue;
      synced.current.add(key);
      updateAppointment(b.appointmentId, { status: b.status, calendarLink: b.eventLink }).catch((err) =>
        console.warn("Could not update appointment status", err),
      );
    }
  }, [state.bookings]);

  // ── Booking flow: calendar -> time slot pop-up -> booking request ────────
  async function confirmBooking(target: BookingTarget, date: Date, slotIndex: number) {
    const { doctor, clinic } = target;
    const time = SLOT_TIMES[slotIndex];
    const address = clinicAddress(clinic);
    const iso = toIsoDate(date);
    const timeZone = clinicTimeZone(clinic);
    const appointment = await createAppointment({
      consultationId: currentSessionId(),
      doctorId: doctor.id,
      doctorName: stripDr(doctor.name),
      specialization: doctor.specialization ?? null,
      clinicId: clinic.id,
      clinicName: clinic.name,
      clinicAddress: address ?? null,
      appointmentDate: iso,
      slotIndex,
      startTime: time.start,
      endTime: time.end,
      timeZone: timeZone ?? null,
    });
    setFlow(null);
    ask(
      bookingPrompt({
        doctor: stripDr(doctor.name),
        specialization: doctor.specialization,
        clinic: clinic.name,
        address,
        date: iso,
        time: time.start,
        timeZone,
        reference: appointment.id,
      }),
    );
  }

  const unseen = state.resultsVersion > seenVersion && tab !== "results";
  const flowAvailability =
    flow?.step === "slot"
      ? state.availability.find(
          (a) =>
            a.doctorId === flow.target.doctor.id &&
            a.clinicId === flow.target.clinic.id &&
            a.day.toLowerCase() === weekdayName(flow.date).toLowerCase(),
        )
      : undefined;

  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader wide>
        <Button variant="secondary" className="max-lg:hidden xl:hidden" onClick={() => setDrawerOpen(true)}>
          <Search className="size-4" aria-hidden />
          Find a doctor
        </Button>
        <Button variant="primary" onClick={newConsultation}>
          <RotateCcw className="size-4" aria-hidden />
          <span className="hidden sm:inline">New consultation</span>
          <span className="sm:hidden">New</span>
        </Button>
      </SiteHeader>

      <main id="main" className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 gap-4 p-3 sm:p-4 lg:p-5">
        <aside
          aria-label="Find a doctor"
          className={clsx(
            "panel-scroll min-h-0 w-full flex-col overflow-y-auto xl:w-80 xl:shrink-0",
            tab === "intake" ? "flex" : "hidden",
            "lg:hidden xl:flex",
          )}
        >
          <IntakePanel busy={busy} onSubmit={ask} defaultLocation={user.address} />
        </aside>

        <ChatPanel
          turns={state.turns}
          busy={busy}
          restoring={restoring}
          onSend={ask}
          onStop={stop}
          className={clsx("min-w-0 flex-1", tab === "chat" ? "flex" : "hidden", "lg:flex")}
        />

        <ResultsPanel
          state={state}
          busy={busy}
          onAsk={ask}
          onBook={(target) => setFlow({ step: "date", target })}
          className={clsx("w-full lg:w-[380px] lg:shrink-0 xl:w-[400px]", tab === "results" ? "flex" : "hidden", "lg:flex")}
        />
      </main>

      <SiteFooter compact />

      {/* Mobile / tablet tab bar */}
      <nav
        aria-label="Sections"
        className="grid grid-cols-3 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <TabButton icon={ClipboardList} label="Find" active={tab === "intake"} onClick={() => setTab("intake")} />
        <TabButton icon={MessagesSquare} label="Chat" active={tab === "chat"} onClick={() => setTab("chat")} busy={busy && tab !== "chat"} />
        <TabButton icon={LayoutList} label="Results" active={tab === "results"} onClick={() => setTab("results")} badge={unseen} />
      </nav>

      {/* Laptop-width drawer for the intake form */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 hidden bg-ink/30 backdrop-blur-[2px] lg:block xl:hidden" onMouseDown={() => setDrawerOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Find a doctor"
            onMouseDown={(e) => e.stopPropagation()}
            className="panel-scroll absolute inset-y-0 left-0 w-[360px] overflow-y-auto bg-canvas p-4 shadow-pop animate-fade-in"
          >
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-ink"
                aria-label="Close"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <IntakePanel busy={busy} onSubmit={ask} defaultLocation={user.address} />
          </div>
        </div>
      )}

      {flow?.step === "date" && (
        <DatePickerDialog
          target={flow.target}
          initialDate={flow.date}
          onClose={() => setFlow(null)}
          onPick={(date) => setFlow({ step: "slot", target: flow.target, date })}
        />
      )}

      {flow?.step === "slot" && (
        <SlotPickerDialog
          key={`${flow.target.doctor.id}-${flow.target.clinic.id}-${toIsoDate(flow.date)}`}
          target={flow.target}
          date={flow.date}
          availability={flowAvailability}
          busy={busy}
          onRequestAvailability={() => send(availabilityPrompt(flow.target.doctor, flow.target.clinic, weekdayName(flow.date)))}
          onChangeDate={() => setFlow({ step: "date", target: flow.target, date: flow.date })}
          onClose={() => setFlow(null)}
          onConfirm={(slotIndex) => confirmBooking(flow.target, flow.date, slotIndex)}
        />
      )}
    </div>
  );
}

function TabButton({
  icon: Icon,
  label,
  active,
  onClick,
  badge,
  busy,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
        active ? "text-brand-700" : "text-slate-500 hover:text-ink",
      )}
    >
      {active && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-brand-600" aria-hidden />}
      <span className="relative">
        <Icon className="size-5" />
        {badge && <span className="absolute -top-1 -right-1.5 size-2.5 rounded-full bg-rose-500 ring-2 ring-white" aria-label="New results" />}
        {busy && <span className="absolute -top-1 -right-1.5 size-2.5 animate-pulse rounded-full bg-brand-500 ring-2 ring-white" aria-hidden />}
      </span>
      {label}
    </button>
  );
}
