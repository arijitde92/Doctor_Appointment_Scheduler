import { HeartPulse } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

import { useAuth } from "./AuthContext";

export function FullPageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <span className="grid size-12 animate-pulse place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-sm">
          <HeartPulse className="size-6" aria-hidden />
        </span>
        <span className="text-sm">{label}</span>
      </div>
    </div>
  );
}

/** Signed-in pages. Anyone else goes to /login — replacing the history entry. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <FullPageLoader />;
  if (status !== "authed") {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

/**
 * Login / register. Signed-in users (including right after a successful login)
 * go to the page they originally asked for, or their dashboard.
 */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <FullPageLoader />;
  if (status === "authed") {
    const from = (location.state as { from?: string } | null)?.from;
    const safe = from && from.startsWith("/") && !from.startsWith("//") && !/^\/(login|register)/.test(from) ? from : "/dashboard";
    return <Navigate to={safe} replace />;
  }
  return <>{children}</>;
}
