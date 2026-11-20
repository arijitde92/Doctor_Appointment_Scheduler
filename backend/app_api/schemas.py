"""Request / response models. JSON uses camelCase to match the frontend."""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

PASSWORD_MIN_LENGTH = 8
# Anything that is not a letter or digit (and not whitespace) counts as special.
_SPECIAL = re.compile(r"[^A-Za-z0-9\s]")
_PHONE = re.compile(r"^\+?[0-9][0-9\s-]{8,14}$")


def password_problems(password: str) -> list[str]:
    """Rules mirrored in frontend/src/lib/validation.ts."""
    problems = []
    if len(password) < PASSWORD_MIN_LENGTH:
        problems.append(f"at least {PASSWORD_MIN_LENGTH} characters")
    if not re.search(r"[A-Z]", password):
        problems.append("an uppercase letter")
    if not re.search(r"[a-z]", password):
        problems.append("a lowercase letter")
    if not re.search(r"[0-9]", password):
        problems.append("a number")
    if not _SPECIAL.search(password):
        problems.append("a special character")
    return problems


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, str_strip_whitespace=True)


# ── Auth ────────────────────────────────────────────────────────────────────


class RegisterRequest(ApiModel):
    first_name: str = Field(min_length=1, max_length=60)
    last_name: str = Field(min_length=1, max_length=60)
    phone: str
    email: EmailStr = Field(max_length=254)
    address: str = Field(min_length=5, max_length=300)
    date_of_birth: date
    password: str = Field(max_length=128)
    confirm_password: str = Field(max_length=128)

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str) -> str:
        if not _PHONE.match(value):
            raise ValueError("Enter a valid phone number (10–15 digits, optional leading +).")
        return re.sub(r"[\s-]", "", value)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return value.lower()

    @field_validator("date_of_birth")
    @classmethod
    def _dob(cls, value: date) -> date:
        today = date.today()
        if value >= today:
            raise ValueError("Date of birth must be in the past.")
        if today.year - value.year > 120:
            raise ValueError("Enter a valid date of birth.")
        return value

    @field_validator("password")
    @classmethod
    def _password(cls, value: str) -> str:
        problems = password_problems(value)
        if problems:
            raise ValueError("Password must contain " + ", ".join(problems) + ".")
        return value

    @model_validator(mode="after")
    def _passwords_match(self) -> "RegisterRequest":
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match.")
        return self


class LoginRequest(ApiModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)


class SessionMeta(ApiModel):
    """Client details recorded with a new login (sent by the BFF)."""

    ip: str | None = Field(default=None, max_length=64)
    user_agent: str | None = Field(default=None, max_length=255)


class UserOut(ApiModel):
    id: str
    first_name: str
    last_name: str
    email: str
    phone: str
    address: str
    date_of_birth: date
    created_at: datetime


class AuthResult(ApiModel):
    token: str
    auth_session_id: str
    expires_at: datetime
    user: UserOut


class SessionInfo(ApiModel):
    auth_session_id: str
    expires_at: datetime
    user: UserOut


# ── Consultations ───────────────────────────────────────────────────────────


class ConsultationCreate(ApiModel):
    id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")
    auth_session_id: str | None = Field(default=None, max_length=36)


class ConsultationOut(ApiModel):
    id: str
    title: str | None
    started_at: datetime
    last_activity_at: datetime
    message_count: int = 0


class MessageOut(ApiModel):
    id: int
    author: str
    kind: str
    tool_name: str | None
    content: str
    created_at: datetime


# ── Appointments ────────────────────────────────────────────────────────────

AppointmentStatus = Literal["pending", "confirmed", "failed", "cancelled"]


class AppointmentCreate(ApiModel):
    consultation_id: str | None = Field(default=None, max_length=128)
    doctor_id: int = Field(ge=1)
    doctor_name: str = Field(min_length=1, max_length=255)
    specialization: str | None = Field(default=None, max_length=100)
    clinic_id: int = Field(ge=1)
    clinic_name: str = Field(min_length=1, max_length=255)
    clinic_address: str | None = Field(default=None, max_length=1000)
    appointment_date: date
    slot_index: int = Field(ge=0, le=6)
    start_time: str = Field(min_length=1, max_length=16)
    end_time: str = Field(min_length=1, max_length=16)
    # Clinic's IANA time zone; date and times are local to it.
    time_zone: str | None = Field(default=None, max_length=64)

    @field_validator("time_zone")
    @classmethod
    def _known_zone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Unknown time zone.") from None
        return value

    @model_validator(mode="after")
    def _future(self) -> "AppointmentCreate":
        # "Today" at the clinic, so a booking isn't rejected (or allowed) just
        # because the server runs in UTC.
        today = datetime.now(ZoneInfo(self.time_zone)).date() if self.time_zone else date.today()
        if self.appointment_date < today:
            raise ValueError("Appointments can't be booked in the past.")
        return self


class AppointmentUpdate(ApiModel):
    status: AppointmentStatus
    calendar_link: str | None = Field(default=None, max_length=1024)


class AppointmentOut(ApiModel):
    id: str
    consultation_id: str | None
    doctor_id: int
    doctor_name: str
    specialization: str | None
    clinic_id: int
    clinic_name: str
    clinic_address: str | None
    appointment_date: date
    slot_index: int
    start_time: str
    end_time: str
    time_zone: str | None = None
    status: AppointmentStatus
    calendar_link: str | None
    created_at: datetime
