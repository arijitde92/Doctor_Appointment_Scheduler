from __future__ import annotations

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from backend.app_api import db
from backend.app_api.routes import router

PASSWORD = "Str0ng!Pass"


@pytest_asyncio.fixture
async def client(tmp_path):
    engine = db.make_engine(f"sqlite+aiosqlite:///{(tmp_path / 'app.db').as_posix()}")
    db.set_engine(engine)
    await db.init_db()
    app = FastAPI()
    app.include_router(router)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    await engine.dispose()
    db.set_engine(None)  # type: ignore[arg-type]


def registration(**overrides):
    body = {
        "firstName": "Asha",
        "lastName": "Roy",
        "phone": "+91 98300 12345",
        "email": "Asha.Roy@example.com",
        "address": "12 Park Street, Kolkata 700016",
        "dateOfBirth": "1990-04-02",
        "password": PASSWORD,
        "confirmPassword": PASSWORD,
    }
    body.update(overrides)
    return body


@pytest.fixture
def register(client):
    async def _register(**overrides):
        res = await client.post("/app-api/auth/register", json=registration(**overrides))
        assert res.status_code == 201, res.text
        return res.json()

    return _register
