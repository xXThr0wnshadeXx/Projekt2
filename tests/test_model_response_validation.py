import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.openai_client import ModelClient, ModelError, ModelSettings
from backend.app.routes.capture import capture_router


@pytest.mark.asyncio
@pytest.mark.parametrize("task,payload", [
    ("capture", {}),
    ("capture", {"instructions": "", "lines": None, "diagrams": [], "warnings": []}),
    ("capture", {"instructions": "", "lines": [{"latex": "x", "confidence": True,
                                             "intent_notes": ""}], "diagrams": [], "warnings": []}),
    ("spoken", {"latex": "x", "ambiguous": "false", "clarifying_question": None,
                "alternatives": [], "readback": "x"}),
    ("spoken", {"latex": None, "ambiguous": True, "clarifying_question": "Which?",
                "alternatives": [{"latex": None, "readback": "x"}], "readback": None}),
    ("command", {"intent": "solve", "target_line": None, "instruction": None}),
    ("command", {"intent": "help", "target_line": None, "instruction": None, "answer": "x"}),
])
async def test_invalid_provider_shape_becomes_model_error(task, payload):
    client = ModelClient(ModelSettings(
        _env_file=None, openai_api_key="test-value", model_vision="vision",
        model_text="text", model_stt="speech",
    ))
    client.client.chat.completions.create = AsyncMock(return_value=SimpleNamespace(choices=[
        SimpleNamespace(finish_reason="stop", message=SimpleNamespace(
            refusal=None, content=json.dumps(payload),
        )),
    ]))
    try:
        with pytest.raises(ModelError, match="unreadable"):
            await client.interpret(task, [{"role": "user", "content": "x"}])
    finally:
        await client.close()


def test_malformed_capture_response_returns_retry_message():
    client = ModelClient(ModelSettings(
        _env_file=None, openai_api_key="test-value", model_vision="vision",
        model_text="text", model_stt="speech",
    ))
    client.client.chat.completions.create = AsyncMock(return_value=SimpleNamespace(choices=[
        SimpleNamespace(finish_reason="stop", message=SimpleNamespace(
            refusal=None, content='{"lines":null}',
        )),
    ]))
    validate = AsyncMock()
    app = FastAPI()
    app.include_router(capture_router(client, validate))
    with TestClient(app) as api:
        response = api.post('/api/capture', files={
            'image': ('sample.png', bytes.fromhex('89504e470d0a1a0a'), 'image/png'),
        })
        api.portal.call(client.close)
    assert response.status_code == 502
    assert response.json()['error']['code'] == 'MODEL_ERROR'
    validate.assert_not_awaited()
