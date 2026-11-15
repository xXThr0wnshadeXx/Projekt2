import httpx
import pytest

from eval.run_capture_eval import SUITES, check_suite, equivalent, evaluate


@pytest.mark.parametrize("suite", ["pilot", "full"])
def test_capture_suite_enforces_category_counts(suite):
    cases = [
        (None, category, ["x"])
        for category, count in SUITES[suite].items()
        for _ in range(count)
    ]
    check_suite(cases, suite)
    with pytest.raises(ValueError, match="manifest contains"):
        check_suite(cases[:-1], suite)


def test_sympy_equivalence_preserves_relation_type():
    assert equivalent("x+x", "2x")
    assert equivalent("x=2", "2=x")
    assert not equivalent("x=2", "x-2")
    assert not equivalent("2+2=5", "2+2=4")


def test_capture_report_counts_missing_and_extra_lines(tmp_path):
    photo = tmp_path / "example.png"
    photo.write_bytes(b"test image")

    def capture(request):
        assert request.url.path == "/api/capture"
        assert b'name="image"' in request.content
        return httpx.Response(200, json={"lines": [{"latex": "x"}, {"latex": "y"}]})

    with httpx.Client(
        base_url="http://localhost", transport=httpx.MockTransport(capture)
    ) as client:
        report = evaluate(client, [(photo, "slides", ["x"])])

    assert report["slides"]["exact_rate"] == 0.5
    assert report["slides"]["equivalent_rate"] == 0.5
    assert report["slides"]["failures"] == 0
