"""A spoken line may contain only what the student said (spoken_guard.py)."""

from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.routes.spoken import spoken_router
from backend.app.spoken_guard import adds_to_what_was_said


@pytest.mark.parametrize(
    "transcript, latex",
    [
        ("two x equals eight", "2x = 8"),
        ("uh so I think it's two x equals eight", "2x=8"),
        ("2x equals 8", "2x = 8"),
        ("x squared minus five x plus six equals zero", "x^{2} - 5x + 6 = 0"),
        ("x plus one half", r"x + \frac{1}{2}"),
        ("x plus a half", r"x + \frac{1}{2}"),
        ("two thirds x equals four", r"\frac{2}{3}x = 4"),
        ("twenty one y equals one hundred and five", "21y = 105"),
        ("three point five x equals seven", "3.5x = 7"),
        ("the square root of x plus one all over two equals five", r"\frac{\sqrt{x+1}}{2} = 5"),
        ("ex equals negative four", "x = -4"),
        ("x to the fourth", "x^{4}"),
        ("sine of theta equals one", r"\sin\theta = 1"),
        ("wait no x equals five sorry x equals four", "x = 4"),
    ],
)
def test_a_line_made_of_what_was_said_is_kept(transcript, latex):
    assert adds_to_what_was_said(latex, transcript) is False


@pytest.mark.parametrize(
    "transcript, latex",
    [
        # The model carried out the operation the student described.
        ("next I divide both sides by two", r"\frac{2x+3}{2} = \frac{11}{2}"),
        ("subtract three from both sides", "2x = 8"),
        ("subtract y from both sides", "x = z - y"),
        # The model handed back a prior line as though it had been spoken.
        ("can you read the problem again", "2x + 3 = 11"),
        # The model answered.
        ("what is x", "x = 4"),
        ("solve it", "x = 4"),
        ("two x equals eight so", "x = 4"),
    ],
)
def test_a_line_that_brings_in_anything_else_is_refused(transcript, latex):
    assert adds_to_what_was_said(latex, transcript) is True


def _client(reply):
    models = AsyncMock()
    models.interpret.return_value = reply
    app = FastAPI()
    app.include_router(spoken_router(models, AsyncMock(return_value=True)))
    return TestClient(app)


def test_the_route_refuses_a_step_the_model_carried_out():
    reply = {
        "latex": r"\frac{2x+3}{2} = \frac{11}{2}",
        "ambiguous": False,
        "clarifying_question": None,
        "alternatives": [],
        "readback": "2 x plus 3 over 2 equals 11 over 2",
    }
    with _client(reply) as client:
        r = client.post(
            "/api/spoken-to-latex",
            json={"text": "next I divide both sides by two", "context_lines": ["2x + 3 = 11"]},
        )
    assert r.status_code == 422
    body = r.json()["error"]
    assert body["code"] == "UNPARSEABLE"
    assert body["message"] == "I only write down a line you say in full. Say the whole line."
    # Nothing of the computed line leaks out with the refusal.
    assert "frac" not in r.text and "11" not in r.text


def test_the_route_refuses_alternatives_the_student_did_not_say():
    reply = {
        "latex": None,
        "ambiguous": True,
        "clarifying_question": "Which did you mean?",
        "alternatives": [
            {"latex": "x = 4", "readback": "x equals four"},
            {"latex": "x = 5", "readback": "x equals five"},
        ],
        "readback": None,
    }
    with _client(reply) as client:
        r = client.post("/api/spoken-to-latex", json={"text": "what is x"})
    assert r.status_code == 422
