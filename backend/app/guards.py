"""Request guards for public endpoints with a paid API key behind them (issue #54).

- BodyLimitMiddleware: per-path body size caps, enforced on the stream itself
  (Content-Length can be absent or lie).
- RateLimitMiddleware: per-IP sliding window; model-backed endpoints get a
  tighter budget than cheap ones. Friendly §9 RATE_LIMITED with Retry-After.
- check_image / check_audio: allowlist by file signature, not the declared
  type, plus a 30 s duration check for audio when the container records it.

All state is in memory and holds only IP addresses and timestamps, briefly.
"""

import math
import struct
import time
from collections import deque
from dataclasses import dataclass

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .errors import ApiError, error_body
from .observability import note_error

KB = 1024
JSON_BODY_LIMIT = 64 * KB
FORM_OVERHEAD = 64 * KB
AUDIO_BYTES_PER_SECOND = 40 * KB  # generous for 320 kbps; real speech is far lower

MODEL_PATHS = frozenset({
    "/api/capture",
    "/api/transcribe",
    "/api/spoken-to-latex",
    "/api/command",
    "/api/summary",
    "/api/diff",
    "/api/pdf/pages",
    "/api/pdf/page",
})
# Camera framing checks arrive every second or so while a student aims the phone
# (issue #242), so they get a budget of their own rather than spending the
# tight one that a capture or a spoken line needs.
FRAME_PATH = "/api/frame"
FRAME_MAX_BYTES = 256 * KB
UNLIMITED_PATHS = frozenset({"/api/health"})


async def _send_error(send: Send, status: int, code: str, message: str,
                      headers: list[tuple[bytes, bytes]] | None = None) -> None:
    import json

    note_error(code)
    body = json.dumps(error_body(code, message)).encode()
    await send({
        "type": "http.response.start",
        "status": status,
        "headers": [(b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode())] + (headers or []),
    })
    await send({"type": "http.response.body", "body": body})


# --- body size ------------------------------------------------------------------

class _TooLarge(Exception):
    pass


class BodyLimitMiddleware:
    def __init__(self, app: ASGIApp, max_image_bytes: int, max_audio_seconds: int) -> None:
        self.app = app
        self.limits = {
            "/api/capture": max_image_bytes + FORM_OVERHEAD,
            "/api/pdf/pages": max_image_bytes + FORM_OVERHEAD,
            "/api/pdf/page": max_image_bytes + FORM_OVERHEAD,
            FRAME_PATH: FRAME_MAX_BYTES,
            "/api/transcribe": max_audio_seconds * AUDIO_BYTES_PER_SECOND + FORM_OVERHEAD,
        }

    def limit_for(self, path: str) -> int:
        return self.limits.get(path, JSON_BODY_LIMIT)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") in ("GET", "HEAD", "OPTIONS"):
            await self.app(scope, receive, send)
            return

        limit = self.limit_for(scope.get("path", ""))
        declared = dict(scope.get("headers") or []).get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > limit:
            await _send_error(send, 413, "BAD_INPUT", "That file is too large.")
            return

        received = 0
        started = False

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise _TooLarge()
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, tracking_send)
        except _TooLarge:
            if not started:
                await _send_error(send, 413, "BAD_INPUT", "That file is too large.")


# --- rate limit -----------------------------------------------------------------

@dataclass(frozen=True)
class Budget:
    requests: int
    per_seconds: float


class RateLimitMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        model_budget: Budget = Budget(20, 60),
        general_budget: Budget = Budget(120, 60),
        frame_budget: Budget = Budget(60, 60),
        trusted_proxy_hops: int = 0,
        clock=time.monotonic,
    ) -> None:
        self.app = app
        self.model_budget = model_budget
        self.general_budget = general_budget
        self.frame_budget = frame_budget
        self.hops = trusted_proxy_hops
        self.clock = clock
        self.hits: dict[tuple[str, str], deque[float]] = {}
        self._last_sweep = clock()

    def client_ip(self, scope: Scope) -> str:
        if self.hops > 0:
            raw = dict(scope.get("headers") or []).get(b"x-forwarded-for", b"").decode("latin-1")
            chain = [p.strip() for p in raw.split(",") if p.strip()]
            # Each trusted proxy appends the address it saw; take the one our
            # outermost proxy recorded, which a client cannot forge.
            if len(chain) >= self.hops:
                return chain[-self.hops]
        client = scope.get("client")
        return client[0] if client else "unknown"

    def _sweep(self, now: float) -> None:
        if now - self._last_sweep < 60:
            return
        self._last_sweep = now
        horizon = max(
            self.model_budget.per_seconds,
            self.general_budget.per_seconds,
            self.frame_budget.per_seconds,
        )
        for key in [k for k, q in self.hits.items() if not q or now - q[-1] > horizon]:
            del self.hits[key]

    def check(self, ip: str, path: str) -> float:
        """Record a hit; return 0 if allowed, else seconds until the next slot."""
        if path == FRAME_PATH:
            bucket, budget = "frame", self.frame_budget
        elif path in MODEL_PATHS:
            bucket, budget = "model", self.model_budget
        else:
            bucket, budget = "all", self.general_budget
        now = self.clock()
        self._sweep(now)
        q = self.hits.setdefault((ip, bucket), deque())
        while q and now - q[0] >= budget.per_seconds:
            q.popleft()
        if len(q) >= budget.requests:
            return budget.per_seconds - (now - q[0])
        q.append(now)
        return 0.0

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        if scope["type"] != "http" or scope.get("method") == "OPTIONS" or path in UNLIMITED_PATHS:
            await self.app(scope, receive, send)
            return
        wait = self.check(self.client_ip(scope), path)
        if wait > 0:
            seconds = max(1, math.ceil(wait))
            await _send_error(
                send, 429, "RATE_LIMITED",
                f"Too many requests. Wait {seconds} seconds and try again.",
                [(b"retry-after", str(seconds).encode())],
            )
            return
        await self.app(scope, receive, send)


# --- file type allowlist ----------------------------------------------------------

IMAGE_TYPES = ("image/jpeg", "image/png", "image/webp", "application/pdf")
AUDIO_TYPES = ("audio/webm", "audio/mp4")


def sniff(data: bytes) -> str | None:
    """MIME type from the file signature, or None if not on the allowlist."""
    head = data[:16]
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    if head.startswith(b"%PDF-"):
        return "application/pdf"
    if head.startswith(b"\x1a\x45\xdf\xa3"):
        return "audio/webm"
    if head[4:8] == b"ftyp":
        return "audio/mp4"
    return None


def check_image(data: bytes, max_bytes: int) -> str:
    """Return the sniffed type of an allowed image/PDF, or raise BAD_INPUT."""
    if not data:
        raise ApiError("BAD_INPUT", "The file is empty.")
    if len(data) > max_bytes:
        raise ApiError("BAD_INPUT", "That file is too large. The limit is 8 megabytes.", 413)
    kind = sniff(data)
    if kind not in IMAGE_TYPES:
        raise ApiError("BAD_INPUT", "Upload a JPEG, PNG, WebP image or a PDF.", 415)
    return kind


def check_audio(data: bytes, max_seconds: int) -> str:
    """Return the sniffed type of allowed audio, or raise BAD_INPUT."""
    if not data:
        raise ApiError("BAD_INPUT", "The recording is empty.")
    if len(data) > max_seconds * AUDIO_BYTES_PER_SECOND:
        raise ApiError("BAD_INPUT", f"Recordings can be up to {max_seconds} seconds.", 413)
    kind = sniff(data)
    if kind not in AUDIO_TYPES:
        raise ApiError("BAD_INPUT", "That recording format isn't supported.", 415)
    seconds = audio_duration_seconds(data, kind)
    if seconds is not None and seconds > max_seconds + 0.5:
        raise ApiError("BAD_INPUT", f"Recordings can be up to {max_seconds} seconds.", 413)
    return kind


# --- audio duration (best effort; size cap above always applies) -------------------

def audio_duration_seconds(data: bytes, kind: str) -> float | None:
    try:
        if kind == "audio/mp4":
            return _mp4_duration(data)
        if kind == "audio/webm":
            return _webm_duration(data)
    except (struct.error, ValueError, IndexError):
        return None
    return None


def _mp4_duration(data: bytes) -> float | None:
    i = data.find(b"mvhd")
    if i < 4:
        return None
    version = data[i + 4]
    if version == 1:
        timescale, duration = struct.unpack(">IQ", data[i + 24:i + 36])
    else:
        timescale, duration = struct.unpack(">II", data[i + 16:i + 24])
    return duration / timescale if timescale else None


def _webm_duration(data: bytes) -> float | None:
    # MediaRecorder often omits Duration while streaming; then we rely on size.
    head = data[:64 * KB]
    scale_ns = 1_000_000
    j = head.find(b"\x2a\xd7\xb1")  # TimecodeScale
    if j >= 0:
        size = head[j + 3] & 0x0F if head[j + 3] & 0x80 else None
        if size:
            scale_ns = int.from_bytes(head[j + 4:j + 4 + size], "big") or scale_ns
    k = head.find(b"\x44\x89")  # Duration (float)
    if k < 0:
        return None
    marker = head[k + 2]
    if marker == 0x88:
        (ticks,) = struct.unpack(">d", head[k + 3:k + 11])
    elif marker == 0x84:
        (ticks,) = struct.unpack(">f", head[k + 3:k + 7])
    else:
        return None
    return ticks * scale_ns / 1e9
