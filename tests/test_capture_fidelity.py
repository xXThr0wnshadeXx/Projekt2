"""Capture keeps printed instructions and math apart — issue #176.

The two model outputs below are the ones seen on the live site.
"""

from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.capture_fidelity import prose_of, tidy_capture
from backend.app.prompts import CAPTURE_PROMPT
from backend.app.routes.capture import capture_router

PNG = bytes.fromhex("89504e470d0a1a0a") + b"0" * 32


def line(latex):
    return {"latex": latex, "confidence": 0.98, "intent_notes": ""}


# Reproduction A: an image with only `2x + 3 = 11` and `(x + 1) / 2 = 5`.
EQUATIONS_ONLY = {
    "instructions": "Transcribe the two given algebraic equations from the image.",
    "lines": [line("2x + 3 = 11"), line(r"\frac{x + 1}{2} = 5")],
    "diagrams": [],
    "warnings": [],
}

# Reproduction B: the heading "Solve for x." above `2x + 3 = 11`.
HEADING_AND_EQUATION = {
    "instructions": "Solve the equation for x.",
    "lines": [line(r"\text{Solve for } x."), line("2x + 3 = 11")],
    "diagrams": [],
    "warnings": [],
}


def post(model_output, validate=None):
    models = AsyncMock()
    models.interpret.return_value = {
        **model_output,
        "lines": [dict(entry) for entry in model_output["lines"]],
    }
    app = FastAPI()
    app.include_router(capture_router(models, validate or AsyncMock(return_value=True)))
    with TestClient(app) as client:
        response = client.post("/api/capture", files={"image": ("page.png", PNG, "image/png")})
    assert response.status_code == 200
    return response.json(), models


def test_equations_only_gets_no_invented_instructions():
    body, _ = post(EQUATIONS_ONLY)
    assert body["instructions"] == ""
    assert [entry["latex"] for entry in body["lines"]] == ["2x + 3 = 11", r"\frac{x + 1}{2} = 5"]
    assert body["lines"][0]["id"] == "L1"


def test_a_heading_is_not_a_math_line_and_the_first_line_is_the_equation():
    body, _ = post(HEADING_AND_EQUATION)
    assert [entry["latex"] for entry in body["lines"]] == ["2x + 3 = 11"]
    # The first line the browser focuses is the equation, not the heading.
    assert body["lines"][0] == {
        "id": "L1", "latex": "2x + 3 = 11", "confidence": 0.98, "intent_notes": "", "valid": True,
    }
    # The printed heading replaces the model's rewording of it, said once.
    assert body["instructions"] == "Solve for x."


def test_a_heading_only_among_the_math_becomes_the_instructions():
    body, _ = post({**HEADING_AND_EQUATION, "instructions": ""})
    assert body["instructions"] == "Solve for x."
    assert [entry["latex"] for entry in body["lines"]] == ["2x + 3 = 11"]


def test_a_heading_given_in_both_places_is_said_once():
    body, _ = post({**HEADING_AND_EQUATION, "instructions": "Solve for x."})
    assert body["instructions"] == "Solve for x."


def test_printed_instructions_are_kept_word_for_word():
    printed = "Check the calculation. Show your working."
    body, _ = post({**EQUATIONS_ONLY, "instructions": printed})
    assert body["instructions"] == printed


def test_the_sentence_lines_are_not_sent_to_the_parser():
    validate = AsyncMock(return_value=True)
    post(HEADING_AND_EQUATION, validate)
    validate.assert_awaited_once_with("2x + 3 = 11")


def test_the_route_no_longer_tells_the_model_to_transcribe_as_if_it_were_an_instruction():
    _, models = post(EQUATIONS_ONLY)
    user_text = models.interpret.await_args.args[1][1]["content"][0]["text"]
    assert "transcribe" not in user_text.lower()


def test_the_prompt_says_to_leave_instructions_empty_and_keep_words_out_of_lines():
    assert "empty string" in CAPTURE_PROMPT
    assert "Keep prose headings and task instructions out of lines" in CAPTURE_PROMPT
    assert "Never correct, simplify, complete, solve" in CAPTURE_PROMPT


@pytest.mark.parametrize("latex", [
    "2x + 3 = 11",
    r"\text{area} = 2x",
    r"\frac{x+1}{2} = 5",
    r"x \text{ is } 4",
    r"\text{Find } x \text{ if } 2x = 8",
    r"\sqrt{x+1} = 10",
])
def test_math_with_words_in_it_stays_math(latex):
    assert prose_of(latex) is None


@pytest.mark.parametrize(("latex", "sentence"), [
    (r"\text{Solve for } x.", "Solve for x."),
    (r"\text{Simplify each expression.}", "Simplify each expression."),
    (r"\text{Show your working}", "Show your working"),
])
def test_a_sentence_written_as_latex_is_recognised(latex, sentence):
    assert prose_of(latex) == sentence


def test_tidy_changes_no_equation():
    lines = [line("2+2=5"), line(r"\frac{1}{0}")]
    result = tidy_capture({"instructions": "", "lines": [dict(e) for e in lines], "diagrams": [], "warnings": []})
    assert result["lines"] == lines


# What the production capture API returned for the two fixtures in
# eval/run_instruction_fidelity.mjs before this fix (2026-11-15).
@pytest.mark.parametrize(("model_output", "instructions", "lines"), [
    (
        {"instructions": "Transcribe the following equations in LaTeX format.",
         "lines": [line("2x + 3 = 11"), line(r"\frac{x + 1}{2} = 5")]},
        "",
        ["2x + 3 = 11", r"\frac{x + 1}{2} = 5"],
    ),
    (
        {"instructions": "Transcribe the algebraic equation and instruction.",
         "lines": [line(r"\text{Solve for } x."), line("2x + 3 = 11")]},
        "Solve for x.",
        ["2x + 3 = 11"],
    ),
])
def test_the_live_outputs_from_production_come_out_right(model_output, instructions, lines):
    body, _ = post({**model_output, "diagrams": [], "warnings": []})
    assert body["instructions"] == instructions
    assert [entry["latex"] for entry in body["lines"]] == lines
