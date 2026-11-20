import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  CalendarClock,
  Car,
  CheckCircle2,
  Clock,
  HeartPulse,
  History,
  LockKeyhole,
  MapPin,
  MessageSquareText,
  Sparkles,
  Star,
  Stethoscope,
} from "lucide-react";
import { Link } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { PageShell } from "../components/layout/PageShell";
import { BOOKING_WINDOW_DAYS } from "../components/booking/DatePickerDialog";
import { BRAND_NAME, SLOT_TIMES, SPECIALIZATIONS } from "../config/catalog";

const FEATURES = [
  { icon: Stethoscope, title: "Smart specialist matching", text: "Tell us your concern in plain words. We shortlist the right specialists near you.", tone: "bg-sky-50 text-sky-700" },
  { icon: Car, title: "Clinics compared for you", text: "Distance and live travel time to every clinic, closest first.", tone: "bg-emerald-50 text-emerald-700" },
  { icon: Star, title: "Real patient insight", text: "AI summaries of what patients actually say about each doctor.", tone: "bg-violet-50 text-violet-700" },
  { icon: CalendarClock, title: "Live slot availability", text: "Pick a date on the calendar and see open times instantly.", tone: "bg-amber-50 text-amber-700" },
  { icon: CalendarCheck, title: "Booked in one tap", text: "Your appointment lands in Google Calendar with the clinic address.", tone: "bg-rose-50 text-rose-700" },
  { icon: History, title: "Your care history", text: "Every appointment on your dashboard, with one-click rebooking.", tone: "bg-brand-50 text-brand-800" },
];

const STEPS = [
  { title: "Tell us what you need", text: "Choose a speciality or simply describe your symptoms to our AI care coordinator." },
  { title: "Compare and choose", text: "Review doctors, clinics, travel times and patient feedback side by side." },
  { title: "Pick a slot and you're booked", text: "Select a date and time. We confirm it and add it to your calendar." },
];

function HeroPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden>
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-brand-100 via-sky-50 to-transparent blur-2xl" />
      <div className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-pop">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <span className="grid size-8 place-items-center rounded-full bg-brand-700 text-white">
            <HeartPulse className="size-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-ink">Care Coordinator</p>
            <p className="text-[0.6875rem] text-emerald-600">● Online</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 py-4 text-sm">
          <p className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-brand-700 px-3.5 py-2 text-white">
            I need a cardiologist near Park Street this week.
          </p>
          <p className="max-w-[85%] rounded-2xl rounded-tl-md bg-slate-100 px-3.5 py-2 text-slate-700">
            I found 3 cardiologists nearby. Dr. Sen is 12 minutes away and has 4 open slots on Thursday.
          </p>
          <div className="rounded-2xl border border-slate-200 p-3">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-brand-50 font-display text-sm font-bold text-brand-800 ring-1 ring-brand-200">
                AS
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">Dr. Anita Sen</p>
                <p className="text-xs text-slate-500">Cardiology · 18 yrs experience</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[0.6875rem] font-medium text-emerald-700">
                <Clock className="size-3" /> 12 min
              </span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {["10 AM", "11 AM", "2 PM", "4 PM"].map((t, i) => (
                <span
                  key={t}
                  className={
                    i === 2
                      ? "rounded-lg bg-brand-700 py-1.5 text-center text-xs font-semibold text-white"
                      : "rounded-lg border border-emerald-200 bg-emerald-50/60 py-1.5 text-center text-xs font-semibold text-emerald-800"
                  }
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="size-4" /> Appointment confirmed · Added to Google Calendar
          </p>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { status, user } = useAuth();
  const authed = status === "authed";

  return (
    <PageShell>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[38rem] bg-gradient-to-b from-brand-50/80 to-transparent" aria-hidden />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-16 sm:pt-16 lg:grid-cols-2 lg:px-6 lg:pt-20 lg:pb-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-800 shadow-card ring-1 ring-brand-100">
              <Sparkles className="size-3.5 text-brand-600" aria-hidden />
              Your AI care coordinator · Powered by Gemini
            </span>
            <h1 className="mt-5 font-display text-4xl leading-[1.1] font-extrabold tracking-tight text-balance text-ink sm:text-5xl">
              The right doctor. <span className="text-brand-700">Booked in minutes.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-balance text-slate-600">
              {BRAND_NAME} finds the right specialist for you, compares nearby clinics and patient reviews, checks live
              availability and books your appointment, all in one simple conversation.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {authed ? (
                <>
                  <Link
                    to="/consult"
                    className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand-700 px-6 text-base font-semibold text-white shadow-sm hover:bg-brand-800"
                  >
                    Start a consultation <ArrowRight className="size-4" aria-hidden />
                  </Link>
                  <Link
                    to="/dashboard"
                    className="inline-flex h-12 items-center rounded-xl border border-slate-200 bg-white px-6 text-base font-semibold text-slate-700 hover:border-brand-300 hover:bg-brand-50"
                  >
                    {user ? `${user.firstName}'s dashboard` : "My dashboard"}
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    to="/register"
                    className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand-700 px-6 text-base font-semibold text-white shadow-sm hover:bg-brand-800"
                  >
                    Create free account <ArrowRight className="size-4" aria-hidden />
                  </Link>
                  <Link
                    to="/login"
                    className="inline-flex h-12 items-center rounded-xl border border-slate-200 bg-white px-6 text-base font-semibold text-slate-700 hover:border-brand-300 hover:bg-brand-50"
                  >
                    Log in
                  </Link>
                </>
              )}
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
              {["Free to use", "No waiting on hold", "Private to your account"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <BadgeCheck className="size-4 text-brand-600" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <HeroPreview />
        </div>
      </section>

      {/* Trust strip */}
      <section aria-label="Highlights" className="border-y border-slate-200/80 bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 text-center sm:grid-cols-4 lg:px-6">
          {[
            { value: `${SPECIALIZATIONS.length}`, label: "Medical specialities" },
            { value: `${BOOKING_WINDOW_DAYS} days`, label: "Book up to two months ahead" },
            { value: `${SLOT_TIMES.length}`, label: "Hourly slots per clinic day" },
            { value: "24 × 7", label: "AI coordinator availability" },
          ].map((s) => (
            <div key={s.label}>
              <p className="font-display text-2xl font-extrabold text-brand-800 sm:text-3xl">{s.value}</p>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section aria-labelledby="features" className="mx-auto max-w-6xl px-4 py-16 lg:px-6 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold tracking-wider text-brand-700 uppercase">Why {BRAND_NAME}</p>
          <h2 id="features" className="mt-2 font-display text-3xl font-bold tracking-tight text-balance text-ink sm:text-4xl">
            Everything you need to see a doctor, in one place
          </h2>
          <p className="mt-3 text-slate-600">No phone queues, no guesswork. Just the right care, at a time that suits you.</p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text, tone }) => (
            <div key={title} className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card transition-shadow hover:shadow-pop">
              <span className={`grid size-11 place-items-center rounded-xl ${tone}`}>
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 font-display text-lg font-bold text-ink">{title}</h3>
              <p className="mt-1.5 text-sm text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how" className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 lg:px-6 lg:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold tracking-wider text-brand-700 uppercase">How it works</p>
            <h2 id="how" className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Three steps to your appointment
            </h2>
          </div>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative rounded-2xl bg-canvas p-6">
                <span className="grid size-10 place-items-center rounded-full bg-brand-700 font-display text-base font-bold text-white">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-display text-lg font-bold text-ink">{step.title}</h3>
                <p className="mt-1.5 text-sm text-slate-600">{step.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-slate-500">
            <span className="flex items-center gap-2">
              <MessageSquareText className="size-4 text-brand-600" aria-hidden /> Conversational AI on Google Cloud
            </span>
            <span className="flex items-center gap-2">
              <MapPin className="size-4 text-brand-600" aria-hidden /> Travel times by Google Maps
            </span>
            <span className="flex items-center gap-2">
              <LockKeyhole className="size-4 text-brand-600" aria-hidden /> Secure, private accounts
            </span>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16 lg:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 to-brand-900 px-6 py-12 text-center text-white shadow-pop sm:px-12">
          <div className="pointer-events-none absolute -top-20 -right-16 size-64 rounded-full bg-brand-500/30 blur-3xl" aria-hidden />
          <h2 className="relative font-display text-3xl font-bold tracking-tight text-balance">Your next appointment is one conversation away</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-brand-100">
            Join {BRAND_NAME} and let your AI care coordinator handle the search, the comparison and the booking.
          </p>
          <Link
            to={authed ? "/consult" : "/register"}
            className="relative mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-base font-semibold text-brand-800 shadow-sm hover:bg-brand-50"
          >
            {authed ? "Start a consultation" : "Get started, it's free"} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
