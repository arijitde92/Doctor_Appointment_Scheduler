import clsx from "clsx";
import { CalendarCheck, ClipboardList, Loader2, LocateFixed, MapPin, Search, ShieldCheck, Star, Stethoscope } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import { CITIES, DAYS, SPECIALIZATIONS, type Day } from "../config/catalog";
import { intakePrompt } from "../lib/prompts";
import { Button, Card } from "./ui";

const STEPS = [
  { icon: Search, title: "Match", text: "Specialists by speciality and city" },
  { icon: MapPin, title: "Compare", text: "Clinics, distance and travel time" },
  { icon: Star, title: "Review", text: "What patients say about each doctor" },
  { icon: CalendarCheck, title: "Book", text: "Confirmed on Google Calendar" },
];

const fieldClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-ink shadow-xs transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none";

export function IntakePanel({
  busy,
  onSubmit,
  defaultLocation,
}: {
  busy: boolean;
  onSubmit: (prompt: string) => void;
  /** Pre-filled from the patient's saved address; they can edit or clear it. */
  defaultLocation?: string;
}) {
  const id = useId();
  const [specialization, setSpecialization] = useState("");
  const [city, setCity] = useState<string>(CITIES[0]);
  const [location, setLocation] = useState(defaultLocation ?? "");
  // Selected weekdays, kept in week order. All seven selected = "Any".
  const [days, setDays] = useState<Day[]>([...DAYS]);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(
    defaultLocation ? "Using the address from your profile. Edit or clear it if you prefer." : null,
  );

  const canSubmit = !!specialization && !!city.trim() && !busy;
  const anyDay = days.length === DAYS.length;

  /** "Any" selects every day; pressing it again clears the selection. */
  function toggleAny() {
    setDays(anyDay ? [] : [...DAYS]);
  }

  function toggleDay(d: Day) {
    setDays((prev) => DAYS.filter((x) => (x === d ? !prev.includes(d) : prev.includes(x))));
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setLocationNote("Location isn't available in this browser — type an area or landmark instead.");
      return;
    }
    setLocating(true);
    setLocationNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
        setLocationNote("Using your current coordinates.");
        setLocating(false);
      },
      () => {
        setLocationNote("We couldn't get your location. You can type an area or landmark instead.");
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(intakePrompt({ specialization, city: city.trim(), location, preferredDays: days }));
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <div className="mb-5 flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
            <ClipboardList className="size-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-base font-bold text-ink">Find a doctor</h2>
            <p className="mt-0.5 text-sm text-slate-500">Tell us what you need and we'll match you with the right specialist.</p>
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <label htmlFor={`${id}-spec`} className="mb-1.5 block text-sm font-medium text-slate-700">
              Speciality <span className="text-rose-600">*</span>
            </label>
            <div className="relative">
              <Stethoscope className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <select
                id={`${id}-spec`}
                required
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
                className={clsx(fieldClass, "h-10 appearance-none pl-9", !specialization && "text-slate-400")}
              >
                <option value="" disabled>
                  Select a speciality
                </option>
                {SPECIALIZATIONS.map((s) => (
                  <option key={s} value={s} className="text-ink">
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor={`${id}-city`} className="mb-1.5 block text-sm font-medium text-slate-700">
              City <span className="text-rose-600">*</span>
            </label>
            <input
              id={`${id}-city`}
              list={`${id}-cities`}
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={clsx(fieldClass, "h-10")}
              autoComplete="address-level2"
            />
            <datalist id={`${id}-cities`}>
              {CITIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div>
            <label htmlFor={`${id}-loc`} className="mb-1.5 flex items-center justify-between text-sm font-medium text-slate-700">
              Your location
              <span className="text-xs font-normal text-slate-400">Optional</span>
            </label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                id={`${id}-loc`}
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value);
                  setLocationNote(null);
                }}
                placeholder="Area, landmark or address"
                className={clsx(fieldClass, "h-10 pl-9")}
                autoComplete="street-address"
              />
            </div>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg text-[0.8125rem] font-medium text-brand-700 hover:text-brand-900 disabled:opacity-60"
            >
              {locating ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <LocateFixed className="size-3.5" aria-hidden />}
              Use my current location
            </button>
            <p className="mt-1 text-xs text-slate-500" aria-live="polite">
              {locationNote ?? "Only used to estimate distance and travel time to clinics."}
            </p>
          </div>

          <fieldset>
            <legend className="mb-1.5 flex w-full items-center justify-between text-sm font-medium text-slate-700">
              Preferred days
              <span className="text-xs font-normal text-slate-400">Select one or more</span>
            </legend>
            <div className="flex flex-wrap gap-1.5">
              <DayChip label="Any" title="Any day" pressed={anyDay} onClick={toggleAny} />
              {DAYS.map((d) => (
                <DayChip key={d} label={d.slice(0, 3)} title={d} pressed={days.includes(d)} onClick={() => toggleDay(d)} />
              ))}
            </div>
          </fieldset>

          <Button type="submit" disabled={!canSubmit} className="mt-1 h-11 w-full">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
            Find doctors
          </Button>
        </form>
      </Card>

      <Card className="p-5">
        <h3 className="mb-3 text-xs font-semibold tracking-wider text-slate-500 uppercase">How it works</h3>
        <ol className="flex flex-col gap-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="flex items-start gap-3">
              <span className="relative grid size-8 shrink-0 place-items-center rounded-lg bg-slate-50 text-brand-700 ring-1 ring-slate-200">
                <Icon className="size-4" aria-hidden />
                <span className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-brand-700 text-[0.625rem] font-bold text-white">
                  {i + 1}
                </span>
              </span>
              <div className="text-sm">
                <p className="font-medium text-ink">{title}</p>
                <p className="text-slate-500">{text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
          <ShieldCheck className="mt-px size-4 shrink-0 text-brand-600" aria-hidden />
          Your consultations are private to your account. You'll find your appointments on your dashboard.
        </p>
      </Card>
    </div>
  );
}

function DayChip({ label, title, pressed, onClick }: { label: string; title: string; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={title}
      title={title}
      onClick={onClick}
      className={clsx(
        "h-8 rounded-lg border px-2.5 text-[0.8125rem] font-medium transition-colors",
        pressed
          ? "border-brand-600 bg-brand-600 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:text-brand-800",
      )}
    >
      {label}
    </button>
  );
}
