"""PDF worksheets (issue #26).

    POST /api/pdf/pages   multipart `pdf`          → {"pages": N}
    POST /api/pdf/page    multipart `pdf`, `page`  → image/png of that page

The front end asks for the page count, asks the student which page (DESIGN.md
F1: "PDF asks for page number"), then sends the returned PNG to /api/capture
like any other image. Nothing is stored.
"""

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import Response

from .. import guards, pdfpages
from ..errors import ApiError


async def _read_pdf(upload: UploadFile, max_bytes: int) -> bytes:
    data = await upload.read(max_bytes + 1)
    await upload.close()
    if not data:
        raise ApiError("BAD_INPUT", "The file is empty.")
    if len(data) > max_bytes:
        raise ApiError("BAD_INPUT", "That file is too large. The limit is 8 megabytes.", 413)
    if guards.sniff(data) != "application/pdf":  # by signature, not the declared type
        raise ApiError("BAD_INPUT", "Upload a PDF file.", 415)
    return data


def pdf_router(max_bytes: int) -> APIRouter:
    router = APIRouter(prefix="/api/pdf")

    @router.post("/pages")
    async def pages(pdf: UploadFile = File(...)) -> dict:
        data = await _read_pdf(pdf, max_bytes)
        return {"pages": await pdfpages.page_count_async(data)}

    @router.post("/page")
    async def page(pdf: UploadFile = File(...), page: int = Form(..., ge=1, le=10_000)) -> Response:
        data = await _read_pdf(pdf, max_bytes)
        png, _count = await pdfpages.render_page_async(data, page)
        return Response(content=png, media_type="image/png", headers={"Cache-Control": "no-store"})

    return router
