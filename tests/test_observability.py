"""Request logging and live stats (issues #53, #44, #33)."""

import json
import logging

import pytest
from fastapi.testclient import TestClient

from backend.app import observability, timeouts
from backend.app.config import Settings
from backend.app.main import create_app

TOKEN = "stats-test-value"


@pytest.fixture(scope="module", autouse=True)
def _pool():
    yield
    timeouts.shutdown()


@pytest.fixture
def client():
    observability.reset()
    app = create_app(Settings(_env_file=None, stats_token=TOKEN), warm_cas=False)

    @app.get("/api/_boom")
    async def boom():
        raise RuntimeError("secret internals")

    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def records(caplog):
    return [json.loads(r.message) for r in caplog.records if r.name == "glance.requests"]


def test_one_structured_line_per_request(client, caplog):
    caplog.set_level(logging.INFO, logger="glance.requests")
    client.get("/api/health")
    [rec] = records(caplog)
    assert rec["path"] == "/api/health"
    assert rec["status"] == 200
    assert rec["error"] is None
    assert rec["ms"] >= 0
    assert set(rec) == {
        "evt", "path", "method", "status", "ms", "error",
        "model", "tokens_in", "tokens_out", "cost_usd",
    }


def test_no_student_content_is_logged(client, caplog):
    caplog.set_level(logging.INFO)
    secret_line = "17y + 42 = 987654321"
    client.post("/api/diff", json={"from_latex": secret_line, "to_latex": "y = 3", "mode": "study"})
    client.get("/api/health?student=alice")
    # httpx is the test client's own log, not the server's.
    text = "\n".join(r.getMessage() for r in caplog.records if r.name != "httpx")
    assert "17y" not in text and "987654321" not in text
    assert "alice" not in text


def test_error_code_is_logged(client, caplog):
    caplog.set_level(logging.INFO, logger="glance.requests")
    client.post("/api/diff", json={"from_latex": "x", "to_latex": "x", "mode": "exam"})
    [rec] = records(caplog)
    assert rec["status"] == 403
    assert rec["error"] == "MODE_DISABLED"


def test_unhandled_exception_logged_as_internal_without_trace(client, caplog):
    caplog.set_level(logging.INFO, logger="glance.requests")
    r = client.get("/api/_boom")
    assert r.status_code == 500
    assert r.json()["error"]["code"] == "INTERNAL"
    assert "secret internals" not in r.text
    [rec] = records(caplog)
    assert rec["error"] == "INTERNAL" and rec["status"] == 500


def test_unhandled_error_logs_no_student_latex(client, caplog):
    caplog.set_level(logging.ERROR, logger="glance.errors")
    app = create_app(Settings(_env_file=None), warm_cas=False)

    @app.get("/api/_latex_boom")
    async def latex_boom():
        raise RuntimeError(r"\\frac{x}{2}")

    with TestClient(app, raise_server_exceptions=False) as c:
        assert c.get("/api/_latex_boom").status_code == 500
    assert "frac" not in caplog.text


def test_unknown_paths_are_not_echoed_into_logs(client, caplog):
    caplog.set_level(logging.INFO, logger="glance.requests")
    client.get("/api/<script>")
    [rec] = records(caplog)
    assert rec["path"] == "other"


def test_stats_needs_the_token(client):
    assert client.get("/api/stats").status_code == 404
    assert client.get("/api/stats", headers={"X-Stats-Token": "nope"}).status_code == 404


def test_stats_summarises_latency_and_errors(client):
    for _ in range(3):
        client.post("/api/diff", json={"from_latex": "2x = 8", "to_latex": "x = 4", "mode": "homework"})
    client.post("/api/diff", json={"from_latex": "x", "to_latex": "x", "mode": "exam"})
    body = client.get("/api/stats", headers={"X-Stats-Token": TOKEN}).json()
    diff = body["paths"]["/api/diff"]
    assert diff["count"] == 4
    assert diff["errors"] == 1
    assert diff["p50_ms"] is not None and diff["p90_ms"] >= diff["p50_ms"]


def test_stats_disabled_without_token_configured():
    app = create_app(Settings(_env_file=None), warm_cas=False)
    with TestClient(app) as c:
        assert c.get("/api/stats", headers={"X-Stats-Token": ""}).status_code == 404


def test_percentile():
    assert observability._percentile([], 0.5) is None
    assert observability._percentile([5, 1, 3, 2, 4], 0.5) == 3
    assert observability._percentile(list(range(1, 11)), 0.9) == 9
