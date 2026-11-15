"""Model usage and cost per request (issue #44). No real network calls."""

import json
import logging

import httpx
import pytest
from fastapi.testclient import TestClient
from openai import AsyncOpenAI

from backend.app import observability, timeouts
from backend.app.config import Settings
from backend.app.explain import model_explainer
from backend.app.main import create_app

PRICES = {
    "text-model": {"input_per_1m": 1.0, "output_per_1m": 4.0},
    "stt-model": {"per_minute": 0.006},
}


@pytest.fixture(scope="module", autouse=True)
def _pool():
    yield
    timeouts.shutdown()


@pytest.fixture(autouse=True)
def prices(monkeypatch):
    monkeypatch.setattr(observability, "_prices", lambda: PRICES)
    observability.reset()


def fake_openai(handler) -> AsyncOpenAI:
    return AsyncOpenAI(
        api_key="test",
        base_url="http://model.test/v1",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        max_retries=0,
    )


def chat_reply(content: dict, prompt=1200, completion=30):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={
            "id": "c1", "object": "chat.completion", "created": 0, "model": "text-model",
            "choices": [{"index": 0, "finish_reason": "stop",
                         "message": {"role": "assistant", "content": json.dumps(content)}}],
            "usage": {"prompt_tokens": prompt, "completion_tokens": completion,
                      "total_tokens": prompt + completion},
        })
    return handler


def test_cost_formula():
    assert observability.cost_usd("text-model", 1_000_000, 0) == 1.0
    assert observability.cost_usd("text-model", 1000, 500) == pytest.approx(0.001 + 0.002)
    assert observability.cost_usd("stt-model", 0, 0, audio_seconds=30) == pytest.approx(0.003)
    assert observability.cost_usd("unknown-model", 100, 100) is None


def test_record_outside_a_request_is_a_no_op():
    observability.record_model_call("text-model", 10, 10)  # must not raise


def test_study_step_check_logs_model_tokens_and_cost(caplog):
    settings = Settings(
        _env_file=None, openai_api_key="test", model_vision="v",
        model_text="text-model", model_stt="stt-model",
    )
    seen = []

    def handler(request):
        seen.append(json.loads(request.content))
        return chat_reply({"explanation": "Both sides were divided by 2."})(request)

    explainer = model_explainer(settings, client=fake_openai(handler))
    app = create_app(settings, warm_cas=False, explainer=explainer)
    caplog.set_level(logging.INFO, logger="glance.requests")
    with TestClient(app) as c:
        r = c.post("/api/diff", json={"from_latex": "2x = 8", "to_latex": "x = 4", "mode": "study"})

    assert r.json()["message"] == "Both sides were divided by 2."
    # strict structured output against schemas/explain.json
    fmt = seen[0]["response_format"]
    assert fmt["type"] == "json_schema" and fmt["json_schema"]["strict"] is True
    assert seen[0]["model"] == "text-model"

    [rec] = [json.loads(x.message) for x in caplog.records if x.name == "glance.requests"]
    assert rec["model"] == "text-model"
    assert (rec["tokens_in"], rec["tokens_out"]) == (1200, 30)
    assert rec["cost_usd"] == pytest.approx(1200 / 1e6 + 30 * 4 / 1e6)


def test_hinting_explanation_from_model_is_dropped():
    settings = Settings(
        _env_file=None, openai_api_key="test", model_vision="v",
        model_text="text-model", model_stt="stt-model",
    )
    hint = chat_reply({"explanation": "Divide by 2. Next, check x = 4."})
    app = create_app(settings, warm_cas=False, explainer=model_explainer(settings, client=fake_openai(hint)))
    with TestClient(app) as c:
        r = c.post("/api/diff", json={"from_latex": "2x = 8", "to_latex": "x = 4", "mode": "study"})
    assert r.json()["message"] == "This step checks out."


def test_transcription_usage_by_duration_and_tokens():
    async def run():
        rec = {"model": None, "tokens_in": 0, "tokens_out": 0, "cost_usd": None}
        token = observability._current.set(rec)
        try:
            def handler(request):
                return httpx.Response(200, json={
                    "text": "two x equals eight",
                    "usage": {"type": "duration", "seconds": 12},
                })
            client = observability.instrument_openai(fake_openai(handler))
            out = await client.audio.transcriptions.create(
                model="stt-model", file=("a.webm", b"\x1a\x45\xdf\xa3", "audio/webm")
            )
        finally:
            observability._current.reset(token)
        return out, rec

    import asyncio
    out, rec = asyncio.run(run())
    assert out.text == "two x equals eight"
    assert rec["model"] == "stt-model"
    assert rec["cost_usd"] == pytest.approx(12 * 0.006 / 60)


def test_instrument_is_idempotent():
    client = fake_openai(chat_reply({}))
    first = client.chat.completions.create
    observability.instrument_openai(client)
    wrapped = client.chat.completions.create
    observability.instrument_openai(client)
    assert client.chat.completions.create is wrapped is not first


def test_unit_economics_from_window():
    paths = {
        "/api/capture": {"cost_usd_per_request": 0.004},
        "/api/transcribe": {"cost_usd_per_request": 0.001},
        "/api/spoken-to-latex": {"cost_usd_per_request": 0.0005},
    }
    ue = observability.unit_economics(paths)
    assert ue["cost_per_page_usd"] == 0.004
    assert ue["cost_per_spoken_line_usd"] == pytest.approx(0.0015)
    assert ue["cost_per_step_explanation_usd"] is None
