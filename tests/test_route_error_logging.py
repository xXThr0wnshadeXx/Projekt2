"""Error codes reach the request log even when a route builds its own response."""

import json
import logging

import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.testclient import TestClient

from backend.app import observability
from backend.app.errors import install_error_handlers


@pytest.fixture
def client():
    app = FastAPI()
    install_error_handlers(app)
    app.add_middleware(observability.RequestLogMiddleware)

    @app.post("/api/spoken-to-latex")
    async def spoken(body: dict):
        return JSONResponse(status_code=422, content={"error": {
            "code": "UNPARSEABLE", "message": f"echo {body.get('text')}"}})

    @app.post("/api/transcribe")
    async def transcribe():
        return JSONResponse(status_code=400, content={"error": {"code": "SECRET 2x+3", "message": "x"}})

    @app.post("/api/capture")
    async def capture():
        return PlainTextResponse("nope", status_code=502)

    @app.post("/api/command")
    async def command():
        return JSONResponse(status_code=200, content={"error": {"code": "BAD_INPUT"}})

    with TestClient(app) as c:
        yield c


def last(caplog):
    return [json.loads(r.message) for r in caplog.records if r.name == "glance.requests"][-1]


def test_route_built_error_response_logs_its_code(client, caplog):
    caplog.set_level(logging.INFO, logger="glance.requests")
    client.post("/api/spoken-to-latex", json={"text": "17y = 987654321"})
    rec = last(caplog)
    assert (rec["status"], rec["error"]) == (422, "UNPARSEABLE")
    assert "987654321" not in "\n".join(r.getMessage() for r in caplog.records if r.name != "httpx")


def test_unknown_code_is_not_logged(client, caplog):
    caplog.set_level(logging.INFO, logger="glance.requests")
    client.post("/api/transcribe")
    assert last(caplog)["error"] is None


def test_non_json_error_and_success_bodies_are_ignored(client, caplog):
    caplog.set_level(logging.INFO, logger="glance.requests")
    client.post("/api/capture")
    assert last(caplog)["error"] is None
    client.post("/api/command")
    assert last(caplog)["error"] is None  # 200: never parsed


@pytest.mark.parametrize("body, code", [
    (b'{"error":{"code":"TIMEOUT","message":"m"}}', "TIMEOUT"),
    (b'{"error":{"code":"MADE_UP"}}', None),
    (b'{"error":"flat"}', None),
    (b"not json", None),
    (b"", None),
])
def test_error_code_from_body(body, code):
    assert observability.error_code_from_body(body) == code
