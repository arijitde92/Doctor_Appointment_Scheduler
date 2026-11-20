/**
 * Registration rules. Mirrors backend/app_api/schemas.py — the server
 * re-validates everything, these only drive the live form feedback.
 */

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordRule {
  id: "length" | "upper" | "lower" | "digit" | "special";
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: "length", label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (p) => p.length >= PASSWORD_MIN_LENGTH },
  { id: "upper", label: "One uppercase letter (A–Z)", test: (p) => /[A-Z]/.test(p) },
  { id: "lower", label: "One lowercase letter (a–z)", test: (p) => /[a-z]/.test(p) },
  { id: "digit", label: "One number (0–9)", test: (p) => /[0-9]/.test(p) },
  { id: "special", label: "One special character (e.g. ! @ # $ %)", test: (p) => /[^A-Za-z0-9\s]/.test(p) },
];

export function passwordIsValid(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PHONE_PATTERN = /^\+?[0-9][0-9\s-]{8,14}$/;

export interface RegistrationForm {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  dateOfBirth: string; // YYYY-MM-DD
  password: string;
  confirmPassword: string;
}

export type RegistrationErrors = Partial<Record<keyof RegistrationForm, string>>;

/** Field errors for the registration form (empty object = valid). */
export function validateRegistration(form: RegistrationForm, today: Date = new Date()): RegistrationErrors {
  const errors: RegistrationErrors = {};
  if (!form.firstName.trim()) errors.firstName = "Enter your first name.";
  else if (form.firstName.trim().length > 60) errors.firstName = "Use 60 characters or fewer.";
  if (!form.lastName.trim()) errors.lastName = "Enter your last name.";
  else if (form.lastName.trim().length > 60) errors.lastName = "Use 60 characters or fewer.";
  if (!PHONE_PATTERN.test(form.phone.trim())) errors.phone = "Enter a valid phone number (10–15 digits).";
  if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = "Enter a valid email address.";
  const address = form.address.trim();
  if (address.length < 5) errors.address = "Enter your current address.";
  else if (address.length > 300) errors.address = "Use 300 characters or fewer.";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dateOfBirth)) {
    errors.dateOfBirth = "Enter your date of birth.";
  } else {
    const [y, m, d] = form.dateOfBirth.split("-").map(Number);
    const dob = new Date(y, m - 1, d);
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (dob >= startOfToday) errors.dateOfBirth = "Date of birth must be in the past.";
    else if (today.getFullYear() - y > 120) errors.dateOfBirth = "Enter a valid date of birth.";
  }

  if (!passwordIsValid(form.password)) errors.password = "Password doesn't meet all the requirements.";
  if (!form.confirmPassword) errors.confirmPassword = "Confirm your password.";
  else if (form.confirmPassword !== form.password) errors.confirmPassword = "Passwords don't match.";
  return errors;
}
