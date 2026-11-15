"""POST /api/capture — see DESIGN.md 9."""

import asyncio
import base64
import re
from collections.abc import AsyncIterator, Awaitable, Callable

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from .. import guards
from ..errors import ApiError, error_response
from ..openai_client import ModelClient, ModelError
from ..prompts import CAPTURE_PROMPT


# A vision model occasionally returns a heading as `\\text{Algebra practice}`.
# It is valid JSON and must not become a line a screen reader announces. Keep
# this deliberately narrow: expressions containing text alongside real math
# remain the model's responsibility and are preserved.
_TEXT_ONLY_LATEX = re.compile(
    r"^\\s*(?:\\\\(?:text|textrm|mathrm|operatorname)\\s*\\{[^{}]*\\}\\s*)+[.,;:!?]?\\s*$"
)


def _is_math_problem_line(latex: str) -> bool:
    return not bool(_TEXT_ONLY_LATEX.fullmatch(latex))


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
            if not isinstance(image, UploadFile):
                return bad_input("Upload a JPEG, PNG or WebP image.")
            if not isinstance(context, str) or len(context) > 4096:
                return bad_input("Image context must be at most 4,096 characters.")
            data = await image.read()
        finally:
            await form.close()

        # The declared content type is just a string the client chose, so it is
        # not evidence of anything: bytes labelled `image/png` were forwarded to
        # the paid vision model whatever they actually were. `check_image`
        # decides from the file signature instead, and returns the real type,
        # which is also what the data URL below has to carry to be read
        # correctly. It raises ApiError, which the app's handlers render in the
        # DESIGN.md 9 error shape.
        try:
            kind = guards.check_image(data, max_image_bytes)
        except ApiError as rejected:
            # Returned rather than raised, so this router reports its own
            # rejections in the DESIGN.md 9 shape whether or not the app it is
            # mounted in installed the error handlers.
            return error_response(rejected.code, rejected.message, rejected.status)
        if kind == "application/pdf":
            # The allowlist includes PDF because the guard is shared, but a page
            # has to be rasterised before a vision model can read it, which is
            # issue #26. Say so plainly rather than failing further in.
            return bad_input("Upload a page as an image for now; PDF support is coming.")

        encoded = base64.b64encode(data).decode("ascii")
        try:
            result = await models.interpret("capture", [
                {"role": "system", "content": CAPTURE_PROMPT},
                {"role": "user", "content": [
                    {"type": "text", "text": context or "Transcribe the uploaded image."},
                    {"type": "image_url", "image_url": {
                        "url": f"data:{kind};base64,{encoded}",
                    }},
                ]},
            ])
        except ModelError:
            return JSONResponse(status_code=502, content={"error": {
                "code": "MODEL_ERROR",
                "message": "I couldn't read that image. Try again.",
            }})

        # Prompting is the primary control, but do not let a pure heading leak
        # through if the model ignores it. Filtering happens before validation
        # so headings neither consume CAS work nor get a visible line id.
        lines = [line for line in result["lines"] if _is_math_problem_line(line["latex"])]
        result["lines"] = lines
        validity = await asyncio.gather(*(validate_latex(line["latex"]) for line in lines))
        for index, (line, valid) in enumerate(zip(lines, validity, strict=True), start=1):
            line.update(id=f"L{index}", valid=valid)
        for index, diagram in enumerate(result["diagrams"], start=1):
            diagram["id"] = f"D{index}"
        return result

    return router
