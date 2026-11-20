import { Loader2, LogIn, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { FormAlert, PasswordField, TextField } from "../components/forms/fields";
import { Button } from "../components/ui";
import { ApiError } from "../lib/api";
import { AuthLayout } from "./AuthLayout";

export default function LoginPage() {
  const { login } = useAuth();
  const location = useLocation();
  const state = location.state as { from?: string; loggedOut?: boolean } | null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      // <PublicOnly> redirects to the requested page (or the dashboard).
    } catch (err) {
      setError(
        err instanceof ApiError && (err.status === 401 || err.status === 429 || err.status === 422)
          ? err.status === 422
            ? "Enter a valid email and password."
            : err.message
          : "We couldn't sign you in right now. Please try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      docTitle="Log in"
      title="Welcome back"
      subtitle={
        <>
          New to CareConnect?{" "}
          <Link to="/register" state={state?.from ? { from: state.from } : undefined} className="font-semibold text-brand-700 hover:text-brand-900">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {state?.loggedOut && !error && <FormAlert tone="info">You've been logged out securely.</FormAlert>}
        {state?.from && !state.loggedOut && !error && <FormAlert tone="info">Please log in to continue.</FormAlert>}
        {error && <FormAlert>{error}</FormAlert>}

        <TextField
          label="Email address"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          icon={<Mail className="size-4" aria-hidden />}
          placeholder="you@example.com"
          data-autofocus
          autoFocus
        />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Button type="submit" className="mt-2 h-11" disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogIn className="size-4" aria-hidden />}
          {submitting ? "Signing in…" : "Log in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
