"""Compare app responses with the field names consumed by the frontend."""

import json
import re
from io import BytesIO
from pathlib import Path
from typing import get_args
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from backend.app import main
from backend.app.config import Settings
from backend.app.errors import ErrorCode
from test_pdf import LETTER, blank_pdf
from test_transcribe import recording

API_PATH = Path(__file__).resolve().parents[1] / "frontend" / "src" / "api.ts"
API_SOURCE = re.sub(
    r"/\*.*?\*/|^[ \t]*//[^\n]*", "", API_PATH.read_text(encoding="utf-8"), flags=re.S | re.M
)
FIELD = re.compile(r"(?:^|;)\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)(\??)\s*:", flags=re.M)


class Fields(frozenset):
    """Every field the frontend reads, remembering which ones are optional (`name?:`)."""

    optional: frozenset[str]


def ts_fields(declaration: str, context: str) -> Fields:
    match = re.search(declaration, API_SOURCE)
    assert match, f"{context}: could not find the frontend contract in api.ts"
    found = FIELD.findall(match.group(1))
    assert found, f"{context}: could not read any frontend fields in api.ts"
    fields = Fields(name for name, _ in found)
    fields.optional = frozenset(name for name, mark in found if mark)
    return fields


def interface_fields(name: str, endpoint: str) -> Fields:
    return ts_fields(
        rf"\bexport\s+interface\s+{re.escape(name)}\s*\{{([^{{}}]*)\}}",
        f"{endpoint} ({name})",
    )


def assert_fields(endpoint: str, payload: object, expected: set[str]) -> None:
    assert isinstance(payload, dict), f"{endpoint}: expected a JSON object, got {type(payload).__name__}"
    # An optional field (`message?:`) may be left out; anything not declared may not appear.
    required = expected - getattr(expected, "optional", frozenset())
    missing, extra = required - payload.keys(), payload.keys() - expected
    assert not (missing or extra), (
        f"{endpoint}: missing fields {sorted(missing)}; extra fields {sorted(extra)}"
    )


def assert_members(endpoint: str, payload: dict, member: str, interface: str) -> None:
    path = f"{endpoint}.{member}"
    rows = payload.get(member)
    assert isinstance(rows, list) and rows, f"{path}: expected at least one item to check"
    expected = interface_fields(interface, path)
    for index, row in enumerate(rows):
        assert_fields(f"{path}[{index}]", row, expected)


def model_result(task: str, messages: list) -> dict:
    if task == "capture":
        return {
            "instructions": "Read the line below.",
            "lines": [{"latex": "2x + 3 = 11", "confidence": 1.0, "intent_notes": ""}],
            "diagrams": [{"description": "A number line."}],
            "warnings": [],
        }
    assert task == "spoken", f"Unexpected model task: {task}"
    if json.loads(messages[-1]["content"])["text"] == "x plus one divided by two":
        return {
            "latex": None,
            "ambiguous": True,
            "clarifying_question": "Which part is divided by two?",
            "alternatives": [
                {"latex": r"\frac{x+1}{2}", "readback": "x plus one, all over two"},
                {"latex": r"x+\frac{1}{2}", "readback": "x plus one half"},
            ],
            "readback": None,
        }
    return {
        "latex": "2x = 8",
        "ambiguous": False,
        "clarifying_question": None,
        "alternatives": [],
        "readback": "two x equals eight",
    }


@pytest.fixture(scope="module")
def client():
    models = AsyncMock()
    models.interpret.side_effect = model_result
    models.transcribe.return_value = "two x equals eight"
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(main, "ModelClient", lambda *_args, **_kwargs: models)
        settings = Settings(
            _env_file=None,
            openai_api_key="test-value",
            model_vision="vision",
            model_text="text",
            model_stt="speech",
        )
        app = main.create_app(settings, warm_cas=False, explainer=AsyncMock(return_value=None))
        with TestClient(app) as test_client:
            yield test_client


def success_json(endpoint, response):
    assert response.status_code == 200, f"{endpoint}: expected HTTP 200, got {response.status_code}: {response.text}"
    return response.json()


@pytest.fixture(scope="module")
def captured(client):
    image = BytesIO()
    with Image.new("RGB", (16, 16), "white") as png:
        png.save(image, format="PNG")
    endpoint = "/api/capture"
    return success_json(endpoint, client.post(endpoint, files={"image": ("page.png", image.getvalue(), "image/png")}))


@pytest.fixture(scope="module")
def ambiguous_spoken(client):
    endpoint = "/api/spoken-to-latex"
    return success_json(endpoint, client.post(endpoint, json={"text": "x plus one divided by two"}))


def test_capture_response(captured):
    endpoint = "/api/capture"
    assert_fields(endpoint, captured, interface_fields("CaptureResponse", endpoint))


@pytest.mark.parametrize("member,interface", [("lines", "CaptureLine"), ("diagrams", "CaptureDiagram")])
def test_capture_members(captured, member, interface):
    assert_members("/api/capture", captured, member, interface)


def test_spoken_response(client):
    endpoint = "/api/spoken-to-latex"
    response = client.post(endpoint, json={"text": "two x equals eight"})
    assert_fields(endpoint, success_json(endpoint, response), interface_fields("SpokenResponse", endpoint))


def test_ambiguous_spoken_response(ambiguous_spoken):
    endpoint = "/api/spoken-to-latex"
    assert_fields(endpoint, ambiguous_spoken, interface_fields("SpokenResponse", endpoint))


def test_spoken_alternatives(ambiguous_spoken):
    endpoint = "/api/spoken-to-latex"
    assert_members(endpoint, ambiguous_spoken, "alternatives", "SpokenAlternative")


def test_transcribe_response(client):
    endpoint = "/api/transcribe"
    audio = recording("webm", "libopus", 1)
    response = client.post(endpoint, files={"audio": ("line.webm", audio, "audio/webm")})
    assert_fields(endpoint, success_json(endpoint, response), interface_fields("TranscribeResponse", endpoint))


@pytest.mark.parametrize("endpoint,interface,payload", [
    ("/api/diff", "DiffResponse", {"from_latex": "2x = 8", "to_latex": "x = 4", "mode": "homework"}),
    ("/api/command", "CommandResponse", {"text": "next line", "current_line": "W1", "line_count": 2}),
])
def test_json_response(client, endpoint, interface, payload):
    response = client.post(endpoint, json=payload)
    assert_fields(endpoint, success_json(endpoint, response), interface_fields(interface, endpoint))


def test_health_response(client):
    endpoint = "/api/health"
    assert_fields(endpoint, success_json(endpoint, client.get(endpoint)), interface_fields("HealthResponse", endpoint))


def test_pdf_page_count_response(client):
    endpoint = "/api/pdf/pages"
    fields = ts_fields(r"\bfunction\s+pdfPageCount\([^)]*\)\s*:\s*Promise\s*<\s*\{([^{}]*)\}", endpoint)
    response = client.post(endpoint, files={"pdf": ("worksheet.pdf", blank_pdf(LETTER), "application/pdf")})
    assert_fields(endpoint, success_json(endpoint, response), fields)


def api_error_codes() -> set[str]:
    declaration = re.search(r"\bexport\s+type\s+ApiErrorCode\s*=\s*([^;]+);", API_SOURCE)
    assert declaration, "api.ts: could not find ApiErrorCode"
    return set(re.findall(r"""['"]([^'"]+)['"]""", declaration.group(1)))


def test_backend_error_codes_are_recognised():
    missing = set(get_args(ErrorCode)) - api_error_codes()
    assert not missing, f"API error.code: backend codes missing from ApiErrorCode: {sorted(missing)}"


@pytest.mark.parametrize("endpoint,payload", [
    ("/api/capture", {}),
    ("/api/spoken-to-latex", {}),
    ("/api/transcribe", {}),
    ("/api/diff", {"from_latex": "x = 4", "to_latex": "x = 4", "mode": "exam"}),
    ("/api/command", {}),
    ("/api/pdf/pages", {}),
    ("/api/pdf/page", {}),
])
def test_error_response(client, endpoint, payload):
    response = client.post(endpoint, json=payload)
    assert response.is_error, f"{endpoint}: expected an error response, got HTTP {response.status_code}"
    envelope = ts_fields(r"\bbody\s+as\s+\{([^{}]*)\}\s*\|\s*null", endpoint)
    body = response.json()
    assert_fields(endpoint, body, envelope)
    assert_fields(f"{endpoint}.error", body["error"], interface_fields("ApiError", endpoint))
    code = body["error"]["code"]
    assert code in api_error_codes(), f"{endpoint}.error.code: {code!r} is missing from ApiErrorCode"
