import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { addDays, addMonths, formatLongDate, formatMonth, monthMatrix, sameDay, startOfDay, WEEK_HEADER } from "../lib/calendar";

export interface DayMeta {
  inMonth: boolean;
  today: boolean;
  selected: boolean;
  disabled: boolean;
}

/**
 * Month grid shared by the booking date picker (compact) and the dashboard
 * (large, with appointment chips under each date). Arrow keys move between
 * days (crossing months), Home/End jump within the week, PageUp/PageDown
 * change month.
 */
export function MonthCalendar({
  month,
  onMonthChange,
  selected,
  onSelect,
  isDisabled,
  dayLabel,
  renderExtra,
  minMonth,
  maxMonth,
  size = "compact",
  label = "Calendar",
}: {
  month: Date;
  onMonthChange: (month: Date) => void;
  selected?: Date | null;
  onSelect?: (date: Date) => void;
  isDisabled?: (date: Date) => boolean;
  /** Extra screen-reader text for a day, e.g. "2 appointments". */
  dayLabel?: (date: Date) => string | undefined;
  /** Content under the date number (large size). */
  renderExtra?: (date: Date, meta: DayMeta) => ReactNode;
  minMonth?: Date;
  maxMonth?: Date;
  size?: "compact" | "large";
  label?: string;
}) {
  const weeks = useMemo(() => monthMatrix(month), [month]);
  const today = startOfDay(new Date());
  const [focusDate, setFocusDate] = useState<Date>(() => selected ?? (sameMonth(today, month) ? today : month));
  const gridRef = useRef<HTMLDivElement>(null);
  const shouldFocus = useRef(false);

  // Keep the roving focus target inside the visible month.
  useEffect(() => {
    if (!sameMonth(focusDate, month)) setFocusDate(selected && sameMonth(selected, month) ? selected : new Date(month.getFullYear(), month.getMonth(), 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${key(focusDate)}"]`)?.focus();
  }, [focusDate]);

  const canPrev = !minMonth || addMonths(month, -1) >= new Date(minMonth.getFullYear(), minMonth.getMonth(), 1);
  const canNext = !maxMonth || addMonths(month, 1) <= new Date(maxMonth.getFullYear(), maxMonth.getMonth(), 1);

  function move(target: Date) {
    const targetMonth = new Date(target.getFullYear(), target.getMonth(), 1);
    if (minMonth && targetMonth < new Date(minMonth.getFullYear(), minMonth.getMonth(), 1)) return;
    if (maxMonth && targetMonth > new Date(maxMonth.getFullYear(), maxMonth.getMonth(), 1)) return;
    shouldFocus.current = true;
    if (!sameMonth(target, month)) onMonthChange(targetMonth);
    setFocusDate(target);
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, date: Date) {
    const deltas: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in deltas) {
      e.preventDefault();
      move(addDays(date, deltas[e.key]));
    } else if (e.key === "Home") {
      e.preventDefault();
      move(addDays(date, -((date.getDay() + 6) % 7)));
    } else if (e.key === "End") {
      e.preventDefault();
      move(addDays(date, 6 - ((date.getDay() + 6) % 7)));
    } else if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      const d = new Date(date.getFullYear(), date.getMonth() + (e.key === "PageUp" ? -1 : 1), 1);
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      move(new Date(d.getFullYear(), d.getMonth(), Math.min(date.getDate(), last)));
    }
  }

  const large = size === "large";

  return (
    <div className="select-none">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-display text-base font-bold text-ink" aria-live="polite">
          {formatMonth(month)}
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMonthChange(addMonths(month, -1))}
            disabled={!canPrev}
            className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(addMonths(month, 1))}
            disabled={!canNext}
            className="grid size-9 place-items-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next month"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div ref={gridRef} role="grid" aria-label={`${label}, ${formatMonth(month)}`}>
        <div role="row" className="grid grid-cols-7 gap-1 pb-1">
          {WEEK_HEADER.map((d) => (
            <div key={d} role="columnheader" className="py-1 text-center text-[0.6875rem] font-semibold tracking-wider text-slate-400 uppercase">
              {large ? d : d.slice(0, 2)}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div role="row" key={key(week[0])} className="grid grid-cols-7 gap-1">
            {week.map((date) => {
              const meta: DayMeta = {
                inMonth: sameMonth(date, month),
                today: sameDay(date, today),
                selected: !!selected && sameDay(date, selected),
                disabled: !!isDisabled?.(date),
              };
              const extra = dayLabel?.(date);
              const button = (
                <button
                  type="button"
                  data-date={key(date)}
                  tabIndex={sameDay(date, focusDate) ? 0 : -1}
                  aria-selected={meta.selected}
                  aria-disabled={meta.disabled || undefined}
                  aria-current={meta.today ? "date" : undefined}
                  aria-label={`${formatLongDate(date)}${meta.today ? ", today" : ""}${extra ? `, ${extra}` : ""}${meta.disabled ? ", unavailable" : ""}`}
                  onClick={() => {
                    setFocusDate(date);
                    if (!meta.disabled) onSelect?.(date);
                  }}
                  onKeyDown={(e) => onKeyDown(e, date)}
                  className={clsx(
                    "relative grid place-items-center rounded-xl font-medium transition-colors",
                    large ? "size-7 text-xs" : "aspect-square w-full text-sm",
                    !meta.inMonth && "text-slate-300",
                    meta.inMonth && !meta.disabled && !meta.selected && "text-ink hover:bg-brand-50 hover:text-brand-800",
                    meta.disabled && meta.inMonth && "cursor-not-allowed text-slate-300 line-through decoration-slate-300",
                    meta.disabled && "cursor-not-allowed",
                    meta.selected && "bg-brand-700 text-white shadow-sm hover:bg-brand-800",
                    meta.today && !meta.selected && "ring-2 ring-brand-200 ring-inset font-bold text-brand-800",
                  )}
                >
                  {date.getDate()}
                </button>
              );
              return (
                <div
                  role="gridcell"
                  key={key(date)}
                  className={clsx(
                    large &&
                      "flex min-h-24 flex-col gap-1 rounded-xl border p-1.5 transition-colors",
                    large && (meta.inMonth ? "border-slate-100 bg-white" : "border-transparent bg-slate-50/60"),
                    large && meta.selected && "border-brand-300 bg-brand-50/40",
                  )}
                >
                  {button}
                  {large && renderExtra?.(date, meta)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function key(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}
