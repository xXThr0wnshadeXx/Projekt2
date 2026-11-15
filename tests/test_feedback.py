"""/api/feedback: one review of finished work, templated, never in exam (#215)."""

from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.errors import install_error_handlers
from backend.app.openai_client import ModelError
from backend.app.routes.feedback import (
    LOOK_AGAIN_SOMEWHERE,
    NOTHING_STOOD_OUT,
    UNAVAILABLE,
    feedback_router,
)

WORK = {"problem_lines": ["2x+3=11"], "work_lines": ["2x=8", "x=4"]}


def client_for(result=None, error=None):
    models = AsyncMock()
    if error is not None:
        models.interpret.side_effect = error
    else:
        models.interpret.return_value = result
    app = FastAPI()
    install_error_handlers(app)
    app.include_router(feedback_router(models))
    return TestClient(app), models


def post(client, **overrides):
    with client:
        return client.post("/api/feedback", json={**WORK, "mode": "homework", **overrides})


def test_nothing_flagged_is_said_neutrally():
    client, models = client_for({"outcome": "nothing_flagged", "line": None})
    response = post(client)
    assert response.json() == {"outcome": "nothing_flagged", "line": None, "message": NOTHING_STOOD_OUT}
    assert models.interpret.await_args.args[0] == "feedback"


def test_a_flagged_line_is_named_by_number_only():
    client, _ = client_for({"outcome": "look_again", "line": 2})
    assert post(client).json() == {
        "outcome": "look_again", "line": 2, "message": "Line 2 of your work may be worth another look.",
    }


@pytest.mark.parametrize("line", [None, 0, 3, -1])
def test_a_line_outside_the_work_is_not_named(line):
    client, _ = client_for({"outcome": "look_again", "line": line})
    assert post(client).json() == {"outcome": "look_again", "line": None, "message": LOOK_AGAIN_SOMEWHERE}


@pytest.mark.parametrize("reply", [
    {"outcome": "hint", "line": None},
    {"outcome": "nothing_flagged", "line": None, "message": "The answer is x = 4."},
    {"outcome": "look_again", "line": "2x=8"},
    "x = 4",
])
def test_anything_but_an_outcome_and_a_line_is_refused(reply):
    client, _ = client_for(reply)
    response = post(client)
    assert response.status_code == 502
    assert response.json()["error"]["message"] == UNAVAILABLE


def test_model_text_never_reaches_the_student():
    client, _ = client_for({"outcome": "look_again", "line": 1, "extra": "Try subtracting 3."})
    response = post(client)
    assert "subtract" not in response.text.lower()


def test_a_failed_review_is_not_a_verdict():
    client, _ = client_for(error=ModelError("down"))
    response = post(client)
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "MODEL_ERROR"
    assert response.json()["error"]["message"] == UNAVAILABLE


def test_exam_is_refused_before_any_model_call():
    client, models = client_for({"outcome": "nothing_flagged", "line": None})
    response = post(client, mode="exam")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "MODE_DISABLED"
    models.interpret.assert_not_awaited()


def test_hints_are_not_a_request_kind():
    client, models = client_for({"outcome": "nothing_flagged", "line": None})
    response = post(client, kind="hint")
    # The field is ignored: there is only one kind of request, and it is a review.
    assert response.json()["outcome"] == "nothing_flagged"
    assert "hint" not in models.interpret.await_args.args[1][1]["content"]


def test_blank_or_long_lines_are_refused():
    client, models = client_for({"outcome": "nothing_flagged", "line": None})
    assert post(client, work_lines=["  "]).status_code == 400
    assert post(client, work_lines=["x" * 501]).status_code == 400
    models.interpret.assert_not_awaited()
