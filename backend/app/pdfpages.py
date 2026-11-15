"""PDF worksheets: page count and one page as an image (issue #26, DESIGN.md F1, F18).

The vision model reads images, not PDFs, so a PDF page is rendered to a PNG
first: longest side at most 1,600 px (DESIGN.md 16), white background. The
image is returned to the caller and never stored.

Rendering uses PDFium through pypdfium2 (BSD-3-Clause / Apache-2.0). PyMuPDF
would be the obvious choice but is AGPL, which this project doesn't allow.
PDFium is not thread-safe, so every call holds one lock.
"""

import asyncio
import io
import threading

from .errors import ApiError

MAX_SIDE_PX = 1600
MAX_SCALE = 300 / 72  # never upscale a tiny page past 300 dpi
RENDER_TIMEOUT_S = 10.0
_PASSWORD_ERROR = 4  # FPDF_ERR_PASSWORD

_lock = threading.Lock()


def _open(data: bytes):
    import pypdfium2 as pdfium

    try:
        return pdfium.PdfDocument(data)
    except pdfium.PdfiumError as exc:
        if getattr(exc, "err_code", None) == _PASSWORD_ERROR:
            raise ApiError(
                "BAD_INPUT",
                "That PDF is password-protected. Save an unlocked copy and try again.",
            ) from None
        raise ApiError("BAD_INPUT", "I couldn't open that PDF. Try saving it again.") from None


def page_count(data: bytes) -> int:
    with _lock:
        doc = _open(data)
        try:
            count = len(doc)
        finally:
            doc.close()
    if count < 1:
        raise ApiError("BAD_INPUT", "That PDF has no pages.")
    return count


def _scale_for(width_pt: float, height_pt: float) -> float:
    longest = max(width_pt, height_pt, 1.0)
    return min(MAX_SIDE_PX / longest, MAX_SCALE)


def render_page(data: bytes, page_number: int) -> tuple[bytes, int]:
    """PNG bytes of page `page_number` (1-based) and the document's page count."""
    with _lock:
        doc = _open(data)
        try:
            count = len(doc)
            if not 1 <= page_number <= count:
                raise ApiError(
                    "BAD_INPUT",
                    f"That PDF has {count} page{'s' if count != 1 else ''}. "
                    f"Choose a page from 1 to {count}.",
                )
            page = doc[page_number - 1]
            try:
                width, height = page.get_size()
                bitmap = page.render(scale=_scale_for(width, height), fill_color=(255, 255, 255, 255))
                image = bitmap.to_pil()
            finally:
                page.close()
        finally:
            doc.close()

    out = io.BytesIO()
    image.convert("RGB").save(out, format="PNG")
    return out.getvalue(), count


async def _in_thread(fn, *args):
    try:
        return await asyncio.wait_for(asyncio.to_thread(fn, *args), RENDER_TIMEOUT_S)
    except asyncio.TimeoutError:
        raise ApiError("TIMEOUT", "That PDF took too long to open. Try a smaller file.", 504) from None


async def page_count_async(data: bytes) -> int:
    return await _in_thread(page_count, data)


async def render_page_async(data: bytes, page_number: int) -> tuple[bytes, int]:
    return await _in_thread(render_page, data, page_number)
