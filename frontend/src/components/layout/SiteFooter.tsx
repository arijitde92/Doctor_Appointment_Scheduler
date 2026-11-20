import clsx from "clsx";
import { Mail } from "lucide-react";
import { Link } from "react-router";

import { BRAND_NAME, CONTACT_EMAIL, EMERGENCY_NUMBER } from "../../config/catalog";
import { BrandMark } from "./SiteHeader";

const year = new Date().getFullYear();

export function ContactEmailLink({ className }: { className?: string }) {
  return (
    <a
      href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`${BRAND_NAME} enquiry`)}`}
      className={clsx("inline-flex items-center gap-1.5 font-medium text-brand-700 underline-offset-2 hover:text-brand-900 hover:underline", className)}
    >
      <Mail className="size-4 shrink-0" aria-hidden />
      {CONTACT_EMAIL}
    </a>
  );
}

/**
 * Site footer. `compact` is a single line for the full-height consultation
 * workspace; the full footer is used everywhere else.
 */
export function SiteFooter({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <footer className="hidden border-t border-slate-200/80 bg-white md:block">
        <div className="mx-auto flex h-10 max-w-[1600px] items-center justify-between gap-4 px-4 text-xs text-slate-500 lg:px-6">
          <span>
            © {year} {BRAND_NAME}
          </span>
          <nav aria-label="Footer" className="flex items-center gap-4">
            <Link to="/about" className="hover:text-ink">
              About Us
            </Link>
            <Link to="/contact" className="hover:text-ink">
              Contact Us
            </Link>
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-ink">
              {CONTACT_EMAIL}
            </a>
          </nav>
        </div>
      </footer>
    );
  }

  return (
    <footer className="border-t border-slate-200/80 bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.4fr] lg:px-6">
        <div>
          <BrandMark />
          <p className="mt-3 max-w-xs text-sm text-slate-500">
            Your AI care coordinator: find the right specialist, compare clinics and book in minutes.
          </p>
        </div>
        <nav aria-label="Company">
          <h2 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Company</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li>
              <Link to="/about" className="text-slate-600 hover:text-ink">
                About Us
              </Link>
            </li>
            <li>
              <Link to="/contact" className="text-slate-600 hover:text-ink">
                Contact Us
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Account">
          <h2 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Patients</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li>
              <Link to="/dashboard" className="text-slate-600 hover:text-ink">
                My dashboard
              </Link>
            </li>
            <li>
              <Link to="/consult" className="text-slate-600 hover:text-ink">
                Book an appointment
              </Link>
            </li>
          </ul>
        </nav>
        <div>
          <h2 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">Get in touch</h2>
          <p className="mt-3 text-sm text-slate-600">Questions, feedback or partnership enquiries:</p>
          <ContactEmailLink className="mt-1.5 text-sm break-all" />
        </div>
      </div>
      <div className="border-t border-slate-100">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-6">
          <span>
            © {year} {BRAND_NAME}. All rights reserved.
          </span>
          <span>
            Not for medical emergencies. Call <strong className="font-semibold text-slate-600">{EMERGENCY_NUMBER}</strong>.
          </span>
        </div>
      </div>
    </footer>
  );
}
