"""Model routes log model, tokens and cost per request (issue #44).

Runs the real create_app, ModelClient and OpenAI SDK against a fake HTTP
transport, so this proves the wiring end to end without a network call.
"""

import io
import json
import logging

import av
import httpx
import pytest
from fastapi.testclient import TestClient
from openai import AsyncOpenAI

from backend.app import main, observability, openai_client
from backend.app.config import Settings

PRICES = {
    "vision-model": {"input_per_1m": 2.0, "output_per_1m": 8.0},
    "text-model": {"input_per_1m": 1.0, "output_per_1m": 4.0},
    "stt-model": {"per_minute": 0.006},
}

CAPTURE = {"instructions": "Solve for x.", "warnings": [], "diagrams": [],
           "lines": [{"latex": "2x + 3 = 11", "confidence": 0.95, "intent_notes": ""}]}
SPOKEN = {"latex": "2x = 8", "ambiguous": False, "clarifying_question": None,
          "alternatives": [], "readback": "2 x equals 8"}
USAGE = {"vision-model": (1500, 120), "text-model": (300, 40)}


def webm_clip(seconds: float = 1.0) -> bytes:
    out = io.BytesIO()
    with av.open(out, mode="w", format="webm") as media:
        stream = media.add_stream("libopus", rate=48000)
        stream.layout = "mono"
        for _ in range(int(seconds * 50)):
            frame = av.AudioFrame(format="s16", layout="mono", samples=960)
            frame.sample_rate = 48000
            frame.planes[0].update(bytes(frame.planes[0].buffer_size))
            media.mux(stream.encode(frame))
        media.mux(stream.encode(None))
    return out.getvalue()


def handler(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("/audio/transcriptions"):
        return httpx.Response(200, json={
            "text": "two x equals eight", "usage": {"type": "duration", "seconds": 20},
        })
    body = json.loads(request.content)
    model = body["model"]
    content = CAPTURE if body["response_format"]["json_schema"]["name"] == "capture" else SPOKEN
    prompt, completion = USAGE[model]
    return httpx.Response(200, json={
        "id": "c", "object": "chat.completion", "created": 0, "model": model,
        "choices": [{"index": 0, "finish_reason": "stop",
                     "message": {"role": "assistant", "content": json.dumps(content)}}],
        "usage": {"prompt_tokens": prompt, "completion_tokens": completion,
                  "total_tokens": prompt + completion},
    })


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(observability, "_prices", lambda: PRICES)
    real = AsyncOpenAI
    monkeypatch.setattr(openai_client, "AsyncOpenAI", lambda api_key: real(
        api_key=api_key, base_url="http://model.test/v1", max_retries=0,
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    ))
    observability.reset()
    settings = Settings(_env_file=None, openai_api_key="test-value",
                        model_vision="vision-model", model_text="text-model",
                        model_stt="stt-model", stats_token="stats-test")
    with TestClient(main.create_app(settings, warm_cas=False)) as c:
        yield c


def log_records(caplog):
    return {r["path"]: r for r in (json.loads(x.message) for x in caplog.records
                                   if x.name == "glance.requests")}


def test_capture_spoken_and_transcribe_log_model_tokens_and_cost(client, caplog):
    caplog.set_level(logging.INFO, logger="glance.requests")
    png = b"\x89PNG\r\n\x1a\n" + b"\0" * 32
    assert client.post("/api/capture", files={"image": ("p.png", png, "image/png")}).status_code == 200
    assert client.post("/api/spoken-to-latex", json={"text": "two x equals eight"}).status_code == 200
    r = client.post("/api/transcribe", files={"audio": ("c.webm", webm_clip(), "audio/webm")})
    assert r.status_code == 200 and r.json()["text"] == "two x equals eight"

    recs = log_records(caplog)
    cap = recs["/api/capture"]
    assert cap["model"] == "vision-model"
    assert (cap["tokens_in"], cap["tokens_out"]) == (1500, 120)
    assert cap["cost_usd"] == pytest.approx(1500 * 2 / 1e6 + 120 * 8 / 1e6)

    spk = recs["/api/spoken-to-latex"]
    assert spk["model"] == "text-model"
    assert spk["cost_usd"] == pytest.approx(300 / 1e6 + 40 * 4 / 1e6)

    stt = recs["/api/transcribe"]
    assert stt["model"] == "stt-model"
    assert stt["cost_usd"] == pytest.approx(20 * 0.006 / 60)

    # nothing a student said or wrote reaches the log
    text = "\n".join(x.getMessage() for x in caplog.records if x.name != "httpx")
    assert "2x + 3" not in text and "two x equals eight" not in text


def test_stats_reports_cost_per_page_and_per_spoken_line(client):
    png = b"\x89PNG\r\n\x1a\n" + b"\0" * 32
    client.post("/api/capture", files={"image": ("p.png", png, "image/png")})
    client.post("/api/transcribe", files={"audio": ("c.webm", webm_clip(), "audio/webm")})
    client.post("/api/spoken-to-latex", json={"text": "two x equals eight"})
    ue = client.get("/api/stats", headers={"X-Stats-Token": "stats-test"}).json()["unit_economics"]
    assert ue["cost_per_page_usd"] == pytest.approx(0.00396)
    assert ue["cost_per_spoken_line_usd"] == pytest.approx(0.002 + 0.00046)


def test_mocked_model_client_is_left_alone():
    from unittest.mock import AsyncMock

    mock = AsyncMock()
    observability.instrument_openai(mock.client)
    assert observability.instrument_openai(mock.client) is mock.client
