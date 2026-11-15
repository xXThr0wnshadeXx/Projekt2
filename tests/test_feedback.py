from unittest.mock import AsyncMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.routes.feedback import feedback_router


def client_for(result):
    models = AsyncMock()
    models.interpret.return_value = result
    app = FastAPI()
    app.include_router(feedback_router(models))
    return TestClient(app), models


def test_feedback_returns_safe_final_review():
    client, models = client_for({"outcome": "confirmed", "message": "Your submitted work is consistent."})
    with client:
        response = client.post("/api/feedback", json={
            "problem_lines": ["2x+3=11"], "work_lines": ["2x=8", "x=4"],
            "mode": "homework", "kind": "review",
        })
    assert response.json() == {"outcome": "confirmed", "message": "Your submitted work is consistent."}
    assert models.interpret.await_args.args[0] == "feedback"


def test_feedback_refuses_exam_before_model_call():
    client, models = client_for({"outcome": "confirmed", "message": "unused"})
    with client:
        response = client.post("/api/feedback", json={
            "problem_lines": ["x=1"], "work_lines": ["x=1"], "mode": "exam", "kind": "review",
        })
    assert response.status_code == 403
    models.interpret.assert_not_awaited()


def test_feedback_replaces_answer_like_model_output_with_safe_message():
    client, _ = client_for({"outcome": "hint", "message": "The answer is x = 4."})
    with client:
        response = client.post("/api/feedback", json={
            "problem_lines": ["2x+3=11"], "work_lines": ["2x=8"], "mode": "study", "kind": "hint",
        })
    assert response.json()["outcome"] == "hint"
    assert "answer" not in response.json()["message"].lower()
