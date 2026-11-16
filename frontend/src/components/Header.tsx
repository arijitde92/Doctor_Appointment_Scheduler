import { HeartPulse, RotateCcw, Search, Sparkles } from "lucide-react";

import { BRAND_NAME, BRAND_TAGLINE } from "../config/catalog";
import { Button } from "./ui";

export function Header({ onNewConsultation, onOpenIntake }: { onNewConsultation: () => void; onOpenIntake: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-3 px-4 lg:px-6">
        <a href="/" className="flex min-w-0 items-center gap-3" aria-label={`${BRAND_NAME} home`}>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-sm">
            <HeartPulse className="size-5" strokeWidth={2.25} aria-hidden />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block font-display text-lg font-bold tracking-tight text-ink">{BRAND_NAME}</span>
            <span className="block truncate text-xs text-slate-500">{BRAND_TAGLINE}</span>
          </span>
        </a>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 md:inline-flex">
            <Sparkles className="size-3.5 text-brand-600" aria-hidden />
            Powered by Gemini on Google Cloud
          </span>
          <Button variant="secondary" className="max-lg:hidden xl:hidden" onClick={onOpenIntake}>
            <Search className="size-4" aria-hidden />
            Find a doctor
          </Button>
          <Button variant="primary" onClick={onNewConsultation}>
            <RotateCcw className="size-4" aria-hidden />
            <span className="hidden sm:inline">New consultation</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
