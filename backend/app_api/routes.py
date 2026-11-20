"""HTTP routes under /app-api.

Trust model: this service is private on Cloud Run (IAM invoker = the frontend
BFF only). The BFF resolves the patient's session cookie through
``GET /app-api/auth/session`` and passes the verified user id to the other
routes in the ``X-User-Id`` header.
"""

from __future__ import annotations

import os
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy import func, insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection

from .db import get_engine
from .models import appointments, auth_sessions, consultation_messages, consultations, users
from .schemas import (
    AppointmentCreate,
    AppointmentOut,
    AppointmentUpdate,
    AuthResult,
    ConsultationCreate,
    ConsultationOut,
    LoginRequest,
    MessageOut,
    RegisterRequest,
    SessionInfo,
    SessionMeta,
    UserOut,
)
from .security import hash_password, hash_token, new_session_token, verify_password

SESSION_ABSOLUTE = timedelta(hours=float(os.environ.get("AUTH_SESSION_HOURS", "12")))
SESSION_IDLE = timedelta(minutes=float(os.environ.get("AUTH_IDLE_MINUTES", "120")))
_TOUCH_EVERY = timedelta(seconds=60)

router = APIRouter(prefix="/app-api", tags=["careconnect"])


def utcnow() -> datetime:
    """Naive UTC (MySQL DATETIME has no time zone)."""
    return datetime.now(UTC).replace(tzinfo=None)


def as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


async def get_conn():
    async with get_engine().begin() as conn:
        yield conn


Conn = Annotated[AsyncConnection, Depends(get_conn)]
UserId = Annotated[str, Header(alias="X-User-Id", min_length=36, max_length=36)]


def _user_out(row) -> UserOut:
    return UserOut(
        id=row.id,
        first_name=row.first_name,
        last_name=row.last_name,
        email=row.email,
        phone=row.phone,
        address=row.address,
        date_of_birth=row.date_of_birth,
        created_at=as_utc(row.created_at),
    )


async def _start_session(conn: AsyncConnection, user_row, meta: SessionMeta) -> AuthResult:
    now = utcnow()
    token = new_session_token()
    session_id = str(uuid.uuid4())
    expires = now + SESSION_ABSOLUTE
    await conn.execute(
        insert(auth_sessions).values(
            id=session_id,
            user_id=user_row.id,
            token_hash=hash_token(token),
            created_at=now,
            last_seen_at=now,
            expires_at=expires,
            ip=meta.ip,
            user_agent=(meta.user_agent or "")[:255] or None,
        )
    )
    return AuthResult(token=token, auth_session_id=session_id, expires_at=as_utc(expires), user=_user_out(user_row))


# ── Auth ────────────────────────────────────────────────────────────────────


class _RegisterBody(RegisterRequest):
    client: SessionMeta | None = None


class _LoginBody(LoginRequest):
    client: SessionMeta | None = None


@router.post("/auth/register", response_model=AuthResult, status_code=status.HTTP_201_CREATED, response_model_by_alias=True)
async def register(body: _RegisterBody, conn: Conn) -> AuthResult:
    existing = await conn.scalar(select(users.c.id).where(users.c.email == body.email))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, detail={"field": "email", "message": "An account with this email already exists."})
    now = utcnow()
    user_id = str(uuid.uuid4())
    try:
        await conn.execute(
            insert(users).values(
                id=user_id,
                first_name=body.first_name,
                last_name=body.last_name,
                email=body.email,
                phone=body.phone,
                address=body.address,
                date_of_birth=body.date_of_birth,
                password_hash=hash_password(body.password),
                created_at=now,
                updated_at=now,
            )
        )
    except IntegrityError:  # concurrent registration with the same email
        raise HTTPException(status.HTTP_409_CONFLICT, detail={"field": "email", "message": "An account with this email already exists."})
    row = (await conn.execute(select(users).where(users.c.id == user_id))).one()
    return await _start_session(conn, row, body.client or SessionMeta())


@router.post("/auth/login", response_model=AuthResult, response_model_by_alias=True)
async def login(body: _LoginBody, conn: Conn) -> AuthResult:
    row = (await conn.execute(select(users).where(users.c.email == body.email.strip().lower()))).first()
    if not verify_password(row.password_hash if row else None, body.password) or row is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")
    return await _start_session(conn, row, body.client or SessionMeta())


@router.get("/auth/session", response_model=SessionInfo, response_model_by_alias=True)
async def current_session(conn: Conn, token: Annotated[str, Header(alias="X-Session-Token", max_length=128)]) -> SessionInfo:
    row = (
        await conn.execute(
            select(auth_sessions, users)
            .join(users, users.c.id == auth_sessions.c.user_id)
            .where(auth_sessions.c.token_hash == hash_token(token))
        )
    ).first()
    now = utcnow()
    if row is None or row.revoked_at is not None or row.expires_at <= now or row.last_seen_at + SESSION_IDLE <= now:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Session expired. Please log in again.")
    if now - row.last_seen_at >= _TOUCH_EVERY:
        await conn.execute(update(auth_sessions).where(auth_sessions.c.id == row.id).values(last_seen_at=now))
    user = (await conn.execute(select(users).where(users.c.id == row.user_id))).one()
    return SessionInfo(auth_session_id=row.id, expires_at=as_utc(row.expires_at), user=_user_out(user))


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(conn: Conn, token: Annotated[str, Header(alias="X-Session-Token", max_length=128)]) -> Response:
    await conn.execute(
        update(auth_sessions)
        .where(auth_sessions.c.token_hash == hash_token(token), auth_sessions.c.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Consultations ───────────────────────────────────────────────────────────


@router.post("/consultations", response_model=ConsultationOut, status_code=status.HTTP_201_CREATED, response_model_by_alias=True)
async def create_consultation(body: ConsultationCreate, user_id: UserId, conn: Conn) -> ConsultationOut:
    owner = await conn.scalar(select(consultations.c.user_id).where(consultations.c.id == body.id))
    if owner is not None and owner != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Consultation not found.")
    if owner is None:
        now = utcnow()
        await conn.execute(
            insert(consultations).values(
                id=body.id, user_id=user_id, auth_session_id=body.auth_session_id, started_at=now, last_activity_at=now
            )
        )
    row = (await conn.execute(select(consultations).where(consultations.c.id == body.id))).one()
    return ConsultationOut(
        id=row.id, title=row.title, started_at=as_utc(row.started_at), last_activity_at=as_utc(row.last_activity_at)
    )


@router.get("/consultations", response_model=list[ConsultationOut], response_model_by_alias=True)
async def list_consultations(user_id: UserId, conn: Conn, limit: int = Query(20, ge=1, le=100)) -> list[ConsultationOut]:
    counts = (
        select(consultation_messages.c.consultation_id, func.count().label("n"))
        .where(consultation_messages.c.user_id == user_id)
        .group_by(consultation_messages.c.consultation_id)
        .subquery()
    )
    rows = await conn.execute(
        select(consultations, func.coalesce(counts.c.n, 0).label("message_count"))
        .outerjoin(counts, counts.c.consultation_id == consultations.c.id)
        .where(consultations.c.user_id == user_id)
        .order_by(consultations.c.last_activity_at.desc())
        .limit(limit)
    )
    return [
        ConsultationOut(
            id=r.id,
            title=r.title,
            started_at=as_utc(r.started_at),
            last_activity_at=as_utc(r.last_activity_at),
            message_count=r.message_count,
        )
        for r in rows
        if r.message_count > 0
    ]


@router.get("/consultations/{consultation_id}/messages", response_model=list[MessageOut], response_model_by_alias=True)
async def consultation_messages_(consultation_id: str, user_id: UserId, conn: Conn) -> list[MessageOut]:
    owner = await conn.scalar(select(consultations.c.user_id).where(consultations.c.id == consultation_id))
    if owner != user_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Consultation not found.")
    rows = await conn.execute(
        select(consultation_messages)
        .where(consultation_messages.c.consultation_id == consultation_id)
        .order_by(consultation_messages.c.id)
    )
    return [
        MessageOut(
            id=r.id, author=r.author, kind=r.kind, tool_name=r.tool_name, content=r.content, created_at=as_utc(r.created_at)
        )
        for r in rows
    ]


# ── Appointments ────────────────────────────────────────────────────────────


def _slot_lock(doctor_id: int, clinic_id: int, day: date, slot: int) -> str:
    return f"{doctor_id}-{clinic_id}-{day.isoformat()}-{slot}"


# A booking that never got confirmed (tab closed mid-booking, agent error)
# stops holding its slot after this long.
PENDING_HOLD = timedelta(minutes=30)


async def _release_stale_holds(conn: AsyncConnection, **where) -> None:
    filters = [appointments.c.status == "pending", appointments.c.created_at < utcnow() - PENDING_HOLD]
    filters += [appointments.c[col] == value for col, value in where.items()]
    await conn.execute(update(appointments).where(*filters).values(status="failed", slot_lock=None, updated_at=utcnow()))


def _appointment_out(r) -> AppointmentOut:
    return AppointmentOut(
        id=r.id,
        consultation_id=r.consultation_id,
        doctor_id=r.doctor_id,
        doctor_name=r.doctor_name,
        specialization=r.specialization,
        clinic_id=r.clinic_id,
        clinic_name=r.clinic_name,
        clinic_address=r.clinic_address,
        appointment_date=r.appointment_date,
        slot_index=r.slot_index,
        start_time=r.start_time,
        end_time=r.end_time,
        time_zone=r.time_zone,
        status=r.status,
        calendar_link=r.calendar_link,
        created_at=as_utc(r.created_at),
    )


@router.get("/appointments", response_model=list[AppointmentOut], response_model_by_alias=True)
async def list_appointments(user_id: UserId, conn: Conn) -> list[AppointmentOut]:
    await _release_stale_holds(conn, user_id=user_id)
    rows = await conn.execute(
        select(appointments)
        .where(appointments.c.user_id == user_id)
        .order_by(appointments.c.appointment_date.desc(), appointments.c.slot_index)
    )
    return [_appointment_out(r) for r in rows]


@router.get("/appointments/booked-slots", response_model=list[int])
async def booked_slots(
    _user_id: UserId,
    conn: Conn,
    doctor_id: Annotated[int, Query(alias="doctorId", ge=1)],
    clinic_id: Annotated[int, Query(alias="clinicId", ge=1)],
    day: Annotated[date, Query(alias="date")],
) -> list[int]:
    """Slots already taken through the app on this exact date (any patient)."""
    await _release_stale_holds(conn, doctor_id=doctor_id, clinic_id=clinic_id, appointment_date=day)
    rows = await conn.scalars(
        select(appointments.c.slot_index).where(
            appointments.c.doctor_id == doctor_id,
            appointments.c.clinic_id == clinic_id,
            appointments.c.appointment_date == day,
            appointments.c.slot_lock.is_not(None),
        )
    )
    return sorted(set(rows))


@router.post("/appointments", response_model=AppointmentOut, status_code=status.HTTP_201_CREATED, response_model_by_alias=True)
async def create_appointment(body: AppointmentCreate, user_id: UserId, conn: Conn) -> AppointmentOut:
    consultation_id = body.consultation_id
    if consultation_id:
        owner = await conn.scalar(select(consultations.c.user_id).where(consultations.c.id == consultation_id))
        if owner != user_id:
            consultation_id = None
    lock = _slot_lock(body.doctor_id, body.clinic_id, body.appointment_date, body.slot_index)
    await _release_stale_holds(conn, slot_lock=lock)
    now = utcnow()
    appointment_id = str(uuid.uuid4())
    try:
        async with conn.begin_nested():
            await conn.execute(
                insert(appointments).values(
                    id=appointment_id,
                    user_id=user_id,
                    consultation_id=consultation_id,
                    doctor_id=body.doctor_id,
                    doctor_name=body.doctor_name,
                    specialization=body.specialization,
                    clinic_id=body.clinic_id,
                    clinic_name=body.clinic_name,
                    clinic_address=body.clinic_address,
                    appointment_date=body.appointment_date,
                    slot_index=body.slot_index,
                    start_time=body.start_time,
                    end_time=body.end_time,
                    time_zone=body.time_zone,
                    status="pending",
                    slot_lock=lock,
                    created_at=now,
                    updated_at=now,
                )
            )
    except IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="That time slot has just been booked. Please choose another.")
    row = (await conn.execute(select(appointments).where(appointments.c.id == appointment_id))).one()
    return _appointment_out(row)


@router.patch("/appointments/{appointment_id}", response_model=AppointmentOut, response_model_by_alias=True)
async def update_appointment(appointment_id: str, body: AppointmentUpdate, user_id: UserId, conn: Conn) -> AppointmentOut:
    row = (
        await conn.execute(
            select(appointments).where(appointments.c.id == appointment_id, appointments.c.user_id == user_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Appointment not found.")
    values: dict = {"status": body.status, "updated_at": utcnow()}
    if row.status == "cancelled" and body.status != "cancelled":
        raise HTTPException(status.HTTP_409_CONFLICT, detail="This appointment was cancelled.")
    if row.slot_lock is None and body.status in {"pending", "confirmed"}:
        # A failed booking that the scheduler retried successfully: take the slot back if it's still free.
        values["slot_lock"] = _slot_lock(row.doctor_id, row.clinic_id, row.appointment_date, row.slot_index)
    if body.calendar_link is not None:
        values["calendar_link"] = body.calendar_link
    if body.status in {"failed", "cancelled"}:
        values["slot_lock"] = None  # free the slot
    try:
        async with conn.begin_nested():
            await conn.execute(update(appointments).where(appointments.c.id == appointment_id).values(**values))
    except IntegrityError:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="That time slot has since been booked by someone else.")
    row = (await conn.execute(select(appointments).where(appointments.c.id == appointment_id))).one()
    return _appointment_out(row)
