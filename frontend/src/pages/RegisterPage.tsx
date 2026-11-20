import { CalendarDays, Loader2, Mail, Phone, UserPlus, UserRound } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { FormAlert, PasswordChecklist, PasswordField, PasswordMatch, TextAreaField, TextField } from "../components/forms/fields";
import { Button } from "../components/ui";
import { ApiError } from "../lib/api";
import { toIsoDate } from "../lib/dates";
import { validateRegistration, type RegistrationErrors, type RegistrationForm } from "../lib/validation";
import { AuthLayout } from "./AuthLayout";

const EMPTY: RegistrationForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  address: "",
  dateOfBirth: "",
  password: "",
  confirmPassword: "",
};

export default function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState<RegistrationForm>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<keyof RegistrationForm, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<RegistrationErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const errors = useMemo(() => validateRegistration(form), [form]);
  const valid = Object.keys(errors).length === 0;
  const today = toIsoDate(new Date());

  /** Show a field's error once it has been visited (or a submit was attempted). */
  const errorFor = (key: keyof RegistrationForm) => serverErrors[key] ?? (touched[key] ? errors[key] : undefined);

  const bind = (key: keyof RegistrationForm) => ({
    name: key,
    value: form[key],
    onChange: (e: { target: { value: string } }) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
      if (serverErrors[key]) setServerErrors((s) => ({ ...s, [key]: undefined }));
    },
    onBlur: () => setTouched((t) => ({ ...t, [key]: true })),
    error: errorFor(key),
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, true])));
    if (!valid) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await register(form);
      // <PublicOnly> redirects to the dashboard once signed in.
    } catch (err) {
      if (err instanceof ApiError) {
        const fields: RegistrationErrors = {};
        for (const [key, message] of Object.entries(err.fields)) {
          if (key in EMPTY) fields[key as keyof RegistrationForm] = message;
        }
        setServerErrors(fields);
        setFormError(Object.keys(fields).length ? null : err.status === 429 ? err.message : err.message || "Registration failed.");
      } else {
        setFormError("We couldn't create your account right now. Please try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      docTitle="Create account"
      title="Create your account"
      subtitle={
        <>
          Already registered?{" "}
          <Link to="/login" className="font-semibold text-brand-700 hover:text-brand-900">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {formError && <FormAlert>{formError}</FormAlert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="First name" autoComplete="given-name" required maxLength={60} icon={<UserRound className="size-4" aria-hidden />} {...bind("firstName")} autoFocus />
          <TextField label="Last name" autoComplete="family-name" required maxLength={60} {...bind("lastName")} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Email address"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            maxLength={254}
            placeholder="you@example.com"
            icon={<Mail className="size-4" aria-hidden />}
            {...bind("email")}
          />
          <TextField
            label="Phone number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            maxLength={18}
            placeholder="+91 98300 12345"
            icon={<Phone className="size-4" aria-hidden />}
            {...bind("phone")}
          />
        </div>

        <TextField
          label="Date of birth"
          type="date"
          autoComplete="bday"
          required
          max={today}
          min="1900-01-01"
          icon={<CalendarDays className="size-4" aria-hidden />}
          {...bind("dateOfBirth")}
        />

        <TextAreaField
          label="Current address"
          autoComplete="street-address"
          required
          maxLength={300}
          rows={2}
          placeholder="House / street, area, city, PIN code"
          hint="Used to show travel time to clinics. You can change it per consultation."
          {...bind("address")}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <PasswordField
              label="Password"
              autoComplete="new-password"
              required
              maxLength={128}
              describedBy="password-rules"
              {...bind("password")}
              after={<PasswordChecklist id="password-rules" password={form.password} />}
            />
          </div>
          <div className="sm:col-span-2">
            <PasswordField
              label="Confirm password"
              autoComplete="new-password"
              required
              maxLength={128}
              describedBy="password-match"
              {...bind("confirmPassword")}
              // The match indicator replaces the generic mismatch error.
              error={form.confirmPassword ? undefined : errorFor("confirmPassword")}
              after={<PasswordMatch id="password-match" password={form.password} confirm={form.confirmPassword} />}
            />
          </div>
        </div>

        <Button type="submit" className="mt-2 h-11" disabled={submitting || !valid}>
          {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <UserPlus className="size-4" aria-hidden />}
          {submitting ? "Creating your account…" : "Create account"}
        </Button>
        {!valid && !submitting && (
          <p className="-mt-1 text-center text-xs text-slate-500">Complete all fields and meet the password requirements to continue.</p>
        )}
        <p className="text-center text-xs text-slate-500">
          By creating an account you agree that CareConnect stores your details and consultation history to provide this service.
        </p>
      </form>
    </AuthLayout>
  );
}
