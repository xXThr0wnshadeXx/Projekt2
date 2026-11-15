from io import BytesIO
from unittest.mock import AsyncMock

import av
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.routes.transcribe import transcribe_router


def recording(container, codec, seconds):
    output = BytesIO()
    with av.open(output, mode="w", format=container) as media:
        stream = media.add_stream(codec, rate=48000, layout="mono")
        for index in range(seconds * 50):
            frame = av.AudioFrame(format="s16", layout="mono", samples=960)
            frame.sample_rate = 48000
            frame.pts = index * 960
            frame.planes[0].update(bytes(frame.planes[0].buffer_size))
            media.mux(stream.encode(frame))
        media.mux(stream.encode(None))
    return output.getvalue()


@pytest.mark.parametrize("container,codec", [("webm", "libopus"), ("mp4", "aac")])
def test_transcribes_valid_browser_audio(container, codec):
    models = AsyncMock()
    models.transcribe.return_value = "two x"
    app = FastAPI()
    app.include_router(transcribe_router(models))
    data = recording(container, codec, 1)

    with TestClient(app) as client:
        response = client.post("/api/transcribe", files={
            "audio": ("clip", data, f"audio/{container}"),
        })

    assert response.status_code == 200
    assert response.json() == {"text": "two x"}
    models.transcribe.assert_awaited_once_with(f"recording.{container}", data, f"audio/{container}")


def test_rejects_audio_longer_than_the_limit_before_model_call():
    models = AsyncMock()
    app = FastAPI()
    app.include_router(transcribe_router(models))
    with TestClient(app) as client:
        response = client.post("/api/transcribe", files={
            "audio": ("clip.webm", recording("webm", "libopus", 31), "audio/webm"),
        })
    assert response.status_code == 400
    models.transcribe.assert_not_awaited()
