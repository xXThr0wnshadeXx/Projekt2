"""POST /api/capture — see DESIGN.md 9."""

import asyncio
import base64
from collections.abc import AsyncIterator, Awaitable, Callable

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from ..openai_client import ModelClient, ModelError
from ..prompts import CAPTURE_PROMPT

IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def capture_router(
    models: ModelClient,
    validate_latex: Callable[[str], Awaitable[bool]],
    max_image_bytes: int = 8 * 1024 * 1024,
) -> APIRouter:
    """Build the capture router using the app's timeout-wrapped CAS validator."""
    router = APIRouter(prefix="/api")
    max_request_bytes = max_image_bytes + 64 * 1024

    class MemoryMultipartParser(MultiPartParser):
        max_file_size = max_request_bytes

    async def bounded_stream(request: Request) -> AsyncIterator[bytes]:
        total = 0
        async for chunk in request.stream():
            total += len(chunk)
            if total > max_request_bytes:
                raise MultiPartException("Image upload exceeds the size limit.")
            yield chunk

    @router.post("/capture")
    async def capture(request: Request):
        def bad_input(message: str):
            return JSONResponse(
                status_code=400, content={"error": {"code": "BAD_INPUT", "message": message}}
            )

        media_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        if media_type != "multipart/form-data":
            return bad_input("Upload an image as multipart form data.")
        parser = MemoryMultipartParser(
            request.headers, bounded_stream(request), max_files=1, max_fields=1
        )
        try:
            form = await parser.parse()
        except (MultiPartException, ValueError):
            return bad_input("The image upload is invalid or exceeds the size limit.")
        try:
            image = form.get("image")
            context = form.get("context", "")
            if not isinstance(image, UploadFile) or image.content_type not in IMAGE_TYPES:
                return bad_input("Upload a JPEG, PNG, WebP, or GIF image.")
            if not isinstance(context, str) or len(context) > 4096:
                return bad_input("Image context must be at most 4,096 characters.")
            data = await image.read()
            if not data or len(data) > max_image_bytes:
                return bad_input("The image is empty or exceeds the size limit.")
        finally:
            await form.close()

        encoded = base64.b64encode(data).decode("ascii")
        try:
            result = await models.interpret("capture", [
                {"role": "system", "content": CAPTURE_PROMPT},
                {"role": "user", "content": [
                    {"type": "text", "text": context or "Transcribe the uploaded image."},
                    {"type": "image_url", "image_url": {
                        "url": f"data:{image.content_type};base64,{encoded}",
                    }},
                ]},
            ])
        except ModelError:
            return JSONResponse(status_code=502, content={"error": {
                "code": "MODEL_ERROR",
                "message": "I couldn't read that image. Try again.",
            }})

        lines = result["lines"]
        validity = await asyncio.gather(*(validate_latex(line["latex"]) for line in lines))
        for index, (line, valid) in enumerate(zip(lines, validity, strict=True), start=1):
            line.update(id=f"L{index}", valid=valid)
        for index, diagram in enumerate(result["diagrams"], start=1):
            diagram["id"] = f"D{index}"
        return result

    return router
