"""PDF worksheets: page count and one page as an image (issue #26, DESIGN.md F1, F18).

The vision model reads images, not PDFs, so a PDF page is rendered to a PNG
first: longest side at most 1,600 px (DESIGN.md 16), white background. The
image is returned to the caller and never stored.

Rendering uses PDFium through pypdfium2 (BSD-3-Clause / Apache-2.0). PyMuPDF
would be the obvious choice but is AGPL, which this project doesn't allow.
PDFium is not thread-safe, so each render runs in its own short-lived process
with a hard timeout (issue #209). A stuck render is killed on its own and no
global lock is held, so the next upload is never blocked behind it.
"""

import asyncio
import io
import multiprocessing
import threading
import time

from .errors import ApiError

MAX_SIDE_PX = 1600
MAX_SCALE = 300 / 72  # never upscale a tiny page past 300 dpi
RENDER_TIMEOUT_S = 10.0
MAX_CONCURRENT_RENDERS = 2
_PASSWORD_ERROR = 4  # FPDF_ERR_PASSWORD

_slots = threading.BoundedSemaphore(MAX_CONCURRENT_RENDERS)


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


def _child(conn, fn, args) -> None:
    """Process entry point: send ("ok", result) or ("err", code, message, status)."""
    try:
        conn.send(("ok", fn(*args)))
    except ApiError as exc:
        conn.send(("err", exc.code, exc.message, exc.status))
    except BaseException as exc:  # noqa: BLE001 - never ship exception text, it can hold the PDF's content
        conn.send(("crash", type(exc).__name__))
    finally:
        conn.close()


def _timeout_error() -> ApiError:
    return ApiError("TIMEOUT", "That PDF took too long to open. Try a smaller file.", 504)


def _run_isolated(fn, args: tuple, timeout: float | None = None):
    """Run `fn(*args)` in its own process; kill it if it runs past `timeout`.

    `fn` must be an importable top-level function. Queueing behind other
    renders counts against the same deadline.
    """
    deadline = time.monotonic() + (RENDER_TIMEOUT_S if timeout is None else timeout)
    if not _slots.acquire(timeout=max(0.0, deadline - time.monotonic())):
        raise _timeout_error()
    proc = None
    try:
        ctx = multiprocessing.get_context("spawn")
        recv, send = ctx.Pipe(duplex=False)
        proc = ctx.Process(target=_child, args=(send, fn, args), daemon=True)
        proc.start()
        send.close()
        if not recv.poll(max(0.0, deadline - time.monotonic())):
            raise _timeout_error()
        try:
            message = recv.recv()
        except EOFError:  # the worker died without answering
            raise ApiError("BAD_INPUT", "I couldn't open that PDF. Try saving it again.") from None
    finally:
        if proc is not None:
            if proc.is_alive():
                proc.kill()
            proc.join(5)
        _slots.release()
    if message[0] == "ok":
        return message[1]
    if message[0] == "err":
        raise ApiError(message[1], message[2], message[3])
    raise ApiError("BAD_INPUT", "I couldn't open that PDF. Try saving it again.")


async def page_count_async(data: bytes) -> int:
    return await asyncio.to_thread(_run_isolated, page_count, (data,))


async def render_page_async(data: bytes, page_number: int) -> tuple[bytes, int]:
    return await asyncio.to_thread(_run_isolated, render_page, (data, page_number))
