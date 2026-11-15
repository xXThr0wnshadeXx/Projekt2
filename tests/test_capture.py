from unittest.mock import AsyncMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.routes.capture import capture_router


def test_capture_preserves_transcription_and_adds_validation():
    models = AsyncMock()
    models.interpret.return_value = {
        "instructions": "Check the calculation.",
        "lines": [{"latex": "2+2=5", "confidence": 0.9, "intent_notes": ""}],
        "diagrams": [{"description": "Triangle"}],
        "warnings": [],
    }
    validate = AsyncMock(return_value=True)
    app = FastAPI()
    app.include_router(capture_router(models, validate))
    with TestClient(app) as client:
        response = client.post("/api/capture", files={"image": ("page.png", b"\x89PNG\r\n\x1a\n", "image/png")})

    assert response.status_code == 200
    assert response.json()["lines"] == [
        {"id": "L1", "latex": "2+2=5", "confidence": 0.9, "intent_notes": "", "valid": True}
    ]
    assert response.json()["diagrams"] == [{"id": "D1", "description": "Triangle"}]
    validate.assert_awaited_once_with("2+2=5")
    assert models.interpret.await_args.args[0] == "capture"


def test_capture_rejects_oversized_image_before_model_call():
    models = AsyncMock()
    app = FastAPI()
    app.include_router(capture_router(models, AsyncMock(), max_image_bytes=4))
    with TestClient(app) as client:
        response = client.post("/api/capture", files={"image": ("page.png", b"12345", "image/png")})

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "BAD_INPUT"
    models.interpret.assert_not_awaited()


def test_capture_rejects_forged_image_type_before_model_call():
    models = AsyncMock()
    app = FastAPI()
    app.include_router(capture_router(models, AsyncMock()))
    with TestClient(app) as client:
        response = client.post("/api/capture", files={
            "image": ("fake.png", b"MZ executable data", "image/png"),
        })
    assert response.status_code == 415
    models.interpret.assert_not_awaited()
