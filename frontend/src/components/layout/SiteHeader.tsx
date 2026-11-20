import clsx from "clsx";
import { ChevronDown, HeartPulse, LayoutDashboard, LogOut, MessageSquarePlus } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router";

import { useAuth } from "../../auth/AuthContext";
import { BRAND_NAME, BRAND_TAGLINE } from "../../config/catalog";
import { initials } from "../ui";

export function BrandMark({ to = "/", compact = false }: { to?: string; compact?: boolean }) {
  return (
    <Link to={to} className="flex min-w-0 items-center gap-3" aria-label={`${BRAND_NAME} home`}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-sm">
        <HeartPulse className="size-5" strokeWidth={2.25} aria-hidden />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block font-display text-lg font-bold tracking-tight text-ink">{BRAND_NAME}</span>
        {!compact && <span className="block truncate text-xs text-slate-500">{BRAND_TAGLINE}</span>}
      </span>
    </Link>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  clsx(
    "inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors",
    isActive ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-100 hover:text-ink",
  );

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;
  const name = `${user.firstName} ${user.lastName}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-10 items-center gap-2 rounded-xl pr-2 pl-1 transition-colors hover:bg-slate-100"
      >
        <span className="grid size-8 place-items-center rounded-full bg-brand-100 font-display text-xs font-bold text-brand-800 ring-1 ring-brand-200">
          {initials(name)}
        </span>
        <span className="hidden max-w-32 truncate text-sm font-medium text-ink md:block">{user.firstName}</span>
        <ChevronDown className={clsx("size-4 text-slate-400 transition-transform", open && "rotate-180")} aria-hidden />
        <span className="sr-only">Account menu</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-pop animate-fade-in"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink">{name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <div className="p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate("/dashboard");
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <LayoutDashboard className="size-4 text-slate-400" aria-hidden />
              My dashboard
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await logout();
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
            >
              <LogOut className="size-4" aria-hidden />
              {busy ? "Logging out…" : "Log out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Site-wide header. Signed out: About / Contact / Log in / Get started.
 * Signed in: Dashboard / Consult links and the account menu. `children` adds
 * page-specific actions (e.g. "New consultation" on the consultation page).
 */
export function SiteHeader({ children, wide = false }: { children?: ReactNode; wide?: boolean }) {
  const { status } = useAuth();
  const authed = status === "authed";
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className={clsx("mx-auto flex h-16 items-center justify-between gap-3 px-4 lg:px-6", wide ? "max-w-[1600px]" : "max-w-6xl")}>
        <BrandMark to={authed ? "/dashboard" : "/"} />

        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          {authed ? (
            <>
              <NavLink to="/dashboard" className={(s) => clsx(navClass(s), "max-md:hidden")}>
                <LayoutDashboard className="size-4" aria-hidden />
                Dashboard
              </NavLink>
              <NavLink to="/consult" className={(s) => clsx(navClass(s), "max-md:hidden")}>
                <MessageSquarePlus className="size-4" aria-hidden />
                Consult
              </NavLink>
              {children}
              <UserMenu />
            </>
          ) : (
            <>
              <NavLink to="/about" className={(s) => clsx(navClass(s), "max-md:hidden")}>
                About
              </NavLink>
              <NavLink to="/contact" className={(s) => clsx(navClass(s), "max-md:hidden")}>
                Contact
              </NavLink>
              <Link
                to="/login"
                className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-semibold text-brand-800 hover:bg-brand-50"
              >
                Log in
              </Link>
              <Link
                to="/register"
                className="inline-flex h-10 items-center rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-brand-800"
              >
                Get started
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
