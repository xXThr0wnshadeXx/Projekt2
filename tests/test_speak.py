"""The app's natural voice — issue #182."""

import logging
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.openai_client import ModelClient, ModelError, ModelSettings, SPEAK_STYLE
from backend.app.routes.speak import speak_router


def client_for(models):
    app = FastAPI()
    app.include_router(speak_router(models))
    return TestClient(app)


def test_speaks_text_as_mp3():
    models = AsyncMock()
    models.speak.return_value = b"ID3fake-mp3"
    with client_for(models) as client:
        response = client.post("/api/speak", json={"text": "Saved as line 1.", "voice": "sage", "speed": 0.9})
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.content == b"ID3fake-mp3"
    models.speak.assert_awaited_once_with("Saved as line 1.", "sage", 0.9)


@pytest.mark.parametrize("body", [
    {"text": ""},
    {"text": "x" * 601},
    {"text": "hello", "voice": "someone-else"},
    {"text": "hello", "speed": 4},
])
def test_rejects_empty_long_or_unexpected_requests(body):
    models = AsyncMock()
    with client_for(models) as client:
        response = client.post("/api/speak", json=body)
    assert response.status_code in (400, 422)
    models.speak.assert_not_awaited()


def test_a_failed_voice_is_a_clear_error_not_a_crash():
    models = AsyncMock()
    models.speak.side_effect = ModelError("down")
    with client_for(models) as client:
        response = client.post("/api/speak", json={"text": "hello"})
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "MODEL_ERROR"


def settings(model_tts):
    return ModelSettings(openai_api_key="sk-test", model_vision="v", model_text="t",
                         model_stt="s", model_tts=model_tts)


@pytest.mark.asyncio
async def test_model_call_uses_the_reader_style_and_never_the_shared_quota(caplog):
    quota = MagicMock()
    client = ModelClient(settings("gpt-4o-mini-tts"), quota=quota)
    create = AsyncMock(return_value=MagicMock(content=b"mp3"))
    client.client = MagicMock()
    client.client.audio.speech.create = create
    with caplog.at_level(logging.DEBUG):
        audio = await client.speak("the square root of x plus 1", "coral", 1.0)
    assert audio == b"mp3"
    kwargs = create.call_args.kwargs
    assert kwargs["model"] == "gpt-4o-mini-tts"
    assert kwargs["input"] == "the square root of x plus 1"
    assert kwargs["instructions"] == SPEAK_STYLE
    quota.acquire.assert_not_called()
    assert "square root" not in caplog.text


@pytest.mark.asyncio
async def test_without_a_speech_model_it_refuses():
    client = ModelClient(settings(""))
    with pytest.raises(ModelError):
        await client.speak("hello", "coral", 1.0)


def test_the_app_offers_the_voice_only_when_a_speech_model_is_set(monkeypatch):
    from backend.app import main
    from backend.app.config import Settings

    models = AsyncMock()
    models.speak.return_value = b"mp3"
    monkeypatch.setattr(main, "ModelClient", lambda settings, **kwargs: models)
    monkeypatch.setattr(main.observability, "instrument_openai", lambda client: None)
    base = dict(_env_file=None, openai_api_key="test-value",
                model_vision="vision", model_text="text", model_stt="speech")

    with TestClient(main.create_app(Settings(**base, model_tts="tts"))) as client:
        assert client.get("/api/health").json() == {"ok": True, "voice": True}
        assert client.post("/api/speak", json={"text": "hello"}).status_code == 200

    with TestClient(main.create_app(Settings(**base))) as client:
        assert client.get("/api/health").json() == {"ok": True, "voice": False}
        assert client.post("/api/speak", json={"text": "hello"}).status_code == 404
