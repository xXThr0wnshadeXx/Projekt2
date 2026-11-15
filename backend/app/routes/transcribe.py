"""POST /api/transcribe — see DESIGN.md 9."""

import asyncio
from collections.abc import AsyncIterator
from io import BytesIO

import av
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from ..openai_client import ModelClient, ModelError

AUDIO_FORMATS = {
    "audio/webm": ("webm", "matroska"),
    "audio/mp4": ("mp4", "mov"),
}
MAX_AUDIO_BYTES = 8 * 1024 * 1024
MAX_REQUEST_BYTES = MAX_AUDIO_BYTES + 64 * 1024


class AudioMultipartParser(MultiPartParser):
    max_file_size = MAX_REQUEST_BYTES


async def bounded_audio_body(request: Request) -> AsyncIterator[bytes]:
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > MAX_REQUEST_BYTES:
            raise MultiPartException("Audio upload exceeds the size limit.")
        yield chunk


def audio_within_limit(data: bytes, demuxer: str, max_seconds: int) -> bool:
    duration = 0.0
    with av.open(BytesIO(data), mode="r", format=demuxer) as media:
        if len(media.streams.audio) != 1 or media.streams.video:
            return False
        for frame in media.decode(audio=0):
            if frame.sample_rate <= 0:
                return False
            duration += frame.samples / frame.sample_rate
            if duration > max_seconds + 1e-9:
                return False
    return duration > 0


def audio_error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def transcribe_router(models: ModelClient, max_audio_seconds: int = 30) -> APIRouter:
    router = APIRouter(prefix="/api")
    invalid_message = f"Upload a WebM or MP4 recording up to {max_audio_seconds} seconds."

    @router.post("/transcribe")
    async def transcribe(request: Request):
        media_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        if media_type != "multipart/form-data":
            return audio_error(400, "BAD_INPUT", invalid_message)
        parser = AudioMultipartParser(
            request.headers, bounded_audio_body(request), max_files=1, max_fields=0
        )
        try:
            form = await parser.parse()
        except (MultiPartException, ValueError):
            return audio_error(400, "BAD_INPUT", invalid_message)

        try:
            audio = form.get("audio")
            if not isinstance(audio, UploadFile):
                return audio_error(400, "BAD_INPUT", invalid_message)
            content_type = (audio.content_type or "").split(";", 1)[0].strip().lower()
            if content_type not in AUDIO_FORMATS:
                return audio_error(400, "BAD_INPUT", invalid_message)
            data = await audio.read(MAX_AUDIO_BYTES + 1)
        finally:
            await form.close()

        if not data or len(data) > MAX_AUDIO_BYTES:
            return audio_error(400, "BAD_INPUT", invalid_message)

        extension, demuxer = AUDIO_FORMATS[content_type]
        try:
            valid = await asyncio.to_thread(audio_within_limit, data, demuxer, max_audio_seconds)
        except (av.FFmpegError, ValueError, EOFError):
            valid = False
        if not valid:
            return audio_error(400, "BAD_INPUT", invalid_message)

        try:
            text = await models.transcribe(f"recording.{extension}", data, content_type)
        except ModelError:
            return audio_error(502, "MODEL_ERROR", "I couldn't transcribe that recording. Try again.")
        if not text.strip():
            return audio_error(
                422, "UNPARSEABLE",
                "I didn't hear anything. Try again, a little closer to the microphone.",
            )
        return {"text": text}

    return router
