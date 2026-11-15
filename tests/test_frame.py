"""POST /api/frame: where is the worksheet in the camera frame? (issue #242)."""

from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app import guards
from backend.app.openai_client import ModelError, load_schema
from backend.app.prompts import FRAME_PROMPT
from backend.app.routes.frame import GUIDANCE, frame_router

JPEG = bytes.fromhex("ffd8ffe000104a464946") + b"0" * 64
PNG = bytes.fromhex("89504e470d0a1a0a") + b"0" * 32
JPEG_HEADERS = {"Content-Type": "image/jpeg"}


def client(models):
    app = FastAPI()
    app.include_router(frame_router(models))
    return TestClient(app)


def test_returns_the_models_guidance_and_reason():
    models = AsyncMock()
    models.interpret.return_value = {"guidance": "move-left", "reason": " page cut off at the left "}
    r = client(models).post("/api/frame", content=JPEG, headers=JPEG_HEADERS)
    assert r.status_code == 200
    assert r.json() == {"guidance": "move-left", "reason": "page cut off at the left"}


def test_asks_the_vision_task_with_a_framing_only_prompt():
    models = AsyncMock()
    models.interpret.return_value = {"guidance": "good", "reason": None}
    client(models).post("/api/frame", content=JPEG, headers=JPEG_HEADERS)
    task, messages = models.interpret.await_args.args
    assert task == "frame"
    assert messages[0]["content"] == FRAME_PROMPT
    assert "Never read" in FRAME_PROMPT and "solve" in FRAME_PROMPT
    image = messages[1]["content"][1]["image_url"]["url"]
    assert image.startswith("data:image/jpeg;base64,")


def test_every_guidance_value_is_in_the_schema_and_the_prompt():
    assert tuple(load_schema("frame")["properties"]["guidance"]["enum"]) == GUIDANCE
    for value in GUIDANCE:
        assert f"- {value}:" in FRAME_PROMPT


def test_a_blank_reason_is_null():
    models = AsyncMock()
    models.interpret.return_value = {"guidance": "good", "reason": "   "}
    assert client(models).post("/api/frame", content=JPEG, headers=JPEG_HEADERS).json()["reason"] is None


def test_an_invented_guidance_value_is_a_model_error():
    models = AsyncMock()
    models.interpret.return_value = {"guidance": "the answer is 4", "reason": None}
    r = client(models).post("/api/frame", content=JPEG, headers=JPEG_HEADERS)
    assert r.status_code == 502 and r.json()["error"]["code"] == "MODEL_ERROR"


def test_model_failure_is_a_friendly_502():
    models = AsyncMock()
    models.interpret.side_effect = ModelError("down")
    r = client(models).post("/api/frame", content=JPEG, headers=JPEG_HEADERS)
    assert r.status_code == 502
    assert r.json()["error"]["code"] == "MODEL_ERROR"
    assert "Take the photo" in r.json()["error"]["message"]


@pytest.mark.parametrize("body, status", [
    pytest.param(b"", 400, id="empty"),
    pytest.param(b"not an image" * 4, 415, id="not-an-image"),
    pytest.param(PNG, 400, id="png"),
    pytest.param(JPEG + b"0" * guards.FRAME_MAX_BYTES, 413, id="too-large"),
])
def test_bad_frames_never_reach_the_model(body, status):
    models = AsyncMock()
    r = client(models).post("/api/frame", content=body, headers=JPEG_HEADERS)
    assert r.status_code == status
    models.interpret.assert_not_awaited()


def test_the_image_is_never_logged(caplog):
    models = AsyncMock()
    models.interpret.return_value = {"guidance": "good", "reason": None}
    with caplog.at_level("DEBUG"):
        client(models).post("/api/frame", content=JPEG, headers=JPEG_HEADERS)
    assert "base64" not in caplog.text and "ffd8" not in caplog.text.lower()


def test_frames_have_their_own_rate_limit_and_body_cap():
    async def app(scope, receive, send):
        pass

    limiter = guards.RateLimitMiddleware(
        app, model_budget=guards.Budget(1, 60), frame_budget=guards.Budget(3, 60)
    )
    assert limiter.check("1.1.1.1", "/api/capture") == 0
    assert limiter.check("1.1.1.1", "/api/capture") > 0
    # Frames are counted apart from captures.
    assert [limiter.check("1.1.1.1", "/api/frame") for _ in range(3)] == [0, 0, 0]
    assert limiter.check("1.1.1.1", "/api/frame") > 0
    body = guards.BodyLimitMiddleware(app, max_image_bytes=8 * 1024 * 1024, max_audio_seconds=30)
    assert body.limit_for("/api/frame") == guards.FRAME_MAX_BYTES
