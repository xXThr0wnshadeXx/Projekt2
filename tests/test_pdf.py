"""PDF worksheets: page count and page images (issue #26). Real PDFs, no mocks of PDFium."""

import io
from unittest.mock import AsyncMock

import pypdfium2 as pdfium
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from backend.app import main, pdfpages
from backend.app.config import Settings
from backend.app.errors import ApiError


def blank_pdf(*sizes_pt) -> bytes:
    doc = pdfium.PdfDocument.new()
    for w, h in sizes_pt:
        doc.new_page(w, h)
    out = io.BytesIO()
    doc.save(out)
    doc.close()
    return out.getvalue()


def text_pdf(line: str = "2x + 3 = 11") -> bytes:
    """A one-page Letter PDF with real text, written by hand."""
    stream = f"BT /F1 48 Tf 72 600 Td ({line}) Tj ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return bytes(out)


LETTER, A4_LANDSCAPE, STAMP = (612, 792), (842, 595), (72, 72)


# --- helpers -------------------------------------------------------------------------

def test_page_count():
    assert pdfpages.page_count(blank_pdf(LETTER, A4_LANDSCAPE, LETTER)) == 3


@pytest.mark.parametrize("size, expected", [
    (LETTER, (1236, 1600)),         # portrait: height capped at 1600
    (A4_LANDSCAPE, (1600, 1130)),   # landscape: width capped at 1600
    (STAMP, (300, 300)),            # tiny page: capped at 300 dpi, not blown up
])
def test_render_fits_the_1600px_budget(size, expected):
    png, count = pdfpages.render_page(blank_pdf(size), 1)
    image = Image.open(io.BytesIO(png))
    assert image.format == "PNG" and count == 1
    assert image.size == pytest.approx(expected, abs=1)
    assert max(image.size) <= pdfpages.MAX_SIDE_PX


def test_rendered_page_has_the_ink():
    png, _ = pdfpages.render_page(text_pdf(), 1)
    image = Image.open(io.BytesIO(png)).convert("L")
    dark = sum(1 for p in image.getdata() if p < 128)
    assert dark > 500  # the text is there
    assert image.getpixel((5, 5)) == 255  # white page background


def test_picks_the_requested_page():
    data = blank_pdf(LETTER, A4_LANDSCAPE)
    first = Image.open(io.BytesIO(pdfpages.render_page(data, 1)[0]))
    second = Image.open(io.BytesIO(pdfpages.render_page(data, 2)[0]))
    assert first.height > first.width and second.width > second.height


@pytest.mark.parametrize("page", [0, 3, 99])
def test_page_out_of_range_names_the_range(page):
    with pytest.raises(ApiError) as e:
        pdfpages.render_page(blank_pdf(LETTER, LETTER), page)
    assert e.value.code == "BAD_INPUT"
    assert e.value.message == "That PDF has 2 pages. Choose a page from 1 to 2."


def test_one_page_message_is_singular():
    with pytest.raises(ApiError) as e:
        pdfpages.render_page(blank_pdf(LETTER), 2)
    assert "has 1 page." in e.value.message


def test_broken_pdf_is_a_friendly_error():
    with pytest.raises(ApiError) as e:
        pdfpages.page_count(b"%PDF-1.7\nthis is not really a pdf")
    assert e.value.message == "I couldn't open that PDF. Try saving it again."


def test_password_protected_pdf_says_so(monkeypatch):
    def locked(_data):
        err = pdfium.PdfiumError("locked")
        err.err_code = 4
        raise err

    monkeypatch.setattr(pdfium, "PdfDocument", locked)
    with pytest.raises(ApiError) as e:
        pdfpages.page_count(b"%PDF-1.7\n")
    assert "password-protected" in e.value.message


# --- endpoints -------------------------------------------------------------------------

@pytest.fixture
def client():
    with TestClient(main.create_app(Settings(_env_file=None), warm_cas=False)) as c:
        yield c


def test_pages_endpoint(client):
    r = client.post("/api/pdf/pages", files={"pdf": ("w.pdf", blank_pdf(LETTER, LETTER, LETTER), "application/pdf")})
    assert r.status_code == 200 and r.json() == {"pages": 3}


def test_page_endpoint_returns_a_png(client):
    r = client.post("/api/pdf/page", files={"pdf": ("w.pdf", text_pdf(), "application/pdf")}, data={"page": "1"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.headers["cache-control"] == "no-store"
    assert r.content.startswith(b"\x89PNG")


def test_page_endpoint_errors_use_the_error_shape(client):
    pdf = ("w.pdf", blank_pdf(LETTER), "application/pdf")
    out_of_range = client.post("/api/pdf/page", files={"pdf": pdf}, data={"page": "5"})
    assert out_of_range.status_code == 400
    assert out_of_range.json()["error"]["message"] == "That PDF has 1 page. Choose a page from 1 to 1."
    missing_page = client.post("/api/pdf/page", files={"pdf": pdf})
    assert missing_page.json()["error"]["code"] == "BAD_INPUT"


@pytest.mark.parametrize("data", [b"\x89PNG\r\n\x1a\n" + b"\0" * 20, b"MZ\x90\0" + b"\0" * 20])
def test_non_pdf_is_refused_by_signature(client, data):
    r = client.post("/api/pdf/pages", files={"pdf": ("w.pdf", data, "application/pdf")})
    assert r.status_code == 415
    assert r.json()["error"]["message"] == "Upload a PDF file."


def test_oversize_pdf_is_refused_before_reading(client):
    big = b"%PDF-1.7\n" + b"\0" * (9 * 1024 * 1024)
    r = client.post("/api/pdf/pages", files={"pdf": ("w.pdf", big, "application/pdf")})
    assert r.status_code == 413


def test_pdf_page_flows_into_capture_unchanged(monkeypatch):
    """PDF → page image → the existing /api/capture route, with only the model faked."""
    models = AsyncMock()
    models.interpret.return_value = {
        "instructions": "Solve for x.", "diagrams": [], "warnings": [],
        "lines": [{"latex": "2x + 3 = 11", "confidence": 0.95, "intent_notes": ""}],
    }
    monkeypatch.setattr(main, "ModelClient", lambda settings: models)
    settings = Settings(_env_file=None, openai_api_key="test-value",
                        model_vision="v", model_text="t", model_stt="s")
    with TestClient(main.create_app(settings, warm_cas=False)) as c:
        png = c.post("/api/pdf/page", files={"pdf": ("w.pdf", text_pdf(), "application/pdf")},
                     data={"page": "1"}).content
        r = c.post("/api/capture", files={"image": ("page-1.png", png, "image/png")})
    assert r.status_code == 200
    assert r.json()["lines"][0] == {"id": "L1", "latex": "2x + 3 = 11", "confidence": 0.95,
                                    "intent_notes": "", "valid": True}
    sent = models.interpret.await_args.args[1][1]["content"][1]["image_url"]["url"]
    assert sent.startswith("data:image/png;base64,")
