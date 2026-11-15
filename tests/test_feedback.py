from unittest.mock import AsyncMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.errors import install_error_handlers
from backend.app.routes.feedback import feedback_router


def client_for(result):
    models = AsyncMock()
    models.interpret.return_value = result
    app = FastAPI()

    install_error_handlers(app)
    app.include_router(feedback_router(models))
    return TestClient(app, raise_server_exceptions=False), models


BODY = {"problem_lines": ["2x+3=11"], "work_lines": ["2x=8", "x=4"], "kind": "review"}


def test_homework_review_is_confirmed_with_neutral_wording():
    client, models = client_for({"outcome": "confirmed", "message": "Your submitted work is consistent."})
    with client:
        response = client.post("/api/feedback", json={**BODY, "mode": "homework"})
    assert response.status_code == 200
    assert response.json() == {"outcome": "confirmed", "message": "Nothing stood out for another look."}
    assert models.interpret.await_args.args[0] == "feedback"


def test_default_mode_is_reader_and_refused_before_model_call():
    client, models = client_for({"outcome": "confirmed", "message": "unused"})
    with client:
        response = client.post("/api/feedback", json=BODY)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "MODE_DISABLED"
    models.interpret.assert_not_awaited()


def test_reader_and_exam_are_refused_before_model_call():
    for mode in ("reader", "exam"):
        client, models = client_for({"outcome": "confirmed", "message": "unused"})
        with client:
            response = client.post("/api/feedback", json={**BODY, "mode": mode})
        assert response.status_code == 403
        models.interpret.assert_not_awaited()


def test_needs_review_passes_the_model_message_through():
    client, _ = client_for({"outcome": "needs_review", "message": "Look again at the grouping in line 2."})
    with client:
        response = client.post("/api/feedback", json={**BODY, "mode": "study"})
    assert response.json() == {"outcome": "needs_review", "message": "Look again at the grouping in line 2."}


def test_evaluative_or_answer_like_output_is_replaced():
    for message in ("The answer is x = 4.", "Line 2 is wrong.", "That is correct."):
        client, _ = client_for({"outcome": "needs_review", "message": message})
        with client:
            response = client.post("/api/feedback", json={**BODY, "mode": "study"})
        text = response.json()["message"].lower()
        assert text == "i have nothing to add on this one."


def test_hint_output_is_filtered():
    client, _ = client_for({"outcome": "hint", "message": "The answer is x = 4."})
    with client:
        response = client.post("/api/feedback", json={**BODY, "mode": "study", "kind": "hint"})
    assert response.json()["outcome"] == "hint"
    assert "answer" not in response.json()["message"].lower()
