import { ArrowUp, Square } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { EMERGENCY_NUMBER } from "../config/catalog";

const MAX_CHARS = 4000;

export function Composer({ busy, onSend, onStop }: { busy: boolean; onSend: (text: string) => void; onStop: () => void }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea up to ~6 lines.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  function submit() {
    const value = text.trim();
    if (!value || busy) return;
    onSend(value);
    setText("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t border-slate-100 bg-white px-3 pt-3 pb-2 sm:px-4">
      <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-1.5 pl-3 transition focus-within:border-brand-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-brand-100">
        <label htmlFor="composer" className="sr-only">
          Message the care coordinator
        </label>
        <textarea
          id="composer"
          ref={ref}
          rows={1}
          value={text}
          maxLength={MAX_CHARS}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Describe your symptoms or the doctor you need…"
          className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 text-[0.9375rem] text-ink placeholder:text-slate-400 focus:outline-none"
        />
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-800 text-white transition-colors hover:bg-slate-900"
            aria-label="Stop response"
          >
            <Square className="size-3.5 fill-current" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim()}
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-700 text-white transition-colors hover:bg-brand-800 disabled:bg-slate-200 disabled:text-slate-400"
            aria-label="Send message"
          >
            <ArrowUp className="size-4" strokeWidth={2.5} aria-hidden />
          </button>
        )}
      </div>
      <p className="mt-2 px-1 text-center text-[0.6875rem] leading-snug text-slate-400">
        Not for medical emergencies. Call <strong className="font-semibold text-slate-500">{EMERGENCY_NUMBER}</strong>. AI
        responses can be wrong, so confirm important details with the clinic.
      </p>
    </div>
  );
}
