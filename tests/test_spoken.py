from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.routes.spoken import spoken_router


@pytest.mark.parametrize("valid, status", [(True, 200), (False, 422)])
def test_spoken_ambiguity_requires_two_valid_choices(valid, status):
    models = AsyncMock()
    alternatives = [
        {"latex": r"\frac{x+1}{2}", "readback": "x plus one, all over two"},
        {"latex": r"x+\frac{1}{2}", "readback": "x plus one half"},
    ]
    models.interpret.return_value = {
        "latex": None,
        "ambiguous": True,
        "clarifying_question": "Which part is divided by two?",
        "alternatives": alternatives,
        "readback": None,
    }
    validate = AsyncMock(return_value=valid)
    app = FastAPI()
    app.include_router(spoken_router(models, validate))
    with TestClient(app) as client:
        response = client.post("/api/spoken-to-latex", json={"text": "x plus one over two"})

    assert response.status_code == status
    assert validate.await_count == 2
    if valid:
        assert response.json()["alternatives"] == alternatives
        assert response.json()["latex"] is None


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
