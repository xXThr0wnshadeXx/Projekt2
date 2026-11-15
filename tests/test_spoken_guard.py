"""A spoken line may contain only what the student said (spoken_guard.py)."""

from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.routes.spoken import spoken_router
from backend.app.spoken_guard import adds_to_what_was_said, text_adds_to_what_was_said


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


@pytest.mark.parametrize(
    "transcript, latex",
    [
        ("x equals a hundred", "x = 100"),
        ("x equals a thousand", "x = 1000"),
        ("x equals 1,000", "x = 1000"),
        ("x equals one thousand", "x = 1{,}000"),
        ("x equals point five", "x = 0.5"),
        ("half of x", r"\frac{1}{2}x"),
        ("double u equals three", "w = 3"),
        ("a plus b equals c", "a + b = c"),
        ("x plus a equals five", "x + a = 5"),
        ("x equals eight four", "x = 84"),
        ("x to the second power", "x^{2}"),
        ("the third root of x", r"\sqrt[3]{x}"),
        ("x squared plus pi", r"x^{2} + \pi"),
        ("x is less than five", "x < 5"),
        ("x equals three over two", r"x = \frac{3}{2}"),
        ("x equals three point one four", "x = 3.14"),
        ("sine of x equals one", r"\operatorname{sin} x = 1"),
        ("let's say x equals five", "x = 5"),
    ],
)
def test_legitimate_dictation_is_kept(transcript, latex):
    assert adds_to_what_was_said(latex, transcript) is False


@pytest.mark.parametrize(
    "transcript, latex",
    [
        # B: text wrappers and constants are checked, not blanked.
        ("two x equals eight", r"2x = 8 \text{ so } x = 4"),
        ("two x equals eight", r"2x = 8 \text{ so}"),
        ("two x equals eight", r"2x = 8 \mathrm{so}"),
        ("two x equals eight", r"2x = 8 \operatorname{so}"),
        ("x equals two", r"x = 2 \pi"),
        ("x equals two", r"x = 2 \theta"),
        ("x equals two", r"x = \infty"),
        ("x equals two", r"x = \Delta"),
        # C1: only a spoken letter licenses a variable.
        ("this is so", "is = so"),
        ("this is so", "s = o"),
        ("hold on a second", "a = 2"),
        ("I think so", "i = 1"),
        # C2: "a" is not one, a second is not two.
        ("hold on a second", "1"),
        ("hold on a second", "2"),
        ("x equals a y", "x = 1y"),
        ("x equals the second one", "x = 2"),
        ("x equals the first", "x = 1"),
        # C3: digits must have been said as that number.
        ("eight and then four", "84"),
        ("x equals eight y equals four", "x = 84"),
        ("one two", "x = 3"),
        # C4: signs and relations.
        ("x plus three equals five", "x - 3 = 5"),
        ("x plus three equals five", "x^{-3} = 5"),
        ("x plus three five", "x + 3 = 5"),
        ("x plus three equals five", "x + 3 < 5"),
        ("x plus three equals five", r"x + 3 \neq 5"),
        # D guard rails: the decimal's fraction digits still have to be said.
        ("x equals point five", "x = 0.6"),
    ],
)
def test_the_leaks_the_audit_found_are_refused(transcript, latex):
    assert adds_to_what_was_said(latex, transcript) is True


@pytest.mark.parametrize(
    "transcript, text",
    [
        ("two x equals eight", "2 x equals 8"),
        ("two x equals eight", "two x equals eight"),
        ("x equals negative four", "x equals negative 4"),
        ("a plus b over c", "a plus b, all over c"),
        ("a plus b over c", "a plus the fraction b over c"),
        ("x plus one over two", "Which one did you mean?"),
        ("x plus one over two", "I heard two ways to read it."),
        ("hold on a second x equals five", "I heard x equals five"),
        ("x equals a hundred", "x equals one hundred"),
        ("x equals twenty one", "x equals twenty-one"),
        (None, None),
    ],
)
def test_model_text_made_of_what_was_said_is_kept(transcript, text):
    assert text_adds_to_what_was_said(text, transcript or "") is False


@pytest.mark.parametrize(
    "transcript, text",
    [
        ("two x equals eight", "2 x equals 8, so x equals 4"),
        ("two x equals eight", "two x equals eight, so x equals four"),
        ("two x equals eight", "2 x equals 8, so x is 4"),
        ("two x equals eight", "x equals four"),
        ("x plus three equals five", "x minus 3 equals 5"),
        ("two x equals eight", "Did you mean y?"),
        ("x equals five", "x equals fifty"),
        ("x equals twenty", "x equals twenty one"),
        ("a plus b", "a plus c"),
    ],
)
def test_model_text_that_brings_in_anything_else_is_refused(transcript, text):
    assert text_adds_to_what_was_said(text, transcript) is True


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


def _clear(transcript, latex="2x = 8", readback="2 x equals 8", **extra):
    reply = {
        "latex": latex, "ambiguous": False, "clarifying_question": None,
        "alternatives": [], "readback": readback, **extra,
    }
    with _client(reply) as client:
        return client.post("/api/spoken-to-latex", json={"text": transcript})


def test_the_route_refuses_a_readback_that_solves_the_line():
    r = _clear("two x equals eight", readback="2 x equals 8, so x equals 4")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "UNPARSEABLE"
    assert "so x equals" not in r.text


def test_the_route_keeps_a_readback_made_of_what_was_said():
    assert _clear("two x equals eight").status_code == 200


def test_the_route_refuses_a_clarifying_question_that_brings_in_a_number():
    r = _clear("two x equals eight", clarifying_question="Did you mean 4?")
    assert r.status_code == 422


def _ambiguous(
    question="Which part is over c?",
    readbacks=("a plus b, all over c", "a plus b over c"),
):
    return {
        "latex": None, "ambiguous": True, "clarifying_question": question,
        "alternatives": [
            {"latex": r"\frac{a+b}{c}", "readback": readbacks[0]},
            {"latex": r"a + \frac{b}{c}", "readback": readbacks[1]},
        ],
        "readback": None,
    }


def _ask(reply, transcript="a plus b over c all over again"):
    # Not the bare "a plus b over c" shape, which the route answers itself.
    with _client(reply) as client:
        return client.post("/api/spoken-to-latex", json={"text": transcript})


def test_the_route_keeps_a_clean_clarifying_question_and_readbacks():
    assert _ask(_ambiguous()).status_code == 200


def test_the_route_refuses_an_alternative_readback_that_adds_a_number():
    r = _ask(_ambiguous(readbacks=("a plus b, all over c, which is 4", "a plus b over c")))
    assert r.status_code == 422


def test_the_route_refuses_a_question_that_adds_a_variable():
    assert _ask(_ambiguous(question="Which part is over d?")).status_code == 422
