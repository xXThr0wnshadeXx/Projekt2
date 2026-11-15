"""Fifty dictated lines: 33 ordinary, 17 intentionally incorrect/unfinished.

The scribe must preserve every one. These are synthetic contract cases, not
a live speech/model accuracy result. Mutations below represent model repairs.
"""

import pytest

from backend.app.spoken_guard import adds_to_what_was_said


LINES = [
    ("two x minus three equals eleven", "2x-3=11", False),
    ("x plus two equals five", "x+2=5", False),
    ("x minus two equals five", "x-2=5", False),
    ("negative x equals four", "-x=4", False),
    ("x equals negative four", "x=-4", False),
    ("negative x equals negative four", "-x=-4", False),
    ("two times x equals eight", r"2\times x=8", False),
    ("six divided by two equals three", r"6\div2=3", False),
    ("x over two equals five", r"\frac{x}{2}=5", False),
    ("x plus one all over two equals five", r"\frac{x+1}{2}=5", False),
    ("x plus one half", r"x+\frac{1}{2}", False),
    ("two thirds x equals four", r"\frac{2}{3}x=4", False),
    ("x squared plus one", "x^2+1", False),
    ("x cubed minus two", "x^3-2", False),
    ("x to the fourth equals sixteen", "x^{4}=16", False),
    ("x to the power of negative two", "x^{-2}", False),
    ("square root of x plus one equals five", r"\sqrt{x+1}=5", False),
    ("cube root of eight equals two", r"\sqrt[3]{8}=2", False),
    ("fourth root of sixteen equals two", r"\sqrt[4]{16}=2", False),
    ("x less than three", "x<3", False),
    ("x greater than three", "x>3", False),
    ("x less than or equal to three", r"x\leq3", False),
    ("x greater than or equal to three", r"x\geq3", False),
    ("x does not equal three", r"x\ne3", False),
    ("x plus or minus two", r"x\pm2", False),
    ("x minus y plus z equals zero", "x-y+z=0", False),
    ("x minus negative two equals four", "x-(-2)=4", False),
    ("negative one over two", r"\frac{-1}{2}", False),
    ("one over negative two", r"\frac{1}{-2}", False),
    ("the square root of x plus one all over two equals five", r"\frac{\sqrt{x+1}}{2}=5", False),
    ("three point five x equals seven", "3.5x=7", False),
    ("2x - 3 = 11", "2x-3=11", False),
    ("wait no x equals five sorry x equals four", "x=4", False),
    ("two plus two equals five", "2+2=5", True),
    ("three times three equals eight", r"3\times3=8", True),
    ("eight divided by two equals three", r"8\div2=3", True),
    ("two minus five equals three", "2-5=3", True),
    ("negative three less than negative four", "-3<-4", True),
    ("three greater than five", "3>5", True),
    ("two less than or equal to one", r"2\le1", True),
    ("two greater than or equal to three", r"2\ge3", True),
    ("two does not equal two", r"2\ne2", True),
    ("square root of nine equals two", r"\sqrt{9}=2", True),
    ("cube root of eight equals three", r"\sqrt[3]{8}=3", True),
    ("two squared equals five", "2^2=5", True),
    ("one half equals two", r"\frac{1}{2}=2", True),
    ("x equals", "x=", True),
    ("x plus", "x+", True),
    ("two x minus three equals", "2x-3=", True),
    ("x squared minus", "x^2-", True),
]


def test_fifty_line_set_includes_seventeen_incorrect_or_unfinished_lines():
    assert len(LINES) == 50
    assert sum(incorrect for _, _, incorrect in LINES) == 17


@pytest.mark.parametrize("spoken,latex,incorrect", LINES)
def test_scribe_keeps_exact_dictation_even_when_the_math_is_incorrect(spoken, latex, incorrect):
    assert adds_to_what_was_said(latex, spoken) is False


@pytest.mark.parametrize("spoken,latex", [
    ("two x minus three equals eleven", "2x+3=11"),
    ("x plus two", "x-2"),
    ("x minus two", "x+2"),
    ("negative x equals four", "x=-4"),
    ("x equals negative four", "-x=4"),
    ("negative x equals negative four", "x=4"),
    ("x minus y plus z", "x+y-z"),
    ("x minus negative two", "x+2"),
    ("x plus y plus z", "x+y-z"),
    ("x plus y", "x+y+y"),
    ("x equals two equals two", "x=2"),
    ("two times x", "2+x"),
    ("six divided by two", r"6\times2"),
    ("x over two", "x-2"),
    ("x less than three", "x>3"),
    ("x greater than three", r"x\ge3"),
    ("x less than or equal to three", "x<3"),
    ("x does not equal three", "x=3"),
    ("x plus or minus two", "x+2"),
    ("x squared", "x+2"),
    ("x plus two", "x^2"),
    ("square root of eight", r"\sqrt[3]{8}"),
    ("cube root of eight", r"\sqrt{8}"),
    ("x equals", "x=0"),
    ("two plus two equals five", "2+2=4"),
    ("x plus two", r"x\text{minus}2"),
    ("x plus two", r"x\unknown{+2}"),
    ("x one two", r"\frac{x+1}{2}"),
    ("x is two", "xis=2"),
    ("x to the fourth", "xto^4"),
])
def test_model_operator_changes_are_refused_without_repair(spoken, latex):
    original = latex
    assert adds_to_what_was_said(latex, spoken) is True
    assert latex == original


def test_the_route_refuses_a_changed_sign_before_readback_or_validation():
    from unittest.mock import AsyncMock

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from backend.app.routes.spoken import spoken_router

    models = AsyncMock()
    models.interpret.return_value = {
        "latex": "2x+3=11", "ambiguous": False, "alternatives": [],
        "clarifying_question": None, "readback": "two x plus three equals eleven",
    }
    validate = AsyncMock(return_value=True)
    app = FastAPI()
    app.include_router(spoken_router(models, validate))
    with TestClient(app) as client:
        response = client.post("/api/spoken-to-latex", json={
            "text": "two x minus three equals eleven",
        })
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "UNPARSEABLE"
    assert "2x+3" not in response.text and "plus" not in response.text
    validate.assert_not_awaited()
