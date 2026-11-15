import json
from unittest.mock import AsyncMock

import httpx
import pytest
from openai import AsyncOpenAI

from backend.app.openai_client import ModelClient, ModelError, ModelSettings


@pytest.fixture
def model_client(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-value")
    monkeypatch.setenv("MODEL_VISION", "test-vision")
    monkeypatch.setenv("MODEL_TEXT", "test-text")
    monkeypatch.setenv("MODEL_STT", "test-stt")
    return ModelClient(ModelSettings(_env_file=None))


@pytest.mark.asyncio
@pytest.mark.parametrize("task,model", [("capture", "test-vision"), ("spoken", "test-text")])
async def test_interpret_sends_strict_schema(model_client, task, model):
    def respond(request):
        payload = json.loads(request.content)
        assert payload["model"] == model
        schema = payload["response_format"]["json_schema"]
        assert schema["strict"] is True
        assert schema["schema"]["additionalProperties"] is False
        output = {
            "capture": {"instructions": "", "lines": [], "diagrams": [], "warnings": []},
            "spoken": {
                "latex": "x",
                "ambiguous": False,
                "clarifying_question": None,
                "alternatives": [],
                "readback": "x",
            },
        }[task]
        return httpx.Response(200, json={
            "choices": [{
                "index": 0,
                "finish_reason": "stop",
                "message": {"role": "assistant", "content": json.dumps(output)},
            }],
        })

    await model_client.close()
    model_client.client = AsyncOpenAI(
        api_key="test-value", http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond))
    )
    try:
        assert await model_client.interpret(task, [{"role": "user", "content": "x"}])
    finally:
        await model_client.close()


@pytest.mark.asyncio
async def test_interpret_rejects_empty_choices(model_client, monkeypatch):
    from types import SimpleNamespace

    create = AsyncMock(return_value=SimpleNamespace(choices=[]))
    monkeypatch.setattr(model_client.client.chat.completions, "create", create)
    try:
        with pytest.raises(ModelError):
            await model_client.interpret("spoken", [{"role": "user", "content": "x"}])
    finally:
        await model_client.close()


@pytest.mark.asyncio
async def test_transcribe_uses_configured_model_and_json(model_client, monkeypatch):
    from types import SimpleNamespace

    create = AsyncMock(return_value=SimpleNamespace(text="two x"))
    monkeypatch.setattr(model_client.client.audio.transcriptions, "create", create)
    try:
        assert await model_client.transcribe("recording.webm", b"audio", "audio/webm") == "two x"
        create.assert_awaited_once_with(
            model="test-stt",
            file=("recording.webm", b"audio", "audio/webm"),
            response_format="json",
        )
    finally:
        await model_client.close()


def test_model_calls_are_bounded(model_client):
    """Issue #79.5.

    The SDK defaults are a 600 s read timeout and two retries, so one stalled
    upstream call could hold a capture for ten minutes while the student hears
    nothing — against a 12 s hard limit in DESIGN.md 16.
    """
    assert model_client.client.timeout == 10.0
    assert model_client.client.max_retries == 1


def test_the_budget_can_be_widened_without_a_deploy(monkeypatch):
    """Settings, not constants, so it is tunable from the deploy dashboard."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-value")
    monkeypatch.setenv("MODEL_VISION", "test-vision")
    monkeypatch.setenv("MODEL_TEXT", "test-text")
    monkeypatch.setenv("MODEL_STT", "test-stt")
    monkeypatch.setenv("MODEL_TIMEOUT_SECONDS", "25")
    monkeypatch.setenv("MODEL_MAX_RETRIES", "0")

    client = ModelClient(ModelSettings(_env_file=None))
    assert client.client.timeout == 25.0
    assert client.client.max_retries == 0
