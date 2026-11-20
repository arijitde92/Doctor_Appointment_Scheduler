"""Application tables (SQLAlchemy Core).

users                  one row per patient account
auth_sessions          one row per login (per-user, per-session)
consultations          one row per chat consultation (= ADK session id)
consultation_messages  the full conversation of each consultation
appointments           appointments booked through the app
"""

from __future__ import annotations

from sqlalchemy import (
    BigInteger,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    SmallInteger,
    String,
    Table,
    Text,
)
from sqlalchemy.dialects.mysql import MEDIUMTEXT

metadata = MetaData()

# MEDIUMTEXT on MySQL (16 MB), TEXT elsewhere.
LongText = Text().with_variant(MEDIUMTEXT(), "mysql")
# BIGINT AUTO_INCREMENT on MySQL; SQLite only auto-increments INTEGER PRIMARY KEY.
BigId = BigInteger().with_variant(Integer(), "sqlite")

users = Table(
    "users",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("first_name", String(60), nullable=False),
    Column("last_name", String(60), nullable=False),
    Column("email", String(254), nullable=False, unique=True),
    Column("phone", String(20), nullable=False),
    Column("address", Text, nullable=False),
    Column("date_of_birth", Date, nullable=False),
    Column("password_hash", String(255), nullable=False),
    Column("created_at", DateTime, nullable=False),
    Column("updated_at", DateTime, nullable=False),
)

auth_sessions = Table(
    "auth_sessions",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("user_id", String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("token_hash", String(64), nullable=False, unique=True),
    Column("created_at", DateTime, nullable=False),
    Column("last_seen_at", DateTime, nullable=False),
    Column("expires_at", DateTime, nullable=False),
    Column("revoked_at", DateTime, nullable=True),
    Column("ip", String(64), nullable=True),
    Column("user_agent", String(255), nullable=True),
    Index("ix_auth_sessions_user", "user_id"),
)

consultations = Table(
    "consultations",
    metadata,
    Column("id", String(128), primary_key=True),  # ADK session id
    Column("user_id", String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("auth_session_id", String(36), ForeignKey("auth_sessions.id", ondelete="SET NULL"), nullable=True),
    Column("title", String(255), nullable=True),
    Column("started_at", DateTime, nullable=False),
    Column("last_activity_at", DateTime, nullable=False),
    Index("ix_consultations_user", "user_id", "started_at"),
)

consultation_messages = Table(
    "consultation_messages",
    metadata,
    Column("id", BigId, primary_key=True, autoincrement=True),
    Column("consultation_id", String(128), ForeignKey("consultations.id", ondelete="CASCADE"), nullable=False),
    Column("user_id", String(36), nullable=False),
    Column("auth_session_id", String(36), nullable=True),
    Column("invocation_id", String(128), nullable=True),
    Column("event_id", String(128), nullable=True),
    Column("author", String(128), nullable=False),
    # user | agent | tool_call | tool_result
    Column("kind", String(16), nullable=False),
    Column("tool_name", String(128), nullable=True),
    Column("content", LongText, nullable=False),
    Column("created_at", DateTime, nullable=False),
    Index("ix_messages_consultation", "consultation_id", "id"),
)

appointments = Table(
    "appointments",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("user_id", String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("consultation_id", String(128), ForeignKey("consultations.id", ondelete="SET NULL"), nullable=True),
    Column("doctor_id", Integer, nullable=False),
    Column("doctor_name", String(255), nullable=False),
    Column("specialization", String(100), nullable=True),
    Column("clinic_id", Integer, nullable=False),
    Column("clinic_name", String(255), nullable=False),
    Column("clinic_address", Text, nullable=True),
    Column("appointment_date", Date, nullable=False),
    Column("slot_index", SmallInteger, nullable=False),  # 0-6 -> SLOT_TIMES
    Column("start_time", String(16), nullable=False),
    Column("end_time", String(16), nullable=False),
    # Clinic's IANA time zone; appointment_date / start_time are local to it.
    # NULL for rows booked before time zones were stored (Kolkata-only data).
    Column("time_zone", String(64), nullable=True),
    # pending | confirmed | failed | cancelled
    Column("status", String(16), nullable=False),
    Column("calendar_link", String(1024), nullable=True),
    # "{doctor}-{clinic}-{date}-{slot}" while the appointment holds the slot,
    # NULL once failed/cancelled. UNIQUE prevents double-booking (NULLs are
    # allowed to repeat on both MySQL and SQLite).
    Column("slot_lock", String(64), nullable=True, unique=True),
    Column("created_at", DateTime, nullable=False),
    Column("updated_at", DateTime, nullable=False),
    Index("ix_appointments_user", "user_id", "appointment_date"),
    Index("ix_appointments_slot", "doctor_id", "clinic_id", "appointment_date"),
)
