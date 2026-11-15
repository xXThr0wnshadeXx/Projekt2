"""Rate limit, body size and file type guards (issue #54)."""

import struct

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from backend.app import guards, timeouts
from backend.app.config import Settings
from backend.app.errors import ApiError, install_error_handlers
from backend.app.main import create_app

ORIGIN = "https://glance.example"


@pytest.fixture(scope="module", autouse=True)
def _pool():
    yield
    timeouts.shutdown()


# --- rate limit -------------------------------------------------------------------

class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


def limiter(clock, model=3, general=5, hops=0):
    return guards.RateLimitMiddleware(
        app=None, model_budget=guards.Budget(model, 60),
        general_budget=guards.Budget(general, 60), trusted_proxy_hops=hops, clock=clock,
    )


def test_model_endpoints_have_a_tighter_budget():
    clock = Clock()
    rl = limiter(clock)
    assert [rl.check("1.1.1.1", "/api/capture") for _ in range(3)] == [0, 0, 0]
    assert rl.check("1.1.1.1", "/api/capture") > 0
    # the cheap bucket is separate
    assert rl.check("1.1.1.1", "/api/diff") == 0
    # another IP is unaffected
    assert rl.check("2.2.2.2", "/api/capture") == 0


def test_window_slides():
    clock = Clock()
    rl = limiter(clock, model=1)
    assert rl.check("ip", "/api/transcribe") == 0
    wait = rl.check("ip", "/api/transcribe")
    assert 59 < wait <= 60
    clock.t += 60
    assert rl.check("ip", "/api/transcribe") == 0


def test_forwarded_for_uses_the_address_the_proxy_recorded():
    rl = limiter(Clock(), hops=1)
    scope = {"headers": [(b"x-forwarded-for", b"6.6.6.6, 203.0.113.9")], "client": ("10.0.0.1", 1)}
    assert rl.client_ip(scope) == "203.0.113.9"  # leftmost value is client-forgeable
    assert limiter(Clock(), hops=0).client_ip(scope) == "10.0.0.1"


def test_sweep_forgets_idle_clients():
    clock = Clock()
    rl = limiter(clock)
    rl.check("a", "/api/diff")
    clock.t += 3600
    rl.check("b", "/api/diff")
    assert ("a", "all") not in rl.hits


def test_rate_limit_response_is_friendly_and_readable_cross_origin():
    settings = Settings(_env_file=None, allowed_origin=ORIGIN, rate_limit_per_minute=2)
    app = create_app(settings, warm_cas=False)
    body = {"from_latex": "x", "to_latex": "x", "mode": "exam"}
    with TestClient(app) as c:
        codes = [c.post("/api/diff", json=body, headers={"Origin": ORIGIN}).status_code for _ in range(3)]
        r = c.post("/api/diff", json=body, headers={"Origin": ORIGIN})
        health = c.get("/api/health")
    assert codes[:2] == [403, 403] and codes[2] == 429
    assert r.json()["error"]["code"] == "RATE_LIMITED"
    assert "try again" in r.json()["error"]["message"]
    assert int(r.headers["retry-after"]) >= 1
    assert r.headers.get("access-control-allow-origin") == ORIGIN
    assert health.status_code == 200  # health is never limited


# --- body size ----------------------------------------------------------------------

@pytest.fixture
def echo_client():
    app = FastAPI()
    install_error_handlers(app)
    app.add_middleware(guards.BodyLimitMiddleware, max_image_bytes=1000, max_audio_seconds=1)

    @app.post("/api/capture")
    async def capture(request: Request):
        return {"n": len(await request.body())}

    @app.post("/api/diff")
    async def diff(request: Request):
        return {"n": len(await request.body())}

    with TestClient(app) as c:
        yield c


def test_declared_oversize_body_is_refused(echo_client):
    r = echo_client.post("/api/capture", content=b"x" * (1000 + guards.FORM_OVERHEAD + 1))
    assert r.status_code == 413
    assert r.json()["error"]["code"] == "BAD_INPUT"


def test_streamed_oversize_body_without_length_is_refused(echo_client):
    def chunks():
        for _ in range(100):
            yield b"x" * 1024

    r = echo_client.post("/api/diff", content=chunks())  # chunked, no Content-Length
    assert r.status_code == 413


def test_json_endpoints_get_a_small_limit(echo_client):
    assert echo_client.post("/api/diff", content=b"x" * 1000).json() == {"n": 1000}
    assert echo_client.post("/api/diff", content=b"x" * (guards.JSON_BODY_LIMIT + 1)).status_code == 413
    # capture allows the image limit
    assert echo_client.post("/api/capture", content=b"x" * 5000).json() == {"n": 5000}


# --- file types -------------------------------------------------------------------------

JPEG = b"\xff\xd8\xff\xe0" + b"\0" * 20
PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 20
WEBP = b"RIFF\0\0\0\0WEBPVP8 " + b"\0" * 20
PDF = b"%PDF-1.7\n" + b"\0" * 20
GIF = b"GIF89a" + b"\0" * 20
SVG = b"<svg xmlns='http://www.w3.org/2000/svg'/>"


def mp4(seconds: float, timescale=1000) -> bytes:
    mvhd = b"mvhd" + bytes([0, 0, 0, 0]) + b"\0" * 8 + struct.pack(">II", timescale, int(seconds * timescale))
    return b"\0\0\0\x18ftypM4A " + b"\0" * 12 + struct.pack(">I", len(mvhd) + 4) + mvhd + b"\0" * 80


def webm(seconds: float | None) -> bytes:
    out = b"\x1a\x45\xdf\xa3" + b"\0" * 20 + b"\x2a\xd7\xb1\x83" + (1_000_000).to_bytes(3, "big")
    if seconds is not None:
        out += b"\x44\x89\x88" + struct.pack(">d", seconds * 1000)
    return out + b"\0" * 40


@pytest.mark.parametrize("data, kind", [(JPEG, "image/jpeg"), (PNG, "image/png"),
                                        (WEBP, "image/webp"), (PDF, "application/pdf")])
def test_allowed_images(data, kind):
    assert guards.check_image(data, 8 * 1024 * 1024) == kind


@pytest.mark.parametrize("data", [GIF, SVG, b"MZ\x90\0" + b"\0" * 20, webm(1)])
def test_other_files_are_refused_by_signature(data):
    with pytest.raises(ApiError) as e:
        guards.check_image(data, 8 * 1024 * 1024)
    assert e.value.code == "BAD_INPUT" and e.value.status == 415


def test_image_size_and_empty():
    with pytest.raises(ApiError):
        guards.check_image(b"", 100)
    with pytest.raises(ApiError) as e:
        guards.check_image(JPEG + b"\0" * 200, 100)
    assert e.value.status == 413


def test_audio_allowlist_and_duration():
    assert guards.check_audio(mp4(12), 30) == "audio/mp4"
    assert guards.check_audio(webm(12), 30) == "audio/webm"
    assert guards.check_audio(webm(None), 30) == "audio/webm"  # no Duration: size cap only
    for too_long in (mp4(45), webm(31)):
        with pytest.raises(ApiError) as e:
            guards.check_audio(too_long, 30)
        assert "30 seconds" in e.value.message
    with pytest.raises(ApiError):
        guards.check_audio(PNG, 30)
    with pytest.raises(ApiError):
        guards.check_audio(webm(None) + b"\0" * (31 * guards.AUDIO_BYTES_PER_SECOND), 30)


def test_duration_parsers():
    assert guards.audio_duration_seconds(mp4(12.5), "audio/mp4") == pytest.approx(12.5)
    assert guards.audio_duration_seconds(webm(7.25), "audio/webm") == pytest.approx(7.25)
    assert guards.audio_duration_seconds(b"\x1a\x45\xdf\xa3", "audio/webm") is None
