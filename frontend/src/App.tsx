import clsx from "clsx";
import { ClipboardList, LayoutList, MessagesSquare, X } from "lucide-react";
import { useCallback, useEffect, useState, type ComponentType } from "react";

import { BookingDialog, type SlotSelection } from "./components/BookingDialog";
import { ChatPanel } from "./components/ChatPanel";
import { Header } from "./components/Header";
import { IntakePanel } from "./components/IntakePanel";
import { ResultsPanel } from "./components/ResultsPanel";
import { useConversation } from "./hooks/useConversation";

type Tab = "intake" | "chat" | "results";

export default function App() {
  const { state, busy, restoring, send, reset, stop } = useConversation();
  const [tab, setTab] = useState<Tab>("chat");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selection, setSelection] = useState<SlotSelection | null>(null);
  const [seenVersion, setSeenVersion] = useState(0);

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
    setSelection(null);
    setSeenVersion(0);
    setTab("chat");
  }, [reset]);

  const unseen = state.resultsVersion > seenVersion && tab !== "results";

  return (
    <div className="flex h-dvh flex-col">
      <Header onNewConsultation={newConsultation} onOpenIntake={() => setDrawerOpen(true)} />

      <main className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 gap-4 p-3 sm:p-4 lg:p-5">
        <aside
          aria-label="Find a doctor"
          className={clsx(
            "panel-scroll min-h-0 w-full flex-col overflow-y-auto xl:w-80 xl:shrink-0",
            tab === "intake" ? "flex" : "hidden",
            "lg:hidden xl:flex",
          )}
        >
          <IntakePanel busy={busy} onSubmit={ask} />
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
          onSelectSlot={setSelection}
          className={clsx("w-full lg:w-[380px] lg:shrink-0 xl:w-[400px]", tab === "results" ? "flex" : "hidden", "lg:flex")}
        />
      </main>

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
            <IntakePanel busy={busy} onSubmit={ask} />
          </div>
        </div>
      )}

      {selection && (
        <BookingDialog
          selection={selection}
          doctor={state.doctors[selection.availability.doctorId]}
          clinic={state.clinics[selection.availability.clinicId]}
          onClose={() => setSelection(null)}
          onConfirm={(prompt) => {
            setSelection(null);
            ask(prompt);
          }}
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
