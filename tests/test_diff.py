"""POST /api/diff — mode-aware step check (DESIGN.md 9, 14). Issue #20."""

import pytest
from fastapi.testclient import TestClient

from backend.app import timeouts
from backend.app.config import Settings
from backend.app.explain import acceptable
from backend.app.main import create_app


class FakeExplainer:
    def __init__(self, reply="3 was subtracted from both sides."):
        self.reply = reply
        self.calls = []

    async def __call__(self, a, b):
        self.calls.append((a, b))
        return self.reply


@pytest.fixture(scope="module", autouse=True)
def _pool():
    yield
    timeouts.shutdown()


def make_client(explainer=None):
    app = create_app(Settings(_env_file=None), warm_cas=False, explainer=explainer)
    return TestClient(app, raise_server_exceptions=False)


def post(client, a, b, mode):
    return client.post("/api/diff", json={"from_latex": a, "to_latex": b, "mode": mode})


def test_study_mode_explains_a_verified_step():
    explainer = FakeExplainer()
    with make_client(explainer) as client:
        r = post(client, "2x + 3 = 11", "2x = 8", "study")
    assert r.status_code == 200
    assert r.json() == {
        "verified": True,
        "method": "ratio_constant",
        "message": "3 was subtracted from both sides.",
    }
    assert explainer.calls == [("2x + 3 = 11", "2x = 8")]


def test_homework_mode_never_calls_the_model():
    explainer = FakeExplainer()
    with make_client(explainer) as client:
        r = post(client, "2x = 8", "x = 4", "homework")
    assert r.json()["message"] == "This step checks out."
    assert explainer.calls == []


@pytest.mark.parametrize("mode", ["study", "homework"])
def test_unverified_step_is_couldnt_confirm_and_never_explained(mode):
    explainer = FakeExplainer()
    with make_client(explainer) as client:
        r = post(client, "2x + 3 = 11", "2x = 9", mode)
    body = r.json()
    assert r.status_code == 200
    assert body["verified"] is False
    assert body["message"] == "I couldn't confirm this step."
    assert "wrong" not in r.text.lower()
    assert explainer.calls == []  # explanation only after SymPy verifies


def test_exam_mode_is_403_and_does_no_work():
    explainer = FakeExplainer()
    with make_client(explainer) as client:
        r = post(client, "2x = 8", "x = 4", "exam")
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "MODE_DISABLED"
    assert explainer.calls == []


def test_unparseable_line_is_couldnt_confirm():
    with make_client() as client:
        r = post(client, "2x + 3 = 11", "x +", "homework")
    assert r.json() == {
        "verified": False,
        "method": "unparseable",
        "message": "I couldn't confirm this step.",
    }


def test_study_mode_without_models_falls_back_to_checks_out():
    with make_client(None) as client:
        r = post(client, "2x = 8", "x = 4", "study")
    assert r.json()["message"] == "This step checks out."


def test_rejected_explanation_falls_back():
    with make_client(FakeExplainer(None)) as client:
        r = post(client, "2x = 8", "x = 4", "study")
    assert r.json()["message"] == "This step checks out."


def test_bad_input_uses_error_shape():
    with make_client() as client:
        r = client.post("/api/diff", json={"from_latex": "", "to_latex": "x", "mode": "study"})
        r2 = client.post("/api/diff", json={"from_latex": "x", "to_latex": "x", "mode": "solve"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "BAD_INPUT"
    assert r2.status_code == 400


def test_timeout_returns_timeout_error(monkeypatch):
    from backend.app.routes import diff as diff_route

    async def slow(*_):
        raise timeouts.CasTimeout()

    monkeypatch.setattr(diff_route, "check_step", slow)
    with make_client() as client:
        r = post(client, "2x = 8", "x = 4", "homework")
    assert r.status_code == 504
    assert r.json()["error"]["code"] == "TIMEOUT"


@pytest.mark.parametrize(
    "text, ok",
    [
        ("3 was subtracted from both sides.", True),
        ("Both sides were divided by 2.", True),
        ("Both sides were divided by 2. Next, subtract 4.", False),
        ("Now you should subtract 3.", False),
        ("The answer is x = 4.", False),
        ("Try dividing both sides by 2.", False),
        # No forbidden word, and still a value handed over.
        ("3 was subtracted from both sides, giving x = 4.", False),
        ("Both sides were divided by 2 to get x equals 4.", False),
        ("Dividing by 2 leaves x alone, which is 4.", False),
        ("The left side was factored.", True),
        ("Like terms were combined on the left side.", True),
        ("", False),
        ("x" * 200, False),
    ],
)
def test_explanation_guard(text, ok):
    assert acceptable(text) is ok
