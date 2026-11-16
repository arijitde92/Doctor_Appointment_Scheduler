import { ArrowUpRight, CalendarCheck, MapPin, Star, Stethoscope } from "lucide-react";

const FEATURES = [
  { icon: Stethoscope, title: "Match specialists", text: "Doctors by speciality and city from verified clinic data.", tone: "bg-sky-50 text-sky-700" },
  { icon: MapPin, title: "Compare clinics", text: "Distance and travel time from where you are.", tone: "bg-emerald-50 text-emerald-700" },
  { icon: Star, title: "Read patient reviews", text: "Summaries of what patients say about each doctor.", tone: "bg-violet-50 text-violet-700" },
  { icon: CalendarCheck, title: "Book instantly", text: "Your appointment is added to Google Calendar.", tone: "bg-amber-50 text-amber-700" },
];

const SUGGESTIONS = [
  "Find a cardiologist in Kolkata",
  "I need a paediatrician for my child in Kolkata",
  "Which neurologists in Kolkata are available on Saturday?",
  "How does booking an appointment work?",
];

export function Welcome({ onSuggestion, disabled }: { onSuggestion: (text: string) => void; disabled: boolean }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-1 py-6 text-center animate-fade-in sm:py-10">
      <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800 ring-1 ring-brand-100">
        <span className="size-1.5 rounded-full bg-brand-500" aria-hidden />
        Your AI care coordinator
      </span>
      <h1 className="font-display text-2xl font-bold tracking-tight text-balance text-ink sm:text-3xl">
        Find the right doctor and book in minutes
      </h1>
      <p className="mt-3 max-w-lg text-[0.9375rem] text-balance text-slate-500">
        Describe what you need. We'll shortlist specialists, compare clinics and reviews, check open slots and book your
        appointment, all in one conversation.
      </p>

      <div className="mt-8 grid w-full grid-cols-1 gap-3 text-left sm:grid-cols-2">
        {FEATURES.map(({ icon: Icon, title, text, tone }) => (
          <div key={title} className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
            <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${tone}`}>
              <Icon className="size-[1.125rem]" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">{title}</p>
              <p className="mt-0.5 text-[0.8125rem] text-slate-500">{text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 w-full">
        <p className="mb-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">Try asking</p>
        <div className="flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => onSuggestion(s)}
              className="group inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[0.8125rem] font-medium text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 disabled:opacity-50"
            >
              {s}
              <ArrowUpRight className="size-3.5 text-slate-400 group-hover:text-brand-600" aria-hidden />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
