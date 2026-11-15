"""Check #176's synthetic images against a running backend, without retries.

Unlike the general OCR eval, this requires the printed instructions and
equations themselves, not algebraically equivalent rewrites. Reports contain
only these checked-in synthetic examples; never use student work here.
"""

import argparse
import json
import re
from datetime import UTC, datetime
from pathlib import Path

import httpx

FIXTURES = Path(__file__).with_name("capture_fidelity")


def presentation(latex):
    """Ignore TeX spacing/delimiter sizing, never simplify the expression."""
    return re.sub(r"\s+", "", latex.replace(r"\left", "").replace(
        r"\right", "").replace(r"\dfrac", r"\frac"))


def mismatches(case, actual):
    errors = []
    if actual.get("instructions") != case["instructions"]:
        errors.append("Instructions differ from the printed source.")
    lines = actual.get("lines", [])
    if not isinstance(lines, list) or any(
        not isinstance(line, dict) or not isinstance(line.get("latex"), str)
        for line in lines
    ):
        return errors + ["Invalid math lines."]
    if [presentation(line["latex"]) for line in lines] != [
        presentation(line) for line in case["lines"]
    ]:
        errors.append("Math lines differ, are missing, or contain extra text.")
    if [line.get("id") for line in lines] != [f"L{i + 1}" for i in range(len(lines))]:
        errors.append("Math lines do not have consecutive browser IDs starting at L1.")
    return errors


def evaluate(client):
    cases = json.loads((FIXTURES / "expected.json").read_text())["cases"]
    results = []
    for case in cases:
        with (FIXTURES / case["file"]).open("rb") as image:
            try:
                response = client.post("/api/capture", files={
                    "image": (case["file"], image, "image/png"),
                })
                response.raise_for_status()
                actual = response.json()
                if not isinstance(actual, dict):
                    raise ValueError("Invalid capture response")
                errors = mismatches(case, actual)
            except (httpx.HTTPError, ValueError):
                actual = None
                errors = ["Capture request failed; fidelity is unverified."]
        results.append({"file": case["file"], "passed": not errors,
                        "errors": errors, "actual": actual})
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base_url", help="Backend running the revision being evaluated")
    parser.add_argument("--revision", required=True, help="Backend commit SHA being tested")
    parser.add_argument("--model", required=True, help="Configured vision model ID")
    args = parser.parse_args()
    with httpx.Client(base_url=args.base_url, timeout=20) as client:
        results = evaluate(client)
    print(json.dumps({"revision": args.revision, "model": args.model,
                      "run_at": datetime.now(UTC).isoformat(), "results": results}, indent=2))
    return int(any(not result["passed"] for result in results))


if __name__ == "__main__":
    raise SystemExit(main())
