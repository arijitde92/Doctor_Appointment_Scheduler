import { CalendarCheck, LockKeyhole, Sparkles, Stethoscope } from "lucide-react";
import type { ReactNode } from "react";

import { SiteFooter } from "../components/layout/SiteFooter";
import { SiteHeader } from "../components/layout/SiteHeader";
import { useDocumentTitle } from "../components/layout/PageShell";

const POINTS = [
  { icon: Stethoscope, text: "Matched with the right specialist in seconds" },
  { icon: CalendarCheck, text: "Live slots and instant Google Calendar booking" },
  { icon: LockKeyhole, text: "Your consultations stay private to your account" },
];

/** Two-column auth layout: brand story on the left (desktop), form on the right. */
export function AuthLayout({ title, docTitle, subtitle, children }: { title: string; docTitle: string; subtitle: ReactNode; children: ReactNode }) {
  useDocumentTitle(docTitle);
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex flex-1 items-stretch">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:py-12 lg:grid-cols-[1fr_1.15fr] lg:px-6">
          <aside className="relative hidden overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 p-10 text-white shadow-pop lg:flex lg:flex-col lg:justify-between">
            <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-brand-500/30 blur-3xl" aria-hidden />
            <div className="pointer-events-none absolute -bottom-32 -left-20 size-80 rounded-full bg-sky-400/20 blur-3xl" aria-hidden />
            <div className="relative">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/20">
                <Sparkles className="size-3.5" aria-hidden />
                AI care coordinator
              </span>
              <p className="mt-6 font-display text-3xl leading-tight font-bold text-balance">
                Healthcare that starts with a conversation.
              </p>
              <p className="mt-3 max-w-sm text-brand-100">
                Describe what you need. We'll find the doctor, check their schedule and book it for you.
              </p>
            </div>
            <ul className="relative mt-10 flex flex-col gap-4">
              {POINTS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm text-brand-50">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </aside>

          <section className="flex items-start justify-center lg:items-center">
            <div className="w-full max-w-xl rounded-3xl border border-slate-200/80 bg-white p-6 shadow-card sm:p-8">
              <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{title}</h1>
              <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>
              <div className="mt-6">{children}</div>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
