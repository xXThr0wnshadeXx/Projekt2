import copy
import json

import httpx
import pytest

from eval.run_capture_fidelity import FIXTURES, evaluate, mismatches

CASES = json.loads((FIXTURES / "expected.json").read_text())["cases"]


def test_recorded_production_regressions_fail_the_fidelity_check():
    baseline = json.loads((FIXTURES / "baseline-2026-11-15.json").read_text())
    for case, result in zip(CASES, baseline["results"], strict=True):
        assert case["file"] == result["file"]
        assert mismatches(case, result["actual"]) == result["errors"]
        assert result["errors"]


def response_for(case):
    return {
        "instructions": case["instructions"],
        "lines": [{"id": f"L{i + 1}", "latex": latex}
                  for i, latex in enumerate(case["lines"])],
    }


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["file"])
def test_exact_capture_is_accepted(case):
    assert mismatches(case, response_for(case)) == []


def test_invented_instructions_fail_even_when_equations_are_exact():
    actual = response_for(CASES[0])
    actual["instructions"] = "Transcribe the two given algebraic equations from the image."
    assert mismatches(CASES[0], actual) == ["Instructions differ from the printed source."]


def test_heading_as_first_math_line_fails():
    actual = response_for(CASES[1])
    actual["lines"].insert(0, {"id": "L1", "latex": r"\text{Solve for } x."})
    actual["lines"][1]["id"] = "L2"
    assert "Math lines differ" in mismatches(CASES[1], actual)[0]


@pytest.mark.parametrize("latex", ["x = 4", "2x = 8", "11 = 2x + 3"])
def test_solved_simplified_or_rearranged_equations_are_not_exact(latex):
    actual = response_for(CASES[1])
    actual["lines"][0]["latex"] = latex
    assert mismatches(CASES[1], actual)


def test_only_tex_presentation_changes_are_accepted():
    actual = response_for(CASES[0])
    actual["lines"][1]["latex"] = r"\dfrac{x+1}{2}=5"
    assert mismatches(CASES[0], actual) == []


def test_eval_sends_both_pngs_once_and_reports_fidelity_failures():
    calls = []

    def capture(request):
        case = CASES[len(calls)]
        calls.append(request)
        assert request.url.path == "/api/capture"
        assert (FIXTURES / case["file"]).read_bytes() in request.content
        actual = copy.deepcopy(response_for(case))
        if len(calls) == 1:
            actual["instructions"] = "Invented task"
        return httpx.Response(200, json=actual)

    with httpx.Client(base_url="http://test", transport=httpx.MockTransport(capture)) as client:
        results = evaluate(client)
    assert len(calls) == 2
    assert [result["passed"] for result in results] == [False, True]


def test_request_failure_does_not_retry_or_claim_fidelity():
    calls = []

    def capture(request):
        calls.append(request)
        return httpx.Response(502)

    with httpx.Client(base_url="http://test", transport=httpx.MockTransport(capture)) as client:
        results = evaluate(client)
    assert len(calls) == 2
    assert all(not result["passed"] and result["actual"] is None for result in results)
