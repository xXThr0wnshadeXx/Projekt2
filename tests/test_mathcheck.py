"""Unit tests for mathcheck (DESIGN.md 11, 22). Issues #8, #20, #28."""

import asyncio
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app import mathcheck, timeouts
from backend.app.errors import install_error_handlers
from backend.app.mathcheck import Unparseable, is_parseable, normalise, parse


@pytest.fixture(scope="module", autouse=True)
def _pool():
    yield
    timeouts.shutdown()


# --- parse -------------------------------------------------------------------

@pytest.mark.parametrize(
    "latex",
    [
        "2x + 3 = 11",
        "x = 4",
        r"\frac{x+1}{2}",
        r"\dfrac{1}{2}x + 3",
        r"\left(x+1\right)^{2} = 9",
        r"\sqrt{x} + 1",
        r"3 \cdot 4 - 2",
        r"x^{2} - 4x + 4 = 0",
        r"2x\,+\,1 = 5",
        r"\displaystyle x + 1",
        "x < 3",
        "2x + 3 = 11.",
    ],
)
def test_parse_accepts_ordinary_lines(latex):
    assert parse(latex) is not None
    assert is_parseable(latex)


@pytest.mark.parametrize("latex", ["", "   ", "x +", r"\frac{}{}", "x = y = z", "= 3", "2x + 3 = "])
def test_parse_rejects_unreadable_lines(latex):
    with pytest.raises(Unparseable):
        parse(latex)
    assert not is_parseable(latex)


def test_normalise_drops_display_only_markup():
    assert normalise(r"\left( x \right)") == "( x )"
    assert normalise(r"\tfrac{1}{2}") == r"\frac{1}{2}"


# --- validate_latex: unparseable is valid:false, never a crash ----------------

def test_validate_latex_marks_valid_and_unsure():
    async def go():
        return await asyncio.gather(
            mathcheck.validate_latex("2x + 3 = 11"),
            mathcheck.validate_latex("x +"),
            mathcheck.validate_latex(r"\frac{}{}"),
        )

    assert asyncio.run(go()) == [True, False, False]


def test_validate_latex_timeout_is_unsure_not_an_error(monkeypatch):
    async def slow(*_args, **_kwargs):
        raise timeouts.CasTimeout()

    monkeypatch.setattr(mathcheck, "run_cas", slow)
    assert asyncio.run(mathcheck.validate_latex("x = 1")) is False


# --- timeouts ----------------------------------------------------------------

def test_run_cas_times_out_and_pool_recovers():
    async def go():
        start = time.monotonic()
        with pytest.raises(timeouts.CasTimeout):
            await timeouts.run_cas(time.sleep, 10, timeout=0.5)
        elapsed = time.monotonic() - start
        # A fresh pool must still answer after the stuck worker was killed.
        ok = await timeouts.run_cas(is_parseable, "x = 1", timeout=20)
        return elapsed, ok

    elapsed, ok = asyncio.run(go())
    assert elapsed < 3
    assert ok is True


def test_timeout_path_returns_timeout_error_shape():
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/slow")
    async def slow():
        await timeouts.run_cas(time.sleep, 10, timeout=0.3)

    with TestClient(app) as client:
        response = client.get("/slow")
    assert response.status_code == 504
    assert response.json()["error"]["code"] == "TIMEOUT"
    assert "wrong" not in response.text.lower()


def test_require_parse_raises_unparseable_error_shape():
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/check")
    async def check(latex: str):
        await mathcheck.require_parse(latex)
        return {"ok": True}

    with TestClient(app) as client:
        assert client.get("/check", params={"latex": "x = 2"}).json() == {"ok": True}
        bad = client.get("/check", params={"latex": "x +"})
    assert bad.status_code == 422
    assert bad.json()["error"]["code"] == "UNPARSEABLE"


# --- steps_equivalent (DESIGN.md 22) -----------------------------------------

from backend.app.mathcheck import steps_equivalent  # noqa: E402


@pytest.mark.parametrize(
    "a, b, method",
    [
        # subtract / add on both sides
        ("2x + 3 = 11", "2x = 8", "ratio_constant"),
        ("x - 5 = 2", "x = 7", "ratio_constant"),
        # divide / multiply both sides
        ("2x = 8", "x = 4", "ratio_constant"),
        (r"\frac{x}{3} = 2", "x = 6", "ratio_constant"),
        # two operations in one line is still the student's own valid work
        ("2x + 3 = 11", "x = 4", "ratio_constant"),
        # distribute
        ("3(x + 2) = 12", "3x + 6 = 12", "ratio_constant"),
        # combine like terms
        ("2x + 3x - 4 = 6", "5x - 4 = 6", "ratio_constant"),
        # move a term across
        ("4x = 2x + 6", "2x = 6", "ratio_constant"),
        # swap sides
        ("11 = 2x + 3", "2x + 3 = 11", "ratio_constant"),
        # factor (equation): same roots, ratio is constant
        ("x^{2} - 5x + 6 = 0", "(x - 2)(x - 3) = 0", "ratio_constant"),
        # square root of both sides keeping both roots
        ("x^{2} = 9", "(x - 3)(x + 3) = 0", "ratio_constant"),
        # same solution set, not a constant multiple
        (r"\sqrt{x} = 2", "x = 4", "same_solutions"),
        # expressions
        ("(x + 1)^{2}", "x^{2} + 2x + 1", "expr_equal"),
        ("2(a + b)", "2a + 2b", "expr_equal"),
        (r"\frac{6x}{3}", "2x", "expr_equal"),
        (r"\left(x + 1\right)^{2}", "x^{2} + 2x + 1", "expr_equal"),
    ],
)
def test_valid_steps_are_verified(a, b, method):
    assert steps_equivalent(a, b) == (True, method)


@pytest.mark.parametrize(
    "a, b, method",
    [
        # arithmetic slip
        ("2x + 3 = 11", "2x = 9", "not_verified"),
        # sign slip when distributing
        ("-(x - 2) = 5", "-x - 2 = 5", "not_verified"),
        # lost a root
        ("x^{2} = 4", "x = 2", "not_verified"),
        # expressions that differ
        ("(x + 1)^{2}", "x^{2} + 1", "not_verified"),
        # equation vs expression
        ("2x = 8", "x", "mixed"),
        ("2x + 1", "2x + 1 = 0", "mixed"),
        # inequalities are a documented limitation
        ("2x < 8", "x < 4", "inequality"),
        # multi-variable equations are a documented limitation
        ("x + y = 3", "2x + 2y + 1 = 7", "ratio_constant"),
        ("x + y = 3", "2x + 2y = 7", "not_verified"),
        # degenerate
        ("2x = 8", "0 = 0", "degenerate"),
        ("2x = 8", "1 = 2", "degenerate"),
        # unparseable either side
        ("2x + 3 = 11", "x +", "unparseable"),
        (r"\frac{}{}", "x = 1", "unparseable"),
    ],
)
def test_other_steps_are_not_verified(a, b, method):
    verified, got = steps_equivalent(a, b)
    assert got == method
    assert verified is (method == "ratio_constant")


def test_check_step_runs_under_the_timeout():
    assert asyncio.run(mathcheck.check_step("2x = 8", "x = 4")) == (True, "ratio_constant")


def test_check_step_timeout_raises_timeout(monkeypatch):
    monkeypatch.setattr(timeouts, "_budget", lambda _t: 0.0001)
    with pytest.raises(timeouts.CasTimeout):
        asyncio.run(mathcheck.check_step("2x = 8", "x = 4"))
