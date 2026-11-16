import clsx from "clsx";
import { CheckCircle2, ChevronDown, CircleAlert, Loader2, Workflow } from "lucide-react";
import { useEffect, useState } from "react";

import { agentName } from "../config/catalog";
import type { Activity } from "../lib/types";
import { SourceChip } from "./ui";

/** Collapsible list of what the agents did during a turn (tool calls, hand-offs). */
export function ActivityTimeline({ activities, running }: { activities: Activity[]; running: boolean }) {
  const [open, setOpen] = useState(running);
  useEffect(() => {
    setOpen(running);
  }, [running]);

  if (!activities.length) return null;
  const current = [...activities].reverse().find((a) => a.status === "running") ?? activities[activities.length - 1];
  const steps = activities.filter((a) => a.name !== "transfer_to_agent").length;

  return (
    <div className="ml-11 max-w-[min(100%,36rem)] animate-fade-in">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-left text-[0.8125rem] text-slate-600 transition-colors hover:bg-slate-100"
      >
        {running ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-brand-600" aria-hidden />
        ) : (
          <Workflow className="size-4 shrink-0 text-brand-600" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate">
          {running ? (
            <>
              <span className="font-medium text-ink">{current.label}</span>
              <span className="text-slate-400"> · {agentName(current.author)}</span>
            </>
          ) : (
            <>
              <span className="font-medium text-ink">
                {steps} {steps === 1 ? "step" : "steps"}
              </span>{" "}
              completed by the care team
            </>
          )}
        </span>
        <ChevronDown className={clsx("size-4 shrink-0 text-slate-400 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <ol className="mt-2 flex flex-col gap-1.5 border-l-2 border-slate-200 pl-4" aria-label="Agent activity">
          {activities.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-[0.8125rem]">
              {a.status === "running" && <Loader2 className="size-3.5 shrink-0 animate-spin text-brand-600" aria-label="In progress" />}
              {a.status === "done" && <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" aria-label="Done" />}
              {a.status === "error" && <CircleAlert className="size-3.5 shrink-0 text-rose-600" aria-label="Failed" />}
              <span className={clsx("min-w-0 flex-1 truncate", a.status === "running" ? "text-ink" : "text-slate-600")}>
                {a.label}
              </span>
              {a.source && <SourceChip source={a.source} />}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
