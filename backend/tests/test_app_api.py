from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from google.adk.events.event import Event
from google.genai import types
from sqlalchemy import inspect, text, update

from backend.app_api import db
from backend.app_api.log_plugin import rows_for_event
from backend.app_api.models import auth_sessions
from backend.app_api.routes import utcnow

from .conftest import PASSWORD, registration


# ── Registration ────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "password",
    ["Sh0rt!a", "alllower1!", "ALLUPPER1!", "NoDigits!!", "NoSpecial11"],
)
async def test_register_rejects_weak_passwords(client, password):
    res = await client.post(
        "/app-api/auth/register", json=registration(password=password, confirmPassword=password)
    )
    assert res.status_code == 422


async def test_register_rejects_mismatched_confirmation(client):
    res = await client.post("/app-api/auth/register", json=registration(confirmPassword=PASSWORD + "x"))
    assert res.status_code == 422
    assert "do not match" in res.text


async def test_register_rejects_future_dob_and_bad_phone(client):
    future = (date.today() + timedelta(days=1)).isoformat()
    assert (await client.post("/app-api/auth/register", json=registration(dateOfBirth=future))).status_code == 422
    assert (await client.post("/app-api/auth/register", json=registration(phone="12ab"))).status_code == 422


async def test_register_creates_user_and_session(register):
    body = await register()
    assert body["token"]
    assert body["user"]["email"] == "asha.roy@example.com"
    assert body["user"]["phone"] == "+919830012345"
    assert "passwordHash" not in body["user"]


async def test_register_duplicate_email(client, register):
    await register()
    res = await client.post("/app-api/auth/register", json=registration(email="ASHA.ROY@example.com"))
    assert res.status_code == 409


# ── Login / session / logout ────────────────────────────────────────────────


async def test_login_and_session_lookup(client, register):
    await register()
    bad = await client.post("/app-api/auth/login", json={"email": "asha.roy@example.com", "password": "wrong"})
    assert bad.status_code == 401
    unknown = await client.post("/app-api/auth/login", json={"email": "nobody@example.com", "password": PASSWORD})
    assert unknown.status_code == 401

    ok = await client.post("/app-api/auth/login", json={"email": " Asha.Roy@example.com ", "password": PASSWORD})
    assert ok.status_code == 200
    token = ok.json()["token"]
    me = await client.get("/app-api/auth/session", headers={"X-Session-Token": token})
    assert me.status_code == 200
    assert me.json()["user"]["firstName"] == "Asha"


async def test_logout_revokes_token(client, register):
    token = (await register())["token"]
    assert (await client.post("/app-api/auth/logout", headers={"X-Session-Token": token})).status_code == 204
    assert (await client.get("/app-api/auth/session", headers={"X-Session-Token": token})).status_code == 401


async def test_idle_session_expires(client, register):
    body = await register()
    async with db.get_engine().begin() as conn:
        await conn.execute(
            update(auth_sessions)
            .where(auth_sessions.c.id == body["authSessionId"])
            .values(last_seen_at=utcnow() - timedelta(hours=3))
        )
    res = await client.get("/app-api/auth/session", headers={"X-Session-Token": body["token"]})
    assert res.status_code == 401


# ── Appointments ────────────────────────────────────────────────────────────


def appointment(**overrides):
    body = {
        "doctorId": 7,
        "doctorName": "Anita Sen",
        "specialization": "Cardiologist",
        "clinicId": 3,
        "clinicName": "City Heart Clinic",
        "clinicAddress": "1 Lake Road",
        "appointmentDate": (date.today() + timedelta(days=3)).isoformat(),
        "slotIndex": 2,
        "startTime": "12:00 PM",
        "endTime": "1:00 PM",
    }
    body.update(overrides)
    return body


async def test_appointments_prevent_double_booking_and_scope_by_user(client, register):
    a = (await register())["user"]["id"]
    b = (await register(email="b@example.com"))["user"]["id"]

    created = await client.post("/app-api/appointments", json=appointment(), headers={"X-User-Id": a})
    assert created.status_code == 201, created.text
    appt = created.json()
    assert appt["status"] == "pending"

    clash = await client.post("/app-api/appointments", json=appointment(), headers={"X-User-Id": b})
    assert clash.status_code == 409

    slots = await client.get(
        "/app-api/appointments/booked-slots",
        params={"doctorId": 7, "clinicId": 3, "date": appointment()["appointmentDate"]},
        headers={"X-User-Id": b},
    )
    assert slots.json() == [2]

    # B can neither see nor modify A's appointment.
    assert (await client.get("/app-api/appointments", headers={"X-User-Id": b})).json() == []
    other = await client.patch(f"/app-api/appointments/{appt['id']}", json={"status": "cancelled"}, headers={"X-User-Id": b})
    assert other.status_code == 404

    # A failed booking frees the slot.
    failed = await client.patch(f"/app-api/appointments/{appt['id']}", json={"status": "failed"}, headers={"X-User-Id": a})
    assert failed.json()["status"] == "failed"
    retry = await client.post("/app-api/appointments", json=appointment(), headers={"X-User-Id": b})
    assert retry.status_code == 201


async def test_appointment_in_past_rejected(client, register):
    a = (await register())["user"]["id"]
    past = (date.today() - timedelta(days=1)).isoformat()
    res = await client.post("/app-api/appointments", json=appointment(appointmentDate=past), headers={"X-User-Id": a})
    assert res.status_code == 422


async def test_appointment_stores_clinic_time_zone(client, register):
    a = (await register())["user"]["id"]
    res = await client.post("/app-api/appointments", json=appointment(timeZone="Europe/Paris"), headers={"X-User-Id": a})
    assert res.status_code == 201, res.text
    assert res.json()["timeZone"] == "Europe/Paris"
    listed = (await client.get("/app-api/appointments", headers={"X-User-Id": a})).json()
    assert listed[0]["timeZone"] == "Europe/Paris"
    # Older clients that send no time zone still work.
    legacy = await client.post("/app-api/appointments", json=appointment(slotIndex=3), headers={"X-User-Id": a})
    assert legacy.status_code == 201 and legacy.json()["timeZone"] is None


async def test_appointment_rejects_unknown_time_zone(client, register):
    a = (await register())["user"]["id"]
    res = await client.post("/app-api/appointments", json=appointment(timeZone="Mars/Olympus"), headers={"X-User-Id": a})
    assert res.status_code == 422


async def test_past_check_uses_the_clinic_time_zone(client, register):
    a = (await register())["user"]["id"]
    # Kiritimati is UTC+14 and Pago Pago UTC-11: "today" there can differ from the server's date.
    ahead = datetime.now(ZoneInfo("Pacific/Kiritimati")).date()
    behind = datetime.now(ZoneInfo("Pacific/Pago_Pago")).date()
    yesterday_ahead = appointment(appointmentDate=(ahead - timedelta(days=1)).isoformat(), timeZone="Pacific/Kiritimati")
    today_behind = appointment(appointmentDate=behind.isoformat(), timeZone="Pacific/Pago_Pago", slotIndex=5)
    assert (await client.post("/app-api/appointments", json=yesterday_ahead, headers={"X-User-Id": a})).status_code == 422
    assert (await client.post("/app-api/appointments", json=today_behind, headers={"X-User-Id": a})).status_code == 201


async def test_init_db_adds_time_zone_to_an_existing_appointments_table(tmp_path):
    engine = db.make_engine(f"sqlite+aiosqlite:///{(tmp_path / 'old.db').as_posix()}")
    async with engine.begin() as conn:  # table as created by the first release
        await conn.execute(text("CREATE TABLE appointments (id VARCHAR(36) PRIMARY KEY, start_time VARCHAR(16))"))
    db.set_engine(engine)
    try:
        await db.init_db()
        await db.init_db()  # idempotent
        async with engine.connect() as conn:
            cols = await conn.run_sync(lambda c: {col["name"] for col in inspect(c).get_columns("appointments")})
        assert "time_zone" in cols
    finally:
        await engine.dispose()
        db.set_engine(None)  # type: ignore[arg-type]


# ── Consultations & logs ────────────────────────────────────────────────────


async def test_consultations_are_private(client, register):
    a = (await register())["user"]["id"]
    b = (await register(email="b@example.com"))["user"]["id"]
    res = await client.post("/app-api/consultations", json={"id": "sess-1"}, headers={"X-User-Id": a})
    assert res.status_code == 201
    assert (await client.post("/app-api/consultations", json={"id": "sess-1"}, headers={"X-User-Id": b})).status_code == 404
    assert (await client.get("/app-api/consultations/sess-1/messages", headers={"X-User-Id": b})).status_code == 404


async def test_log_plugin_writes_messages(client, register):
    from types import SimpleNamespace

    from backend.app_api.log_plugin import ConsultationLogPlugin

    body = await register()
    user_id = body["user"]["id"]
    await client.post("/app-api/consultations", json={"id": "sess-2"}, headers={"X-User-Id": user_id})

    ctx = SimpleNamespace(
        session=SimpleNamespace(id="sess-2", user_id=user_id, state={"auth_session_id": body["authSessionId"]}),
        invocation_id="inv-1",
    )
    plugin = ConsultationLogPlugin()
    await plugin.on_user_message_callback(
        invocation_context=ctx, user_message=types.Content(role="user", parts=[types.Part(text="Find a cardiologist")])
    )
    call = Event(
        author="doctor_matcher",
        invocation_id="inv-1",
        content=types.Content(
            role="model",
            parts=[types.Part(function_call=types.FunctionCall(name="find-doctors", args={"city": "Kolkata"}))],
        ),
    )
    reply = Event(
        author="root_agent", invocation_id="inv-1", content=types.Content(role="model", parts=[types.Part(text="Here are 3 doctors.")])
    )
    partial = Event(
        author="root_agent", invocation_id="inv-1", partial=True, content=types.Content(role="model", parts=[types.Part(text="Here")])
    )
    for event in (call, partial, reply):
        await plugin.on_event_callback(invocation_context=ctx, event=event)

    msgs = (await client.get("/app-api/consultations/sess-2/messages", headers={"X-User-Id": user_id})).json()
    assert [m["kind"] for m in msgs] == ["user", "tool_call", "agent"]
    assert msgs[1]["toolName"] == "find-doctors"

    listed = (await client.get("/app-api/consultations", headers={"X-User-Id": user_id})).json()
    assert listed[0]["title"] == "Find a cardiologist"
    assert listed[0]["messageCount"] == 3


def test_rows_for_event_skips_partial_and_thoughts():
    event = Event(
        author="root_agent",
        content=types.Content(role="model", parts=[types.Part(text="thinking", thought=True), types.Part(text="Hi")]),
    )
    rows = rows_for_event(event)
    assert [(r["kind"], r["content"]) for r in rows] == [("agent", "Hi")]


async def test_stale_pending_hold_is_released(client, register):
    from backend.app_api.models import appointments

    a = (await register())["user"]["id"]
    b = (await register(email="b@example.com"))["user"]["id"]
    held = (await client.post("/app-api/appointments", json=appointment(), headers={"X-User-Id": a})).json()
    async with db.get_engine().begin() as conn:
        await conn.execute(
            update(appointments).where(appointments.c.id == held["id"]).values(created_at=utcnow() - timedelta(hours=1))
        )
    res = await client.post("/app-api/appointments", json=appointment(), headers={"X-User-Id": b})
    assert res.status_code == 201
    mine = (await client.get("/app-api/appointments", headers={"X-User-Id": a})).json()
    assert mine[0]["status"] == "failed"


async def test_failed_booking_can_be_confirmed_after_retry_if_slot_still_free(client, register):
    a = (await register())["user"]["id"]
    appt = (await client.post("/app-api/appointments", json=appointment(), headers={"X-User-Id": a})).json()
    await client.patch(f"/app-api/appointments/{appt['id']}", json={"status": "failed"}, headers={"X-User-Id": a})
    ok = await client.patch(
        f"/app-api/appointments/{appt['id']}",
        json={"status": "confirmed", "calendarLink": "https://www.google.com/calendar/event?eid=x"},
        headers={"X-User-Id": a},
    )
    assert ok.status_code == 200
    assert ok.json()["status"] == "confirmed"
    # ...and it holds the slot again.
    b = (await register(email="b@example.com"))["user"]["id"]
    assert (await client.post("/app-api/appointments", json=appointment(), headers={"X-User-Id": b})).status_code == 409
