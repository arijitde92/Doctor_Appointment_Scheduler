import clsx from "clsx";
import { Check, CircleAlert, Circle, Eye, EyeOff, X } from "lucide-react";
import { useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

import { PASSWORD_RULES } from "../../lib/validation";

export const fieldClass =
  "w-full rounded-xl border bg-white px-3 text-sm text-ink shadow-xs transition placeholder:text-slate-400 hover:border-slate-300 focus:ring-4 focus:outline-none disabled:bg-slate-50";

const stateClass = (error?: string) =>
  error
    ? "border-rose-300 focus:border-rose-500 focus:ring-rose-100"
    : "border-slate-200 focus:border-brand-500 focus:ring-brand-100";

interface FieldShellProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  after?: ReactNode;
}

function FieldShell({ id, label, required, error, hint, children, after }: FieldShellProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && (
          <span className="text-rose-600" aria-hidden>
            {" "}
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1.5 text-xs text-rose-700">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
      {after}
    </div>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  error?: string;
  hint?: ReactNode;
  icon?: ReactNode;
};

export function TextField({ label, error, hint, icon, required, className, ...props }: InputProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} required={required} error={error} hint={hint}>
      <div className="relative">
        {icon && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400">{icon}</span>}
        <input
          id={id}
          required={required}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          {...props}
          className={clsx(fieldClass, stateClass(error), "h-11", icon && "pl-9", className)}
        />
      </div>
    </FieldShell>
  );
}

type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & { label: string; error?: string; hint?: ReactNode };

export function TextAreaField({ label, error, hint, required, className, ...props }: TextAreaProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} required={required} error={error} hint={hint}>
      <textarea
        id={id}
        required={required}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...props}
        className={clsx(fieldClass, stateClass(error), "min-h-20 resize-y py-2.5", className)}
      />
    </FieldShell>
  );
}

export function PasswordField({
  label,
  error,
  hint,
  required,
  after,
  describedBy,
  ...props
}: Omit<InputProps, "type" | "icon"> & { after?: ReactNode; describedBy?: string }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const described = [error ? `${id}-error` : hint ? `${id}-hint` : null, describedBy].filter(Boolean).join(" ") || undefined;
  return (
    <FieldShell id={id} label={label} required={required} error={error} hint={hint} after={after}>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          required={required}
          aria-invalid={!!error || undefined}
          aria-describedby={described}
          {...props}
          className={clsx(fieldClass, stateClass(error), "h-11 pr-11")}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-ink"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
    </FieldShell>
  );
}

/** Live list of password requirements, ticked as each one is met. */
export function PasswordChecklist({ id, password }: { id?: string; password: string }) {
  return (
    <ul id={id} className="mt-2 grid gap-1 rounded-xl bg-slate-50 px-3 py-2.5 text-xs sm:grid-cols-2" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password);
        return (
          <li key={rule.id} className={clsx("flex items-center gap-1.5 transition-colors", ok ? "text-emerald-700" : "text-slate-500")}>
            {ok ? <Check className="size-3.5 shrink-0" strokeWidth={3} aria-hidden /> : <Circle className="size-3 shrink-0" aria-hidden />}
            <span>
              {rule.label}
              <span className="sr-only">{ok ? " (met)" : " (not met)"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** "Passwords match" confirmation under the confirm-password field. */
export function PasswordMatch({ id, password, confirm }: { id?: string; password: string; confirm: string }) {
  if (!confirm) return <p id={id} className="sr-only" aria-live="polite" />;
  const match = password === confirm;
  return (
    <p
      id={id}
      aria-live="polite"
      className={clsx(
        "mt-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium",
        match ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
      )}
    >
      {match ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : <X className="size-3.5" strokeWidth={3} aria-hidden />}
      {match ? "Passwords match" : "Passwords don't match"}
    </p>
  );
}

export function FormAlert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "info" }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={clsx(
        "flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm",
        tone === "error" ? "bg-rose-50 text-rose-800 ring-1 ring-rose-200" : "bg-brand-50 text-brand-900 ring-1 ring-brand-100",
      )}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
