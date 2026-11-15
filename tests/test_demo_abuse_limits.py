"""Issue #209: one visitor must not take the demo down or run up the bill."""

import asyncio
import io
import logging
import time

import httpx
import openai
import pypdfium2 as pdfium
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app import guards, main, openai_client, pdfpages, timeouts
from backend.app.config import Settings
from backend.app.errors import ApiError, install_error_handlers
from backend.app.mathcheck import is_parseable


def blank_pdf() -> bytes:
    doc = pdfium.PdfDocument.new()
    doc.new_page(612, 792)
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    return out.getvalue()


def hang(*_args):
    """Stands in for a render that never finishes. Top level so spawn can import it."""
    time.sleep(60)


# --- 1. a hanging PDF render --------------------------------------------------

def test_hung_pdf_render_is_killed_and_the_next_upload_succeeds(monkeypatch):
    monkeypatch.setattr(pdfpages, "RENDER_TIMEOUT_S", 1.5)
    real_count = pdfpages.page_count
    app = main.create_app(Settings(_env_file=None), warm_cas=False)
    pdf = {"pdf": ("w.pdf", blank_pdf(), "application/pdf")}

    with TestClient(app) as client:
        monkeypatch.setattr(pdfpages, "page_count", hang)
        started = time.monotonic()
        stuck = client.post("/api/pdf/pages", files=pdf, headers={"X-Forwarded-For": "10.0.0.1"})
        assert stuck.status_code == 504
        assert stuck.json()["error"]["code"] == "TIMEOUT"
        assert time.monotonic() - started < 6

        # Another visitor, straight after: no lock is held by the stuck render.
        monkeypatch.setattr(pdfpages, "page_count", real_count)
        monkeypatch.setattr(pdfpages, "RENDER_TIMEOUT_S", 20.0)  # spawning a worker is slow on Windows
        started = time.monotonic()
        ok = client.post("/api/pdf/pages", files=pdf, headers={"X-Forwarded-For": "10.0.0.2"})
        assert ok.status_code == 200, ok.text
        assert ok.json() == {"pages": 1}
        assert time.monotonic() - started < 8


# --- 2. one slow maths check --------------------------------------------------

def test_a_timeout_kills_only_the_stuck_worker():
    async def go():
        timeouts.warm_up()

        async def stuck():
            with pytest.raises(timeouts.CasTimeout):
                await timeouts.run_cas(time.sleep, 30, timeout=0.5)

        async def bystander():
            # Still running when the stuck call is killed; must not be failed with it.
            await timeouts.run_cas(time.sleep, 2.0, timeout=15)
            return True

        results = await asyncio.gather(stuck(), bystander())
        # And a normal request straight after still gets an answer.
        started = time.monotonic()
        ok = await timeouts.run_cas(is_parseable, "x = 1", timeout=20)
        return results[1], ok, time.monotonic() - started

    bystander_ok, ok, elapsed = asyncio.run(go())
    assert bystander_ok is True
    assert ok is True
    assert elapsed < 20


# --- 3. the daily model-call cap ----------------------------------------------

def test_hitting_the_cap_says_so_plainly_and_typing_still_works(monkeypatch):
    original_client = openai.AsyncOpenAI

    def respond(request):
        return httpx.Response(200, json={"choices": [{
            "index": 0, "finish_reason": "stop",
            "message": {"role": "assistant", "content": '{"latex":"x=2","confidence":0.9}'},
        }]})

    def fake_client(**kwargs):
        return original_client(
            **kwargs, http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond)),
        )

    monkeypatch.setattr(openai, "AsyncOpenAI", fake_client)
    monkeypatch.setattr(openai_client, "AsyncOpenAI", fake_client)
    app = main.create_app(Settings(
        _env_file=None, openai_api_key="test-value", model_vision="v", model_text="t",
        model_stt="s", model_call_limit=1, model_call_window_seconds=86400,
    ), warm_cas=False)

    with TestClient(app, raise_server_exceptions=False) as client:
        first = client.post("/api/spoken-to-latex", json={"text": "x equals two"})
        assert first.status_code != 429
        capped = client.post("/api/spoken-to-latex", json={"text": "x equals two"})
        assert capped.status_code == 429
        body = capped.json()["error"]
        assert body["code"] == "RATE_LIMITED"
        assert "typing" in body["message"] and "allowance" in body["message"]
        assert int(capped.headers["Retry-After"]) > 0
        # Non-model routes keep working.
        assert client.get("/api/health").status_code == 200
        assert client.post("/api/validate", json={"latex": "2x = 8"}).json() == {"valid": True}


# --- 4. which paths get the strict limit ---------------------------------------

@pytest.mark.parametrize("path", ["/api/diff", "/api/pdf/pages", "/api/pdf/page"])
def test_cost_bearing_paths_get_the_model_budget(path):
    assert path in guards.MODEL_PATHS


# --- 5. production startup checks ----------------------------------------------

def test_production_refuses_to_start_without_the_proxy_setting():
    settings = Settings(_env_file=None, app_env="production", model_call_limit=2000)
    with pytest.raises(RuntimeError, match="TRUSTED_PROXY_HOPS"):
        main.create_app(settings, warm_cas=False)


def test_production_refuses_to_start_without_a_model_cap():
    settings = Settings(_env_file=None, app_env="production", trusted_proxy_hops=1)
    with pytest.raises(RuntimeError, match="MODEL_CALL_LIMIT"):
        main.create_app(settings, warm_cas=False)


def test_production_starts_with_both_and_development_needs_neither():
    main.create_app(
        Settings(_env_file=None, app_env="production", trusted_proxy_hops=1, model_call_limit=2000),
        warm_cas=False,
    )
    main.create_app(Settings(_env_file=None), warm_cas=False)


def test_render_blueprint_sets_the_production_guards():
    from pathlib import Path

    text = (Path(__file__).resolve().parents[1] / "render.yaml").read_text(encoding="utf-8")
    for key in ("APP_ENV", "TRUSTED_PROXY_HOPS", "MODEL_CALL_LIMIT"):
        assert f"key: {key}" in text


# --- 6. no student maths in the log ----------------------------------------------

def test_unexpected_error_logs_the_type_only(caplog):
    secret = r"\frac{secret_homework}{42}"
    app = FastAPI()
    install_error_handlers(app)

    @app.post("/boom")
    async def boom(body: dict):
        latex = body["latex"]  # a local that a traceback could expose
        raise ValueError(f"could not parse {latex}")

    with caplog.at_level(logging.DEBUG):
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post("/boom", json={"latex": secret})

    assert response.status_code == 500
    assert "secret_homework" not in response.text
    logged = "\n".join(
        r.getMessage() + str(r.exc_info) + (r.exc_text or "") for r in caplog.records
    )
    assert "ValueError" in logged
    assert "secret_homework" not in logged
    assert all(r.exc_info is None for r in caplog.records if r.name == "glance.errors")
