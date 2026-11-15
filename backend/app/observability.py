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
    return {
        "window": len(_RECENT),
        "paths": paths,
        "unit_economics": unit_economics(paths),
        "recent": list(_RECENT)[-last:],
    }


def reset() -> None:
    _RECENT.clear()


# --- model usage and cost (issue #44) -------------------------------------------

def _prices() -> dict[str, dict[str, float]]:
    """MODEL_PRICES from the environment, e.g.
    {"model-a": {"input_per_1m": 1.0, "output_per_1m": 4.0},
     "model-stt": {"per_minute": 0.006}}
    Prices are configuration, not code: they change and must match the account.
    """
    from .config import get_settings

    raw = get_settings().model_prices
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except ValueError:
        log.warning('{"evt":"config","error":"MODEL_PRICES is not valid JSON"}')
        return {}
    return data if isinstance(data, dict) else {}


def cost_usd(model: str, tokens_in: int, tokens_out: int, audio_seconds: float = 0.0) -> float | None:
    price = _prices().get(model)
    if not isinstance(price, dict):
        return None
    total = (
        tokens_in * float(price.get("input_per_1m", 0)) / 1_000_000
        + tokens_out * float(price.get("output_per_1m", 0)) / 1_000_000
        + audio_seconds * float(price.get("per_minute", 0)) / 60
    )
    return round(total, 8)


def record_model_call(
    model: str, tokens_in: int = 0, tokens_out: int = 0, audio_seconds: float = 0.0
) -> None:
    """Add one model call's usage to the current request's log record."""
    rec = current()
    if rec is None:
        return
    rec["model"] = model if rec["model"] in (None, model) else f'{rec["model"]}+{model}'
    rec["tokens_in"] += int(tokens_in or 0)
    rec["tokens_out"] += int(tokens_out or 0)
    cost = cost_usd(model, tokens_in or 0, tokens_out or 0, audio_seconds or 0.0)
    if cost is not None:
        rec["cost_usd"] = round((rec["cost_usd"] or 0.0) + cost, 8)


def _field(obj: Any, name: str) -> Any:
    if obj is None:
        return None
    return obj.get(name) if isinstance(obj, dict) else getattr(obj, name, None)


def _record_completion(model: str, result: Any) -> None:
    usage = _field(result, "usage")
    record_model_call(
        _field(result, "model") or model,
        _field(usage, "prompt_tokens") or 0,
        _field(usage, "completion_tokens") or 0,
    )


def _record_transcription(model: str, result: Any) -> None:
    usage = _field(result, "usage") or (getattr(result, "model_extra", None) or {}).get("usage")
    record_model_call(
        model,
        _field(usage, "input_tokens") or 0,
        _field(usage, "output_tokens") or 0,
        _field(usage, "seconds") or 0.0,
    )


def instrument_openai(client: Any) -> Any:
    """Record usage for every chat and transcription call made through `client`.

    Works on an AsyncOpenAI instance without changing the code that calls it:
        instrument_openai(models.client)
    """
    if getattr(client, "_glance_instrumented", False) is True:  # `is`: mocks answer any attribute
        return client

    chat_create = client.chat.completions.create

    async def chat(*args: Any, **kwargs: Any) -> Any:
        result = await chat_create(*args, **kwargs)
        _record_completion(kwargs.get("model", ""), result)
        return result

    stt_create = client.audio.transcriptions.create

    async def transcribe(*args: Any, **kwargs: Any) -> Any:
        result = await stt_create(*args, **kwargs)
        _record_transcription(kwargs.get("model", ""), result)
        return result

    client.chat.completions.create = chat
    client.audio.transcriptions.create = transcribe
    client._glance_instrumented = True
    return client


def unit_economics(paths: dict[str, dict[str, Any]]) -> dict[str, float | None]:
    """Cost per page converted and per spoken line, from the live window."""
    def per(path: str) -> float | None:
        return (paths.get(path) or {}).get("cost_usd_per_request")

    spoken = [c for c in (per("/api/transcribe"), per("/api/spoken-to-latex")) if c is not None]
    return {
        "cost_per_page_usd": per("/api/capture"),
        "cost_per_spoken_line_usd": round(sum(spoken), 8) if spoken else None,
        "cost_per_step_explanation_usd": per("/api/diff"),
    }
