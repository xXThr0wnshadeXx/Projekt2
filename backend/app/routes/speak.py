"""POST /api/speak — the app's own natural voice (#182).

Turns a short piece of text the app is about to announce into speech. The text
is always something the browser already shows the student: an announcement, a
readback, a line of the problem as the speech engine reads it. Nothing here
interprets it, and it is never logged or stored.
"""

from typing import Literal

from fastapi import APIRouter
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from ..openai_client import ModelClient, ModelError

# A small, fixed set, so a request can't pick anything unexpected.
Voice = Literal["coral", "sage", "verse"]


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=600)
    voice: Voice = "coral"
    speed: float = Field(default=1.0, ge=0.7, le=1.5)


def speak_router(models: ModelClient) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.post("/speak")
    async def speak(req: SpeakRequest):
        text = req.text.strip()
        if not text:
            return JSONResponse(status_code=400, content={"error": {
                "code": "BAD_INPUT", "message": "Nothing to say.",
            }})
        try:
            audio = await models.speak(text, req.voice, req.speed)
        except ModelError:
            return JSONResponse(status_code=502, content={"error": {
                "code": "MODEL_ERROR", "message": "The voice is unavailable right now.",
            }})
        # Nothing student-specific is kept, so the browser may reuse it.
        return Response(content=audio, media_type="audio/mpeg",
                        headers={"Cache-Control": "private, max-age=3600"})

    return router
