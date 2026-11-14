"""Spoken eval runner — issue #30.

Reports correct-LaTeX rate on unambiguous phrases and asked-instead-of-guessed
rate on ambiguous ones (DESIGN.md 22).
"""

import argparse
import json
import re
import time
from pathlib import Path
from statistics import median
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def normalize(latex):
    latex = re.sub(r"\\(?:left|right)\b|\s+", "", latex)
    return re.sub(r"([_^])\{([a-z0-9])\}", r"\1\2", latex)


def readback_present(value):
    return isinstance(value, str) and bool(value.strip())


def matches(group, fixture, result):
    if group == "unambiguous":
        latex = result.get("latex")
        return (
            result.get("ambiguous") is False
            and result.get("valid") is True
            and readback_present(result.get("readback"))
            and isinstance(latex, str)
            and normalize(latex) == normalize(fixture["latex"])
        )
    options = result.get("alternatives")
    return (
        result.get("ambiguous") is True
        and result.get("latex") is None
        and readback_present(result.get("clarifying_question"))
        and isinstance(options, list)
        and 2 <= len(options) <= 3
        and all(
            isinstance(option, dict)
            and readback_present(option.get("latex"))
            and readback_present(option.get("readback"))
            for option in options
        )
        and len({normalize(option["latex"]) for option in options}) == len(options)
    )


def evaluate(base_url, fixtures):
    results = {}
    for group in ("unambiguous", "ambiguous"):
        cases = []
        for fixture in fixtures[group]:
            request = Request(
                f"{base_url.rstrip('/')}/api/spoken-to-latex",
                data=json.dumps({"text": fixture["text"], "context_lines": []}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            start = time.perf_counter()
            case = {"text": fixture["text"], "passed": False}
            try:
                with urlopen(request, timeout=20) as response:
                    result = json.load(response)
                case["passed"] = isinstance(result, dict) and matches(group, fixture, result)
                if not case["passed"]:
                    case["error"] = "response did not match the expected contract"
            except HTTPError as error:
                case["error"] = f"HTTP {error.code}"
            except (URLError, TimeoutError, ValueError):
                case["error"] = "could not read a response from the API"
            case["ms"] = round((time.perf_counter() - start) * 1000)
            cases.append(case)
        passed = sum(case["passed"] for case in cases)
        results[group] = {
            "passed": passed,
            "total": len(cases),
            "rate": passed / len(cases),
            "p50_ms": median(case["ms"] for case in cases),
            "cases": cases,
        }
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base_url", help="Backend origin, e.g. http://localhost:8000")
    parser.add_argument("--model", required=True, help="Deployed text model ID for the report")
    args = parser.parse_args()
    fixtures = json.loads(Path(__file__).with_name("spoken.json").read_text(encoding="utf-8"))
    results = evaluate(args.base_url, fixtures)
    print(json.dumps({"model": args.model, "results": results}, indent=2))
    return int(any(result["passed"] != result["total"] for result in results.values()))


if __name__ == "__main__":
    raise SystemExit(main())
