"""PDF worksheets (issue #26).

    POST /api/pdf/pages   multipart `pdf`          → {"pages": N}
    POST /api/pdf/page    multipart `pdf`, `page`  → image/png of that page

The front end asks for the page count, asks the student which page (DESIGN.md
F1: "PDF asks for page number"), then sends the returned PNG to /api/capture
like any other image. Nothing is stored.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import APIRouter, Request
from fastapi.responses import Response
from pydantic import Field, TypeAdapter, ValidationError
from starlette.datastructures import FormData, UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from .. import guards, pdfpages
from ..errors import ApiError


_PAGE_NUMBER = TypeAdapter(Annotated[int, Field(ge=1, le=10_000)])
_BAD_FORM = "Some required information was missing or invalid."
_TOO_LARGE = "That file is too large. The limit is 8 megabytes."


class _UploadTooLarge(MultiPartException):
    pass


async def _read_pdf(upload: object, max_bytes: int) -> bytes:
    if not isinstance(upload, UploadFile):
        raise ApiError("BAD_INPUT", _BAD_FORM)
    data = await upload.read(max_bytes + 1)
    if not data:
        raise ApiError("BAD_INPUT", "The file is empty.")
    if len(data) > max_bytes:
        raise ApiError("BAD_INPUT", _TOO_LARGE, 413)
    if guards.sniff(data) != "application/pdf":  # by signature, not the declared type
        raise ApiError("BAD_INPUT", "Upload a PDF file.", 415)
    return data


def pdf_router(max_bytes: int) -> APIRouter:
    router = APIRouter(prefix="/api/pdf")
    max_request_bytes = max_bytes + guards.FORM_OVERHEAD

    class MemoryMultipartParser(MultiPartParser):
        max_file_size = max_request_bytes

    @asynccontextmanager
    async def pdf_form(request: Request) -> AsyncIterator[FormData]:
        media_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        if media_type != "multipart/form-data":
            raise ApiError("BAD_INPUT", _BAD_FORM)

        async def bounded_stream() -> AsyncIterator[bytes]:
            total = 0
            async for chunk in request.stream():
                total += len(chunk)
                if total > max_request_bytes:
                    raise _UploadTooLarge(_TOO_LARGE)
                yield chunk

        # Bound the stream before it reaches the parser so the upload stays
        # below the temporary file's disk rollover threshold.
        try:
            form = await MemoryMultipartParser(request.headers, bounded_stream()).parse()
        except _UploadTooLarge:
            raise ApiError("BAD_INPUT", _TOO_LARGE, 413) from None
        except (MultiPartException, ValueError):
            raise ApiError("BAD_INPUT", _BAD_FORM) from None
        try:
            yield form
        finally:
            await form.close()

    @router.post("/pages")
    async def pages(request: Request) -> dict:
        async with pdf_form(request) as form:
            data = await _read_pdf(form.get("pdf"), max_bytes)
        return {"pages": await pdfpages.page_count_async(data)}

    @router.post("/page")
    async def page(request: Request) -> Response:
        async with pdf_form(request) as form:
            try:
                page_number = _PAGE_NUMBER.validate_python(form.get("page"))
            except ValidationError:
                raise ApiError("BAD_INPUT", _BAD_FORM) from None
            data = await _read_pdf(form.get("pdf"), max_bytes)
        png, _count = await pdfpages.render_page_async(data, page_number)
        return Response(content=png, media_type="image/png", headers={"Cache-Control": "no-store"})

    return router
