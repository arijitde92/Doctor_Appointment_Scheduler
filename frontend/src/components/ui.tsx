/** Small shared UI primitives. */
import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "subtle";
type Size = "sm" | "md";

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type="button"
      {...props}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-[0.8125rem]" : "h-10 px-4 text-sm",
        variant === "primary" && "bg-brand-700 text-white shadow-sm hover:bg-brand-800 active:bg-brand-900",
        variant === "secondary" &&
          "border border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100 hover:text-ink",
        variant === "subtle" && "bg-brand-50 text-brand-800 hover:bg-brand-100",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={clsx("rounded-2xl border border-slate-200/80 bg-white shadow-card", className)}>{children}</div>
  );
}

const SOURCE_STYLES: Record<string, string> = {
  "Cloud SQL": "bg-sky-50 text-sky-700 ring-sky-200",
  "Google Maps": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Vertex AI RAG": "bg-violet-50 text-violet-700 ring-violet-200",
  "Google Calendar": "bg-amber-50 text-amber-800 ring-amber-200",
};

export function SourceChip({ source }: { source: string }) {
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-medium ring-1 ring-inset",
        SOURCE_STYLES[source] ?? "bg-slate-50 text-slate-600 ring-slate-200",
      )}
    >
      {source}
    </span>
  );
}

export function SectionTitle({ icon, children, aside }: { icon?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-500 uppercase">
        {icon}
        {children}
      </h3>
      {aside}
    </div>
  );
}

export function initials(name: string): string {
  return name
    .replace(/^dr\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
