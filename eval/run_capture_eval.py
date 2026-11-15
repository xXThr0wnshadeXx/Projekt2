"""Capture eval runner — issue #29.

Reports exact and SymPy-equivalent line match and request latency by category.
Run from the repository root with python -m eval.run_capture_eval.
"""

import argparse
import json
import time
from collections import Counter, defaultdict
from datetime import UTC, datetime
from itertools import zip_longest
from pathlib import Path
from statistics import median, quantiles

import httpx
from sympy import Eq, Expr, simplify
from sympy.core.relational import Relational

from backend.app.mathcheck import Unparseable, parse
from backend.app.timeouts import CasTimeout, run_cas_sync, shutdown, warm_up

EVAL_DIR = Path(__file__).resolve().parent
IMAGE_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
               ".webp": "image/webp"}
SUITES = {
    "pilot": {"slides": 3, "whiteboard": 3, "textbook": 2, "handwritten": 2},
    "full": {"slides": 10, "whiteboard": 10, "textbook": 5, "handwritten": 5},
}


def equivalent(expected, actual):
    try:
        left, right = parse(expected), parse(actual)
    except Unparseable:
        return False
    if isinstance(left, Eq) and isinstance(right, Eq):
        l_delta, r_delta = left.lhs - left.rhs, right.lhs - right.rhs
        return simplify(l_delta - r_delta) == 0 or simplify(l_delta + r_delta) == 0
    if isinstance(left, Relational) or isinstance(right, Relational):
        return left == right
    if not isinstance(left, Expr) or not isinstance(right, Expr):
        return False
    return simplify(left - right) == 0


def score_lines(expected, actual):
    exact = matched = 0
    for left, right in zip_longest(expected, actual):
        if left is None or right is None:
            continue
        if left.strip() == right.strip():
            exact += 1
            matched += 1
            continue
        try:
            matched += int(run_cas_sync(equivalent, left, right))
        except CasTimeout:
            continue
    return exact, matched, max(len(expected), len(actual))


def load_images(manifest, photos_dir):
    entries = json.loads(manifest.read_text(encoding="utf-8"))["images"]
    if not entries:
        raise ValueError("The manifest has no labeled images.")
    cases = []
    seen = set()
    photos_dir = photos_dir.resolve()
    for entry in entries:
        path = (photos_dir / entry["file"]).resolve()
        if not path.is_relative_to(photos_dir) or not path.is_file():
            raise ValueError(f"Image is missing or outside the photos directory: {entry['file']}")
        if path in seen or path.suffix.lower() not in IMAGE_TYPES:
            raise ValueError(f"Image is duplicated or has an unsupported format: {entry['file']}")
        category = entry["category"]
        lines = entry["lines"]
        if not isinstance(category, str) or not category.strip() or not isinstance(lines, list):
            raise ValueError(f"Invalid category or lines: {entry['file']}")
        if any(not isinstance(line, str) or not line.strip() for line in lines):
            raise ValueError(f"Each expected line must contain LaTeX: {entry['file']}")
        seen.add(path)
        cases.append((path, category, lines))
    return cases


def check_suite(cases, suite):
    if suite == "custom":
        return
    counts = Counter(category for _, category, _ in cases)
    expected = SUITES[suite]
    if counts != expected:
        raise ValueError(f"{suite} suite needs {expected}; manifest contains {dict(counts)}.")


def evaluate(client, cases):
    groups = defaultdict(list)
    for index, (path, category, expected) in enumerate(cases, start=1):
        with path.open("rb") as image:
            start = time.perf_counter()
            try:
                response = client.post("/api/capture", files={
                    "image": ("page" + path.suffix, image, IMAGE_TYPES[path.suffix.lower()])
                })
                response.raise_for_status()
                actual = [line["latex"] for line in response.json()["lines"]]
                if any(not isinstance(line, str) for line in actual):
                    raise ValueError("Invalid response lines")
                error = None
            except (httpx.HTTPError, ValueError, KeyError, TypeError):
                actual = []
                error = "Capture failed"
            elapsed_ms = round((time.perf_counter() - start) * 1000)
        exact, matched, total = score_lines(expected, actual)
        groups[category].append({
            "case": index, "ms": elapsed_ms, "exact": exact,
            "equivalent": matched, "line_slots": total, "error": error,
        })

    results = {}
    for category, rows in groups.items():
        total = sum(row["line_slots"] for row in rows)
        times = [row["ms"] for row in rows if row["error"] is None]
        results[category] = {
            "images": len(rows),
            "failures": sum(row["error"] is not None for row in rows),
            "exact_rate": sum(row["exact"] for row in rows) / total if total else None,
            "equivalent_rate": sum(row["equivalent"] for row in rows) / total if total else None,
            "p50_ms": median(times) if times else None,
            "p90_ms": quantiles(times, n=10, method="inclusive")[-1] if len(times) > 1
            else next(iter(times), None),
            "cases": rows,
        }
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base_url", help="Backend origin, e.g. http://localhost:8000")
    parser.add_argument("--model", required=True, help="Deployed vision model ID for the report")
    parser.add_argument("--manifest", type=Path, default=EVAL_DIR / "photos_expected.json")
    parser.add_argument("--photos", type=Path, default=EVAL_DIR / "photos")
    parser.add_argument("--suite", choices=("pilot", "full", "custom"), default="custom")
    args = parser.parse_args()
    try:
        cases = load_images(args.manifest, args.photos)
        check_suite(cases, args.suite)
    except (OSError, ValueError, TypeError, KeyError) as error:
        parser.error(str(error))

    try:
        warm_up()
        with httpx.Client(base_url=args.base_url, timeout=20) as client:
            results = evaluate(client, cases)
    finally:
        shutdown()
    print(json.dumps({
        "model": args.model,
        "suite": args.suite,
        "run_at": datetime.now(UTC).isoformat(),
        "results": results,
    }, indent=2))
    return int(any(result["failures"] for result in results.values()))


if __name__ == "__main__":
    raise SystemExit(main())
