"""POST /api/frame: is the worksheet well framed? (issue #242).

    body: one small JPEG camera frame (about 512 px on the long side)
 ->  {"guidance": "move-left", "reason": "page cut off at the left"}

The vision model is only asked where the page sits in the picture, never to
read or solve what is written on it. The frame is held in memory for the one
call: it is not stored and never written to a log.
"""

import base64

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .. import guards
from ..errors import ApiError, error_response
from ..openai_client import ModelClient, ModelError
from ..prompts import FRAME_PROMPT

GUIDANCE = (
    "too-dark", "no-page", "move-left", "move-right", "move-up", "move-down",
    "closer", "further", "good",
)
MAX_REASON = 120
UNAVAILABLE = "I couldn't check the framing. Take the photo when you are ready."


def frame_router(models: ModelClient) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.post("/frame")
    async def frame(request: Request):
        def bad_input(message: str):
            return JSONResponse(
                status_code=400, content={"error": {"code": "BAD_INPUT", "message": message}}
            )

        data = await request.body()
        if not data:
            return bad_input("Send one camera frame as a JPEG.")
        try:
            kind = guards.check_image(data, guards.FRAME_MAX_BYTES)
        except ApiError as rejected:
            return error_response(rejected.code, rejected.message, rejected.status)
        if kind != "image/jpeg":
            return bad_input("Send one camera frame as a JPEG.")

        encoded = base64.b64encode(data).decode("ascii")
        try:
            result = await models.interpret("frame", [
                {"role": "system", "content": FRAME_PROMPT},
                {"role": "user", "content": [
                    {"type": "text", "text": "Camera frame attached."},
                    {"type": "image_url", "image_url": {
                        "url": f"data:{kind};base64,{encoded}",
                        "detail": "low",
                    }},
                ]},
            ])
        except ModelError:
            return JSONResponse(status_code=502, content={"error": {
                "code": "MODEL_ERROR", "message": UNAVAILABLE,
            }})

        guidance = result.get("guidance")
        if guidance not in GUIDANCE:
            return JSONResponse(status_code=502, content={"error": {
                "code": "MODEL_ERROR", "message": UNAVAILABLE,
            }})
        reason = result.get("reason")
        reason = reason.strip()[:MAX_REASON] if isinstance(reason, str) and reason.strip() else None
        return {"guidance": guidance, "reason": reason}

    return router
