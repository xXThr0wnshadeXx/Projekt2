from unittest.mock import AsyncMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.routes.capture import capture_router

# Real signatures: the route decides the type from the bytes, not from the
# content type the client declared (issue #79.4).
PNG = bytes.fromhex("89504e470d0a1a0a") + b"0" * 32
PDF = b"%PDF-1.7" + b"0" * 32
WINDOWS_EXE = b"MZ" + b"0" * 32


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
        response = client.post("/api/capture", files={"image": ("page.png", PNG, "image/png")})

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
        response = client.post("/api/capture", files={"image": ("page.png", PNG, "image/png")})

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "BAD_INPUT"
    models.interpret.assert_not_awaited()


def test_capture_judges_the_bytes_not_the_declared_type():
    """Issue #79.4.

    The content type is a string the client chose. Trusting it meant bytes of a
    Windows program labelled `image/png` were forwarded to the paid vision
    model.
    """
    models = AsyncMock()
    app = FastAPI()
    app.include_router(capture_router(models, AsyncMock()))

    with TestClient(app) as client:
        response = client.post("/api/capture", files={
            "image": ("page.png", WINDOWS_EXE, "image/png"),
        })

    assert response.status_code == 415
    assert response.json()["error"]["code"] == "BAD_INPUT"
    models.interpret.assert_not_awaited()


def test_capture_explains_that_pdf_is_not_ready_yet():
    """A PDF page has to be rasterised before a vision model can read it (#26)."""
    models = AsyncMock()
    app = FastAPI()
    app.include_router(capture_router(models, AsyncMock()))

    with TestClient(app) as client:
        response = client.post("/api/capture", files={
            "image": ("page.pdf", PDF, "application/pdf"),
        })

    assert response.status_code == 400
    assert "PDF support is coming" in response.json()["error"]["message"]
    models.interpret.assert_not_awaited()


def test_capture_sends_the_sniffed_type_in_the_data_url():
    """A data URL carrying the wrong type would be read wrongly upstream."""
    models = AsyncMock()
    models.interpret.return_value = {
        "instructions": "", "lines": [], "diagrams": [], "warnings": [],
    }
    app = FastAPI()
    app.include_router(capture_router(models, AsyncMock(return_value=True)))

    with TestClient(app) as client:
        # Declared as WebP, actually a PNG.
        client.post("/api/capture", files={"image": ("page.webp", PNG, "image/webp")})

    sent = models.interpret.await_args.args[1][1]["content"][1]["image_url"]["url"]
    assert sent.startswith("data:image/png;base64,")
