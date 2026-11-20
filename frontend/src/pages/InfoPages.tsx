import { ArrowRight, Bot, CalendarCheck, Clock3, HeartHandshake, Mail, MessageCircleQuestion, ShieldCheck } from "lucide-react";
import { Link } from "react-router";

import { PageShell } from "../components/layout/PageShell";
import { ContactEmailLink } from "../components/layout/SiteFooter";
import { BRAND_NAME, CONTACT_EMAIL, EMERGENCY_NUMBER } from "../config/catalog";

function PageHero({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <section className="bg-gradient-to-b from-brand-50/80 to-transparent">
      <div className="mx-auto max-w-4xl px-4 pt-14 pb-10 text-center lg:px-6">
        <p className="text-sm font-semibold tracking-wider text-brand-700 uppercase">{eyebrow}</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight text-balance text-ink">{title}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-balance text-slate-600">{text}</p>
      </div>
    </section>
  );
}

export function AboutPage() {
  const values = [
    { icon: HeartHandshake, title: "Patients first", text: "Clear information about doctors, clinics and timings, so you can choose with confidence." },
    { icon: Bot, title: "AI that does the legwork", text: "Specialised agents search verified clinic data, read patient reviews and check schedules for you." },
    { icon: ShieldCheck, title: "Private by design", text: "Your consultations and appointments are tied to your account and visible only to you." },
  ];
  return (
    <PageShell title="About Us">
      <PageHero
        eyebrow="About Us"
        title="Making it simple to see the right doctor"
        text={`${BRAND_NAME} is an AI care coordinator that turns the hours spent searching for a specialist, calling clinics and waiting on hold into a short, friendly conversation.`}
      />
      <section className="mx-auto max-w-5xl px-4 pb-16 lg:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {values.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
              <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
                <Icon className="size-5" aria-hidden />
              </span>
              <h2 className="mt-4 font-display text-lg font-bold text-ink">{title}</h2>
              <p className="mt-1.5 text-sm text-slate-600">{text}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card sm:p-8">
          <h2 className="font-display text-xl font-bold text-ink">How {BRAND_NAME} works</h2>
          <p className="mt-3 text-slate-600">
            A team of AI agents built on Google Gemini works together behind the scenes. One matches you with specialists
            from verified clinic data, another summarises what patients say about each doctor, Google Maps estimates your
            travel time, and a scheduling agent books your slot and adds it to Google Calendar. Every appointment is saved
            to your dashboard so you can rebook a doctor you trust in a couple of clicks.
          </p>
          <p className="mt-3 text-sm text-slate-500">
            {BRAND_NAME} helps you book appointments; it does not give medical advice. In an emergency, call{" "}
            <strong className="text-slate-700">{EMERGENCY_NUMBER}</strong>.
          </p>
          <Link to="/contact" className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-900">
            Get in touch <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </section>
    </PageShell>
  );
}

export function ContactPage() {
  return (
    <PageShell title="Contact Us">
      <PageHero
        eyebrow="Contact Us"
        title="We'd love to hear from you"
        text="Questions about your account, feedback on the service or partnership enquiries: drop us an email and we'll get back to you."
      />
      <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-16 md:grid-cols-[1.4fr_1fr] lg:px-6">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card sm:p-8">
          <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-700">
            <Mail className="size-6" aria-hidden />
          </span>
          <h2 className="mt-4 font-display text-xl font-bold text-ink">Email us</h2>
          <p className="mt-1.5 text-slate-600">Click the address to open your email app with a new message.</p>
          <ContactEmailLink className="mt-4 text-lg break-all" />
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`${BRAND_NAME} enquiry`)}`}
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-700 px-5 text-sm font-semibold text-white shadow-sm hover:bg-brand-800"
          >
            <Mail className="size-4" aria-hidden />
            Write to us
          </a>
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
            <Clock3 className="size-5 text-brand-600" aria-hidden />
            <h2 className="mt-3 font-semibold text-ink">Response time</h2>
            <p className="mt-1 text-sm text-slate-600">We usually reply within 1–2 business days.</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card">
            <CalendarCheck className="size-5 text-brand-600" aria-hidden />
            <h2 className="mt-3 font-semibold text-ink">Need to book?</h2>
            <p className="mt-1 text-sm text-slate-600">
              The fastest way is to{" "}
              <Link to="/consult" className="font-semibold text-brand-700 hover:text-brand-900">
                start a consultation
              </Link>
              .
            </p>
          </div>
          <div className="rounded-2xl border border-rose-100 bg-rose-50 p-6">
            <MessageCircleQuestion className="size-5 text-rose-600" aria-hidden />
            <h2 className="mt-3 font-semibold text-rose-900">Medical emergency?</h2>
            <p className="mt-1 text-sm text-rose-800">
              Don't email. Call <strong>{EMERGENCY_NUMBER}</strong> immediately.
            </p>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

export function NotFoundPage() {
  return (
    <PageShell title="Page not found">
      <section className="mx-auto max-w-xl px-4 py-24 text-center">
        <p className="font-display text-6xl font-extrabold text-brand-700">404</p>
        <h1 className="mt-4 font-display text-2xl font-bold text-ink">We couldn't find that page</h1>
        <p className="mt-2 text-slate-600">The link may be broken or the page may have moved.</p>
        <Link to="/" className="mt-8 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800">
          Back to home
        </Link>
      </section>
    </PageShell>
  );
}
