"""Per-request logging and live stats (issues #53, #44, #33).

One JSON line per request on stdout (the hosting dashboard's live log tail):

    {"evt": "request", "path": "/api/diff", "method": "POST", "status": 200,
     "ms": 23.1, "error": null, "model": null, "tokens_in": 0, "tokens_out": 0,
     "cost_usd": null}

Never logged: request bodies, query strings, images, audio, LaTeX, transcripts,
explanations, client IPs or headers. Only the route path, timings, status, the
error code, and model usage counts.

The last records are also kept in memory and summarised at `GET /api/stats`
(enabled only when STATS_TOKEN is set; send it as `X-Stats-Token`).
"""

import json
import logging
import math
import time
from collections import deque
from contextvars import ContextVar
from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

log = logging.getLogger("glance.requests")

_current: ContextVar[dict[str, Any] | None] = ContextVar("glance_request", default=None)
_RECENT: deque[dict[str, Any]] = deque(maxlen=2000)

# Paths whose names are fixed by the app. Anything else is logged as "other" so
# that probes for random URLs can't fill the log with attacker-chosen strings.
KNOWN_PATHS = {
    "/api/health", "/api/capture", "/api/transcribe", "/api/spoken-to-latex",
    "/api/command", "/api/diff", "/api/summary", "/api/stats",
}


def current() -> dict[str, Any] | None:
    """The mutable record for the request being handled, if any."""
    return _current.get()


def note_error(code: str) -> None:
    rec = current()
    if rec is not None:
        rec["error"] = code


class RequestLogMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        rec: dict[str, Any] = {
            "evt": "request",
            "path": path if path in KNOWN_PATHS else "other",
            "method": scope.get("method", ""),
            "status": 500,
            "ms": 0.0,
            "error": None,
            "model": None,
            "tokens_in": 0,
            "tokens_out": 0,
            "cost_usd": None,
        }
        token = _current.set(rec)
        start = time.perf_counter()

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                rec["status"] = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            rec["status"] = 500
            rec["error"] = rec["error"] or "INTERNAL"
            raise
        finally:
            rec["ms"] = round((time.perf_counter() - start) * 1000, 1)
            _current.reset(token)
            if rec["method"] != "OPTIONS":
                _RECENT.append(rec)
                log.info(json.dumps(rec, separators=(",", ":")))


# --- summaries ------------------------------------------------------------------

def _percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    k = max(0, min(len(ordered) - 1, math.ceil(p * len(ordered)) - 1))
    return ordered[k]


def summary(last: int = 50) -> dict[str, Any]:
    by_path: dict[str, list[dict[str, Any]]] = {}
    for rec in _RECENT:
        by_path.setdefault(rec["path"], []).append(rec)

    paths = {}
    for path, recs in sorted(by_path.items()):
        ok = [r["ms"] for r in recs if r["status"] < 400]
        costs = [r["cost_usd"] for r in recs if r["cost_usd"] is not None]
        paths[path] = {
            "count": len(recs),
            "errors": sum(1 for r in recs if r["status"] >= 400),
            "p50_ms": _percentile(ok, 0.5),
            "p90_ms": _percentile(ok, 0.9),
            "tokens_in": sum(r["tokens_in"] for r in recs),
            "tokens_out": sum(r["tokens_out"] for r in recs),
            "cost_usd_total": round(sum(costs), 6) if costs else None,
            "cost_usd_per_request": round(sum(costs) / len(costs), 6) if costs else None,
        }
    return {"window": len(_RECENT), "paths": paths, "recent": list(_RECENT)[-last:]}


def reset() -> None:
    _RECENT.clear()
