"""scripts/latency.py: budgets, verdicts and the step runners (issue #33)."""

import importlib.util
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from backend.app import timeouts
from backend.app.config import Settings
from backend.app.main import create_app

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("latency", ROOT / "scripts" / "latency.py")
latency = importlib.util.module_from_spec(spec)
sys.modules["latency"] = latency  # dataclasses look the module up by name
spec.loader.exec_module(latency)


@pytest.fixture(scope="module", autouse=True)
def _pool():
    yield
    timeouts.shutdown()


def result(name, samples, errors=None):
    r = latency.StepResult(name, samples_ms=samples)
    r.errors = errors or {}
    return r


@pytest.mark.parametrize(
    "name, samples, verdict",
    [
        ("step_check", [20.0] * 10, "ok"),
        ("step_check", [1600.0] * 10, "over target"),
        ("step_check", [100.0] * 8 + [3500.0] * 2, "OVER HARD LIMIT"),
        ("capture", [5000.0] * 5, "ok"),
        ("health", [400.0] * 5, "over target"),  # no hard limit
        ("spoken_line", [], "no data"),
    ],
)
def test_verdicts(name, samples, verdict):
    assert result(name, samples).verdict == verdict


def test_budgets_match_design_16():
    assert latency.BUDGETS["capture"] == (6000, 12000)
    assert latency.BUDGETS["spoken_line"] == (3000, 6000)
    assert latency.BUDGETS["step_check"] == (1500, 3000)
    assert latency.BUDGETS["first_load"][0] == 2000


def test_first_request_is_reported_separately():
    calls = iter([(200, 900.0), (200, 10.0), (200, 20.0), (200, 30.0)])
    r = latency.run_step("step_check", lambda: next(calls), runs=3)
    assert r.first_ms == 900.0
    assert r.samples_ms == [10.0, 20.0, 30.0]
    assert r.p50 == 20.0


def test_errors_are_counted_not_timed():
    calls = iter([(200, 5.0), (429, 1.0), (200, 6.0), (0, 30000.0)])
    r = latency.run_step("capture", lambda: next(calls), runs=3)
    assert r.samples_ms == [6.0]
    assert r.errors == {429: 1, 0: 1}
    assert "429s mean the rate limit" in latency.report([r], "x")


def test_real_app_health_and_step_check_within_budget():
    app = create_app(Settings(_env_file=None), warm_cas=True)
    args = latency.parse_args(["--runs", "6"])
    with TestClient(app) as client:
        results = latency.measure(client, args)
    by_name = {r.name: r for r in results}
    assert by_name["health"].verdict == "ok"
    assert by_name["step_check"].verdict == "ok"
    assert len(by_name["step_check"].samples_ms) == 6
    assert by_name["capture"].skipped and by_name["spoken_line"].skipped
    table = latency.report(results, "local")
    assert "| step_check | 6 |" in table


def test_capture_and_spoken_line_chain(tmp_path):
    app = FastAPI()
    seen = []

    @app.post("/api/capture")
    async def capture(request: Request):
        seen.append("capture")
        return {"lines": []}

    @app.post("/api/transcribe")
    async def transcribe():
        seen.append("transcribe")
        return {"text": "two x equals eight"}

    @app.post("/api/spoken-to-latex")
    async def spoken(body: dict):
        seen.append(("spoken", body["text"]))
        return {"latex": "2x = 8"}

    image = tmp_path / "page.png"
    image.write_bytes(b"\x89PNG\r\n\x1a\n")
    audio = tmp_path / "line.webm"
    audio.write_bytes(b"\x1a\x45\xdf\xa3")
    args = latency.parse_args([
        "--runs", "1", "--model-runs", "2", "--pause", "0",
        "--image", str(image), "--audio", str(audio),
    ])
    with TestClient(app) as client:
        results = {r.name: r for r in latency.measure(client, args)}
    assert len(results["capture"].samples_ms) == 2
    assert len(results["spoken_line"].samples_ms) == 2
    # spoken-to-latex receives the transcript, not the audio
    assert ("spoken", "two x equals eight") in seen
    # health/diff don't exist on this app: counted as errors, not crashes
    assert results["health"].errors == {404: 2}


def test_exit_code_is_1_over_hard_limit(monkeypatch, tmp_path):
    over = [result("step_check", [100.0] * 8 + [9999.0] * 2)]
    monkeypatch.setattr(latency, "measure", lambda client, args: over)
    out = tmp_path / "latency.md"
    assert latency.main(["--base", "http://unused", "--out", str(out)]) == 1
    assert "OVER HARD LIMIT" in out.read_text()
