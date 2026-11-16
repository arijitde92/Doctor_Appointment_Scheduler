import clsx from "clsx";
import { CalendarCheck, CircleAlert, HeartPulse, Loader2, MessageSquareQuote, RotateCw, Stethoscope } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, type ComponentType } from "react";

import { agentName } from "../config/catalog";
import type { Turn } from "../lib/types";
import { ActivityTimeline } from "./ActivityTimeline";
import { Composer } from "./Composer";
import { Markdown } from "./Markdown";
import { Card } from "./ui";
import { Welcome } from "./Welcome";

const AGENT_AVATARS: Record<string, { icon: ComponentType<{ className?: string }>; tone: string }> = {
  root_agent: { icon: HeartPulse, tone: "bg-brand-700 text-white" },
  doctor_matcher: { icon: Stethoscope, tone: "bg-sky-600 text-white" },
  doctor_rag_agent: { icon: MessageSquareQuote, tone: "bg-violet-600 text-white" },
  scheduler_agent: { icon: CalendarCheck, tone: "bg-amber-500 text-white" },
};

function AgentAvatar({ author }: { author: string }) {
  const { icon: Icon, tone } = AGENT_AVATARS[author] ?? AGENT_AVATARS.root_agent;
  return (
    <span className={clsx("grid size-8 shrink-0 place-items-center rounded-full shadow-sm", tone)} aria-hidden>
      <Icon className="size-4" />
    </span>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-3 animate-fade-in">
      <AgentAvatar author="root_agent" />
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-slate-100 px-4 py-3" aria-label="Assistant is typing">
        {[0, 150, 300].map((delay) => (
          <span key={delay} className="size-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${delay}ms` }} />
        ))}
      </div>
    </div>
  );
}

function TurnView({ turn, onRetry, canRetry }: { turn: Turn; onRetry: (text: string) => void; canRetry: boolean }) {
  const running = turn.status === "running";
  const showTyping = running && !turn.replies.some((r) => r.partial);
  return (
    <div className="flex flex-col gap-4">
      {turn.userText && (
        <div className="flex justify-end animate-fade-in">
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-700 px-4 py-2.5 text-[0.9375rem] leading-relaxed whitespace-pre-wrap text-white shadow-sm sm:max-w-[75%]">
            {turn.userText}
          </div>
        </div>
      )}

      <ActivityTimeline activities={turn.activities} running={running} />

      {turn.replies.map((reply) => (
        <div key={reply.id} className="flex items-start gap-3 animate-fade-in">
          <AgentAvatar author={reply.author} />
          <div className="min-w-0 max-w-[calc(100%-2.75rem)] flex-1 sm:max-w-[85%] sm:flex-none">
            <p className="mb-1 text-xs font-medium text-slate-500">{agentName(reply.author)}</p>
            <div className="rounded-2xl rounded-tl-md border border-slate-200/80 bg-white px-4 py-3 shadow-card">
              <Markdown text={reply.text} />
            </div>
          </div>
        </div>
      ))}

      {showTyping && <TypingIndicator />}

      {turn.status === "error" && (
        <div role="alert" className="ml-11 flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">{turn.error ?? "Something went wrong."}</span>
          {canRetry && turn.userText && (
            <button
              type="button"
              onClick={() => onRetry(turn.userText)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100"
            >
              <RotateCw className="size-3.5" aria-hidden />
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ChatPanel({
  turns,
  busy,
  restoring,
  onSend,
  onStop,
  className,
}: {
  turns: Turn[];
  busy: boolean;
  restoring: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [turns]);

  const send = (text: string) => {
    stickToBottom.current = true;
    onSend(text);
  };

  return (
    <Card className={clsx("flex min-h-0 flex-col overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div>
          <h2 className="font-display text-[0.9375rem] font-bold text-ink">Consultation</h2>
          <p className="text-xs text-slate-500">Care Coordinator with specialist assistants</p>
        </div>
        <span
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            busy ? "bg-brand-50 text-brand-800" : "bg-emerald-50 text-emerald-700",
          )}
          aria-live="polite"
        >
          <span className={clsx("size-1.5 rounded-full", busy ? "animate-pulse bg-brand-500" : "bg-emerald-500")} aria-hidden />
          {busy ? "Working on it…" : "Online"}
        </span>
      </div>

      <div ref={scrollRef} className="panel-scroll min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-5" aria-live="polite" aria-busy={busy}>
        {restoring ? (
          <div className="grid h-full place-items-center text-sm text-slate-500">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-brand-600" aria-hidden />
              Restoring your consultation…
            </span>
          </div>
        ) : turns.length === 0 ? (
          <Welcome onSuggestion={send} disabled={busy} />
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
            {turns.map((turn, i) => (
              <TurnView key={turn.id} turn={turn} onRetry={send} canRetry={!busy && i === turns.length - 1} />
            ))}
          </div>
        )}
      </div>

      <Composer busy={busy} onSend={send} onStop={onStop} />
    </Card>
  );
}
