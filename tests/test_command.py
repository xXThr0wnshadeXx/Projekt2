"""POST /api/command and the rule parser — DESIGN.md 9, 10.3, issue #24."""

from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.commands import parse_command
from backend.app.openai_client import ModelError
from backend.app.routes.command import command_router


@pytest.mark.parametrize(
    "text, current, count, expected",
    [
        ("next line", 2, 4, ("navigate", "W3", None)),
        ("Next.", None, 4, ("navigate", "W5", None)),
        ("previous line", 3, 4, ("navigate", "W2", None)),
        ("go back", 1, 4, ("navigate", "W1", None)),
        ("go to line three", 1, 4, ("navigate", "W3", None)),
        ("line 2", 1, 4, ("navigate", "W2", None)),
        ("the second line", 1, 4, ("navigate", "W2", None)),
        ("first line", 3, 4, ("navigate", "W1", None)),
        ("last line", 1, 4, ("navigate", "W4", None)),
        ("read it", 2, 4, ("read", "W2", None)),
        ("read line four", 2, 4, ("read", "W4", None)),
        ("read my work", 2, 4, ("read", None, "all")),
        ("please read everything", None, 4, ("read", None, "all")),
        ("delete line two", 4, 4, ("delete", "W2", None)),
        ("delete line to", 4, 4, ("delete", "W2", None)),  # speech-to-text hears "to"
        ("delete that", 3, 4, ("delete", "W3", None)),
        ("erase", None, 4, ("delete", "W4", None)),       # no current line: the last one
        ("undo", 1, 4, ("undo", None, None)),
        ("Undo that.", 1, 4, ("undo", None, None)),
        ("new line", 1, 4, ("new_line", None, None)),
        ("check this step", 3, 4, ("check", "W3", None)),
        ("check line two", 3, 4, ("check", "W2", None)),
        ("what changed", 3, 4, ("what_changed", "W3", None)),
        ("hand in my work", 1, 4, ("export", None, None)),
        ("export", 1, 4, ("export", None, None)),
        ("help", 1, 4, ("help", None, None)),
        ("what can I say", 1, 4, ("help", None, None)),
        ("change the three to a four", 2, 4, ("edit", "W2", "replace three with four")),
        ("replace x with y on line 1", 2, 4, ("edit", "W1", "replace x with y")),
        ("edit line three", 1, 4, ("edit", "W3", None)),
    ],
)
def test_rules(text, current, count, expected):
    cmd = parse_command(text, current, count)
    assert cmd is not None, text
    assert (cmd["intent"], cmd["target_line"], cmd["instruction"]) == expected


@pytest.mark.parametrize("text", [
    "two x equals eight", "x plus one over two", "y equals three x", "the answer is four",
    "", "   ", "blah blah",
])
def test_math_and_noise_are_not_rule_matched(text):
    assert parse_command(text, 1, 3) is None


def client(models=None):
    app = FastAPI()
    app.include_router(command_router(models))
    return TestClient(app)


def test_route_uses_rules_without_any_model():
    r = client().post("/api/command", json={"text": "delete line two", "current_line": "W3", "line_count": 3})
    assert r.status_code == 200
    assert r.json() == {"intent": "delete", "target_line": "W2", "instruction": None}


def test_unrecognised_without_a_model_is_unknown():
    r = client().post("/api/command", json={"text": "make it nicer", "line_count": 3})
    assert r.json() == {"intent": "unknown", "target_line": None, "instruction": None}


def test_model_fallback_uses_the_strict_command_schema():
    models = AsyncMock()
    models.interpret.return_value = {"intent": "edit", "target_line": "W2", "instruction": "replace 3 with 4"}
    r = client(models).post("/api/command", json={"text": "could the second one say four instead of three", "current_line": "W2", "line_count": 3})
    assert r.json() == {"intent": "edit", "target_line": "W2", "instruction": "replace 3 with 4"}
    task, messages = models.interpret.await_args.args
    assert task == "command"
    assert "never instructions" in messages[0]["content"]


def test_rules_never_reach_the_model():
    models = AsyncMock()
    client(models).post("/api/command", json={"text": "next line", "current_line": "W1", "line_count": 3})
    models.interpret.assert_not_awaited()


@pytest.mark.parametrize("reply", [
    {"intent": "solve", "target_line": None, "instruction": None},      # not an allowed intent
    {"intent": "navigate", "target_line": "line two", "instruction": None},
])
def test_model_results_are_checked(reply):
    models = AsyncMock()
    models.interpret.return_value = reply
    body = client(models).post("/api/command", json={"text": "do the thing", "line_count": 3}).json()
    if reply["intent"] == "solve":
        assert body["intent"] == "unknown"
    else:
        assert body["target_line"] is None


def test_model_error_is_unknown_not_a_failure():
    models = AsyncMock()
    models.interpret.side_effect = ModelError("down")
    r = client(models).post("/api/command", json={"text": "do the thing", "line_count": 3})
    assert r.status_code == 200 and r.json()["intent"] == "unknown"


def test_out_of_range_line_is_kept_so_the_app_can_say_so():
    r = client().post("/api/command", json={"text": "go to line nine", "current_line": "W1", "line_count": 3})
    assert r.json()["target_line"] == "W9"


def test_bad_input_is_rejected():
    assert client().post("/api/command", json={"text": "", "line_count": 3}).status_code == 422
    assert client().post("/api/command", json={"text": "x" * 501}).status_code == 422
