from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from backend.app import main
from backend.app.config import Settings

# A real PNG signature: capture decides the type from the bytes (issue #79.4).
PNG = bytes.fromhex("89504e470d0a1a0a") + b"0" * 32


def test_app_registers_model_routes_and_validates_transcriptions(monkeypatch):
    models = AsyncMock()
    models.interpret.side_effect = [
        {
            "instructions": "",
            "lines": [{"latex": "2+2=5", "confidence": 0.9, "intent_notes": ""}],
            "diagrams": [],
            "warnings": [],
        },
        {
            "latex": "x=2",
            "ambiguous": False,
            "clarifying_question": None,
            "alternatives": [],
            "readback": "x equals two",
        },
    ]
    monkeypatch.setattr(main, "ModelClient", lambda settings, **kwargs: models)
    settings = Settings(
        _env_file=None, openai_api_key="test-value",
        model_vision="vision", model_text="text", model_stt="speech",
    )
    with TestClient(main.create_app(settings)) as client:
        assert client.get("/api/health").json() == {"ok": True, "models": True}
        capture = client.post("/api/capture", files={"image": ("page.png", PNG, "image/png")})
        spoken = client.post("/api/spoken-to-latex", json={"text": "x equals two"})
        transcribe = client.post("/api/transcribe", files={"audio": ("bad.webm", b"bad", "audio/webm")})

    assert capture.status_code == 200
    assert capture.json()["lines"][0]["latex"] == "2+2=5"
    assert capture.json()["lines"][0]["valid"] is True
    assert spoken.status_code == 200
    assert spoken.json()["valid"] is True
    assert transcribe.status_code == 400
    models.close.assert_awaited_once()
