"""POST /api/validate — whether SymPy can read a typed line, with no model."""

import pytest
from fastapi.testclient import TestClient

from backend.app import timeouts
from backend.app.config import Settings
from backend.app.main import create_app


@pytest.fixture(scope="module", autouse=True)
def _pool():
    yield
    timeouts.shutdown()


@pytest.fixture(scope="module")
def client():
    # No model credentials: this route must work on a keyless server.
    app = create_app(Settings(_env_file=None), warm_cas=False)
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.mark.parametrize(
    "latex",
    ["2x = 8", r"\frac{x+1}{2} = 5", r"\sqrt{x+1}", "x^{2} - 5x + 6 = 0", r"3 \cdot 4"],
)
def test_readable_math_is_valid(client, latex):
    r = client.post("/api/validate", json={"latex": latex})
    assert r.status_code == 200
    assert r.json() == {"valid": True}


@pytest.mark.parametrize("latex", ["2x +", r"\frac{x+1}{", "x = y = z"])
def test_unreadable_math_is_not_valid_and_not_an_error(client, latex):
    r = client.post("/api/validate", json={"latex": latex})
    assert r.status_code == 200
    assert r.json() == {"valid": False}


def test_the_answer_is_one_boolean_and_nothing_else(client):
    """Nothing parsed, simplified or solved may ride along with the flag."""
    r = client.post("/api/validate", json={"latex": "2x + 3 = 11"})
    assert set(r.json()) == {"valid"}


@pytest.mark.parametrize("body", [{}, {"latex": ""}, {"latex": "x" * 501}])
def test_bad_input_is_refused(client, body):
    assert client.post("/api/validate", json=body).status_code == 400
