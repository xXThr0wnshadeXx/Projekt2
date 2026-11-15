from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.routes.spoken import spoken_router


def test_long_work_history_keeps_accepting_new_lines():
    import json

    models = AsyncMock()
    models.interpret.return_value = {
        "latex": "x=2", "ambiguous": False, "clarifying_question": None,
        "alternatives": [], "readback": "x equals two",
    }
    app = FastAPI()
    app.include_router(spoken_router(models, AsyncMock(return_value=True)))
    history = [f"x={index}" for index in range(40)]
    with TestClient(app) as client:
        response = client.post('/api/spoken-to-latex', json={
            'text': 'x equals two', 'context_lines': history,
        })
    assert response.status_code == 200
    messages = models.interpret.await_args.args[1]
    forwarded = json.loads(messages[1]['content'])
    assert forwarded['text'] == 'x equals two'
    assert forwarded['context_lines'] == history[-32:]


def ambiguous_payload(alternatives):
    return {
        "latex": None,
        "ambiguous": True,
        "clarifying_question": "Which part is divided by two?",
        "alternatives": alternatives,
        "readback": None,
    }


def spoken_client(models, validate):
    app = FastAPI()
    app.include_router(spoken_router(models, validate))
    return TestClient(app)


@pytest.mark.parametrize("valid", [True, False])
def test_spoken_ambiguity_keeps_the_question_whatever_sympy_makes_of_it(valid):
    """Issue #79.

    The question used to be thrown away unless every alternative parsed, so one
    unreadable option turned the demo's key moment into a 422. The student is
    the one who knows what they said, and DESIGN.md 27 marks an unparseable
    line unsure rather than dropping it — so the question stays and each option
    carries its own `valid`.
    """
    models = AsyncMock()
    alternatives = [
        {"latex": r"\frac{x+1}{2}", "readback": "x plus one, all over two"},
        {"latex": r"x+\frac{1}{2}", "readback": "x plus one half"},
    ]
    models.interpret.return_value = ambiguous_payload(alternatives)
    validate = AsyncMock(return_value=valid)

    with spoken_client(models, validate) as client:
        response = client.post("/api/spoken-to-latex", json={"text": "x plus one over two"})

    assert response.status_code == 200
    assert validate.await_count == 2
    body = response.json()
    assert body["latex"] is None
    assert body["ambiguous"] is True
    assert [option["valid"] for option in body["alternatives"]] == [valid, valid]
    assert [option["readback"] for option in body["alternatives"]] == [
        "x plus one, all over two",
        "x plus one half",
    ]


def test_spoken_ambiguity_marks_only_the_unreadable_option():
    models = AsyncMock()
    models.interpret.return_value = ambiguous_payload([
        {"latex": r"\frac{x+1}{2}", "readback": "x plus one, all over two"},
        {"latex": r"x \to 2", "readback": "x goes to two"},
    ])
    # Readable first, unreadable second — the mixed case from #79.
    validate = AsyncMock(side_effect=[True, False])

    with spoken_client(models, validate) as client:
        response = client.post("/api/spoken-to-latex", json={"text": "x plus one over two"})

    assert response.status_code == 200
    assert [option["valid"] for option in response.json()["alternatives"]] == [True, False]


@pytest.mark.parametrize(
    "alternatives",
    [
        # Only one option is not a choice.
        [{"latex": "x+1", "readback": "x plus one"}],
        # The same option twice is not a choice either.
        [
            {"latex": "x+1", "readback": "x plus one"},
            {"latex": "x+1", "readback": "x plus one"},
        ],
        # Without a readback there is nothing to say out loud.
        [
            {"latex": "x+1", "readback": ""},
            {"latex": r"\frac{x+1}{2}", "readback": "x plus one over two"},
        ],
    ],
)
def test_spoken_rejects_a_question_it_cannot_ask(alternatives):
    models = AsyncMock()
    models.interpret.return_value = ambiguous_payload(alternatives)

    with spoken_client(models, AsyncMock(return_value=True)) as client:
        response = client.post("/api/spoken-to-latex", json={"text": "x plus one over two"})

    assert response.status_code == 422
    # Never the step-check wording: the student submitted no step (#79.2).
    assert response.json()["error"]["message"] == "I couldn't work out that line. Try saying it again."


def test_spoken_says_it_heard_no_math_rather_than_judging_a_step():
    """Issue #79.2 — "I couldn't confirm this step" belongs to the step check."""
    models = AsyncMock()
    models.interpret.return_value = {
        "latex": None,
        "ambiguous": False,
        "clarifying_question": None,
        "alternatives": [],
        "readback": None,
    }

    with spoken_client(models, AsyncMock(return_value=True)) as client:
        response = client.post("/api/spoken-to-latex", json={"text": "good morning"})

    assert response.status_code == 422
    assert response.json()["error"]["message"] == "I didn't catch any math in that. Try again."


def test_spoken_line_returns_readback_and_validation():
    models = AsyncMock()
    models.interpret.return_value = {
        "latex": "2x=8",
        "ambiguous": False,
        "clarifying_question": None,
        "alternatives": [],
        "readback": "two x equals eight",
    }
    validate = AsyncMock(return_value=True)
    app = FastAPI()
    app.include_router(spoken_router(models, validate))
    with TestClient(app) as client:
        response = client.post("/api/spoken-to-latex", json={"text": "two x equals eight"})
    assert response.status_code == 200
    assert response.json() == {**models.interpret.return_value, "valid": True}
    validate.assert_awaited_once_with("2x=8")
