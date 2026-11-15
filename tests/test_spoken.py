import json
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.routes.spoken import spoken_router


ROOT_FRACTION = "the square root of x plus one all over two equals five"
ROOT_QUESTION = (
    "Is plus one under the root, as in the square root of the quantity x plus one, end root, "
    "or outside the root, as in the square root of x, end root, plus one?"
)
ROOT_ALTERNATIVES = [
    {
        "latex": r"\frac{\sqrt{x+1}}{2}=5",
        "readback": "the square root of the quantity x plus one, end root, all over two equals five",
    },
    {
        "latex": r"\frac{\sqrt{x}+1}{2}=5",
        "readback": "the square root of x, end root, plus one, all over two equals five",
    },
]


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


def test_spoken_root_clarifies_only_the_scope_of_the_root():
    async def interpret(kind, messages):
        assert kind == "spoken"
        prompt = " ".join(messages[0]["content"].split())
        assert "sound different" in prompt
        assert "parentheses or quotation marks" in prompt
        assert "All over already fixes the numerator" in prompt
        assert "the quantity x plus one, end root" in prompt
        assert "the square root of x, end root, plus one" in prompt
        assert json.loads(messages[1]["content"]) == {
            "text": ROOT_FRACTION,
            "context_lines": ["2x + 3 = 11"],
        }
        return {
            **ambiguous_payload(ROOT_ALTERNATIVES),
            "clarifying_question": ROOT_QUESTION,
        }

    models = AsyncMock()
    models.interpret.side_effect = interpret
    validate = AsyncMock(return_value=True)
    with spoken_client(models, validate) as client:
        response = client.post("/api/spoken-to-latex", json={
            "text": ROOT_FRACTION,
            "context_lines": ["2x + 3 = 11"],
        })

    assert response.status_code == 200
    result = response.json()
    assert result["ambiguous"] is True
    assert result["latex"] is None
    assert result["readback"] is None
    question = result["clarifying_question"]
    assert question == ROOT_QUESTION
    assert "all over" not in question
    assert result["alternatives"] == [{**option, "valid": True} for option in ROOT_ALTERNATIVES]
    readbacks = [option["readback"] for option in result["alternatives"]]
    assert len(readbacks) == len(set(readbacks))
    assert all(set(text).isdisjoint("()\"'“”‘’") for text in [question, *readbacks])
    models.interpret.assert_awaited_once()


@pytest.mark.parametrize(("field", "value"), [
    ("readback", ROOT_ALTERNATIVES[0]["readback"]),
    ("readback", ROOT_ALTERNATIVES[0]["readback"].upper().replace(" ", "  ")),
    ("clarifying_question", "Do you mean the square root of (x plus one), or end root, plus one?"),
    ("clarifying_question", "Do you mean the square root of x plus one), or end root, plus one?"),
    ("clarifying_question", 'Do you mean "x plus one" under the root?'),
    ("clarifying_question", "Is 'plus one' outside the root?"),
    ("readback", "the square root of (x plus one), all over two equals five"),
    ("readback", "the square root of x, end root, plus one), all over two equals five"),
    ("readback", 'the square root of x, then "plus one", all over two equals five'),
    ("readback", "the square root of x, then ‘plus one’, all over two equals five"),
    ("readback", "the square root of x, then “plus one”, all over two equals five"),
])
def test_spoken_rejects_choices_the_student_cannot_tell_apart(field, value):
    result = ambiguous_payload([dict(option) for option in ROOT_ALTERNATIVES])
    result["clarifying_question"] = ROOT_QUESTION
    if field == "readback":
        result["alternatives"][1]["readback"] = value
    else:
        result[field] = value
    models = AsyncMock()
    models.interpret.return_value = result
    validate = AsyncMock(return_value=True)

    with spoken_client(models, validate) as client:
        response = client.post("/api/spoken-to-latex", json={"text": ROOT_FRACTION})

    assert response.status_code == 422
    assert response.json() == {"error": {
        "code": "UNPARSEABLE", "message": "I couldn't work out that line. Try saying it again.",
    }}
    validate.assert_not_awaited()


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
        response = client.post("/api/spoken-to-latex", json={"text": "x one two, said with unclear grouping"})

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
        response = client.post("/api/spoken-to-latex", json={"text": "x one two, said with unclear grouping"})

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
        response = client.post("/api/spoken-to-latex", json={"text": "x one two, said with unclear grouping"})

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
