"""Measure p50/p90 latency per step against the DESIGN.md 16 budget (issue #33).

    python scripts/latency.py --base http://localhost:8000
    python scripts/latency.py --base https://<deployed-domain> \
        --image eval/photos/worksheet.jpg --audio eval/audio/two_x.webm \
        --frontend https://<front-end-domain> --out eval/latency.md

Steps without their input are skipped: capture needs --image, the spoken line
needs --audio (or --text to time only spoken-to-latex). Capture and spoken
calls use the real model and cost money, so they default to a few runs.

The first request to each step is reported separately as "first" (a cold
start shows up there) and is not counted in p50/p90. Exit code is 1 if any
step's p90 exceeds its hard limit, so this can gate a deploy.

Prints only timings and status codes; never request or response content.
"""

from __future__ import annotations

import argparse
import math
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import httpx

# DESIGN.md 16: (target p50 ms, hard limit ms)
BUDGETS: dict[str, tuple[float, float | None]] = {
    "health": (300, None),
    "step_check": (1500, 3000),
    "capture": (6000, 12000),
    "spoken_line": (3000, 6000),
    "first_load": (2000, None),
}

STEP_PAIRS = [
    ("2x + 3 = 11", "2x = 8"),
    ("2x = 8", "x = 4"),
    ("3(x + 2) = 12", "3x + 6 = 12"),
    ("x^{2} - 5x + 6 = 0", "(x - 2)(x - 3) = 0"),
    ("(x + 1)^{2}", "x^{2} + 2x + 1"),
    ("x^{2} = 4", "x = 2"),
]

AUDIO_TYPES = {".webm": "audio/webm", ".mp4": "audio/mp4", ".m4a": "audio/mp4"}
IMAGE_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
               ".webp": "image/webp", ".pdf": "application/pdf"}


def percentile(values: list[float], p: float) -> float | None:
    """Nearest-rank percentile, same method as /api/stats."""
    if not values:
        return None
    ordered = sorted(values)
    k = max(0, min(len(ordered) - 1, math.ceil(p * len(ordered)) - 1))
    return ordered[k]


@dataclass
class StepResult:
    name: str
    first_ms: float | None = None
    samples_ms: list[float] = field(default_factory=list)
    errors: dict[int, int] = field(default_factory=dict)
    skipped: str | None = None

    @property
    def p50(self) -> float | None:
        return percentile(self.samples_ms, 0.5)

    @property
    def p90(self) -> float | None:
        return percentile(self.samples_ms, 0.9)

    @property
    def verdict(self) -> str:
        if self.skipped:
            return "skipped"
        if not self.samples_ms:
            return "no data"
        target, hard = BUDGETS[self.name]
        if hard is not None and self.p90 > hard:
            return "OVER HARD LIMIT"
        if self.p50 > target:
            return "over target"
        return "ok"


Call = Callable[[], tuple[int, float]]  # returns (status, ms)


def timed(fn: Callable[[], httpx.Response]) -> tuple[int, float]:
    start = time.perf_counter()
    try:
        status = fn().status_code
    except httpx.HTTPError:
        status = 0  # network error / timeout
    return status, (time.perf_counter() - start) * 1000


def run_step(name: str, call: Call, runs: int, pause: float = 0.0) -> StepResult:
    result = StepResult(name)
    for i in range(runs + 1):  # +1: the first request is reported separately
        status, ms = call()
        if not 200 <= status < 300:
            result.errors[status] = result.errors.get(status, 0) + 1
        elif i == 0:
            result.first_ms = ms
        else:
            result.samples_ms.append(ms)
        if pause:
            time.sleep(pause)
    return result


# --- the steps ---------------------------------------------------------------------

def health_call(client: httpx.Client) -> Call:
    return lambda: timed(lambda: client.get("/api/health"))


def step_check_call(client: httpx.Client) -> Call:
    counter = iter(range(10**9))

    def call() -> tuple[int, float]:
        a, b = STEP_PAIRS[next(counter) % len(STEP_PAIRS)]
        return timed(lambda: client.post(
            "/api/diff", json={"from_latex": a, "to_latex": b, "mode": "homework"}))
    return call


def capture_call(client: httpx.Client, image: Path) -> Call:
    data = image.read_bytes()
    kind = IMAGE_TYPES.get(image.suffix.lower(), "application/octet-stream")
    return lambda: timed(lambda: client.post(
        "/api/capture", files={"image": (image.name, data, kind)}))


def spoken_line_call(client: httpx.Client, audio: Path | None, text: str | None) -> Call:
    """Release → readback: transcribe (if audio) then spoken-to-latex, end to end."""
    data = audio.read_bytes() if audio else b""
    kind = AUDIO_TYPES.get(audio.suffix.lower(), "audio/webm") if audio else ""

    def call() -> tuple[int, float]:
        start = time.perf_counter()
        spoken = text or ""
        try:
            if audio:
                r = client.post("/api/transcribe", files={"audio": (audio.name, data, kind)})
                if r.status_code != 200:
                    return r.status_code, (time.perf_counter() - start) * 1000
                spoken = r.json().get("text", "")
            r = client.post("/api/spoken-to-latex",
                            json={"text": spoken, "context_lines": ["2x + 3 = 11"]})
            status = r.status_code
        except (httpx.HTTPError, ValueError):
            status = 0
        return status, (time.perf_counter() - start) * 1000
    return call


def first_load_call(frontend: str) -> Call:
    def call() -> tuple[int, float]:
        with httpx.Client(timeout=30, follow_redirects=True) as c:
            return timed(lambda: c.get(frontend, headers={"Cache-Control": "no-cache"}))
    return call


# --- report --------------------------------------------------------------------------

def fmt(ms: float | None) -> str:
    return "—" if ms is None else f"{ms:,.0f}"


def report(results: list[StepResult], base: str) -> str:
    lines = [
        f"Latency against `{base}` (ms; first request excluded from p50/p90)",
        "",
        "| Step | Runs | p50 | p90 | Max | First | Target p50 | Hard limit | Errors | Verdict |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in results:
        target, hard = BUDGETS[r.name]
        if r.skipped:
            lines.append(f"| {r.name} | — | — | — | — | — | {fmt(target)} | {fmt(hard)} | — | skipped: {r.skipped} |")
            continue
        errors = ", ".join(f"{k or 'network'}×{v}" for k, v in sorted(r.errors.items())) or "0"
        lines.append(
            f"| {r.name} | {len(r.samples_ms)} | {fmt(r.p50)} | {fmt(r.p90)} | "
            f"{fmt(max(r.samples_ms) if r.samples_ms else None)} | {fmt(r.first_ms)} | "
            f"{fmt(target)} | {fmt(hard)} | {errors} | {r.verdict} |"
        )
    if any(429 in r.errors for r in results):
        lines += ["", "429s mean the rate limit kicked in: lower --runs or raise --pause."]
    return "\n".join(lines)


def measure(client: httpx.Client, args: argparse.Namespace) -> list[StepResult]:
    results = [
        run_step("health", health_call(client), args.runs),
        run_step("step_check", step_check_call(client), args.runs),
    ]
    if args.image:
        results.append(run_step("capture", capture_call(client, args.image),
                                args.model_runs, args.pause))
    else:
        results.append(StepResult("capture", skipped="no --image"))
    if args.audio or args.text:
        results.append(run_step("spoken_line", spoken_line_call(client, args.audio, args.text),
                                args.model_runs, args.pause))
    else:
        results.append(StepResult("spoken_line", skipped="no --audio/--text"))
    if args.frontend:
        results.append(run_step("first_load", first_load_call(args.frontend), args.model_runs))
    else:
        results.append(StepResult("first_load", skipped="no --frontend"))
    return results


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--base", default="http://localhost:8000", help="back-end base URL")
    p.add_argument("--runs", type=int, default=30, help="runs for cheap steps (default 30)")
    p.add_argument("--model-runs", type=int, default=5, help="runs for model-backed steps (default 5)")
    p.add_argument("--pause", type=float, default=0.5, help="seconds between model-backed runs")
    p.add_argument("--image", type=Path, help="worksheet image or PDF for capture")
    p.add_argument("--audio", type=Path, help="short .webm/.mp4 recording for the spoken line")
    p.add_argument("--text", help="spoken text, to time spoken-to-latex without audio")
    p.add_argument("--frontend", help="front-end URL for first load")
    p.add_argument("--out", type=Path, help="also write the table to this markdown file")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    with httpx.Client(base_url=args.base.rstrip("/"), timeout=30) as client:
        results = measure(client, args)
    table = report(results, args.base)
    print(table)
    if args.out:
        args.out.write_text(table + "\n", encoding="utf-8")
    return 1 if any(r.verdict == "OVER HARD LIMIT" for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())
