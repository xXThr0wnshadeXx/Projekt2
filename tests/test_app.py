"""App skeleton: health, CORS, and the single error shape (DESIGN.md 9)."""

import pytest
from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.errors import ApiError
from backend.app.main import create_app

FRONT_END = "https://glance.example"


@pytest.fixture
def client():
    app = create_app(Settings(_env_file=None, allowed_origin=FRONT_END), warm_cas=False)

    @app.get("/api/_boom")
    async def boom():
        raise RuntimeError("secret internals")

    @app.get("/api/_api_error")
    async def api_error():
        raise ApiError("UNPARSEABLE", "I couldn't read that line.", 422)

    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


def test_health_returns_ok(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_cors_allows_only_the_front_end_origin(client):
    allowed = client.options(
        "/api/health",
        headers={"Origin": FRONT_END, "Access-Control-Request-Method": "GET"},
    )
    assert allowed.headers.get("access-control-allow-origin") == FRONT_END

    other = client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in other.headers


def test_wildcard_origin_is_ignored():
    settings = Settings(_env_file=None, allowed_origin="*, https://a.example/")
    assert settings.allowed_origins == ["https://a.example"]


def test_unknown_route_uses_error_shape(client):
    response = client.get("/api/nope")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_api_error_uses_error_shape(client):
    response = client.get("/api/_api_error")
    assert response.status_code == 422
    assert response.json() == {
        "error": {"code": "UNPARSEABLE", "message": "I couldn't read that line."}
    }


def test_unhandled_exception_never_leaks_a_trace(client):
    response = client.get("/api/_boom")
    assert response.status_code == 500
    body = response.json()
    assert body["error"]["code"] == "INTERNAL"
    assert "secret internals" not in response.text


def test_models_configured_needs_every_value():
    assert not Settings(_env_file=None).models_configured
    full = Settings(
        _env_file=None,
        openai_api_key="k",
        model_vision="v",
        model_text="t",
        model_stt="s",
    )
    assert full.models_configured


def test_production_requires_trusted_proxy_hops(caplog):
    caplog.set_level("CRITICAL", logger="glance.startup")
    with pytest.raises(RuntimeError, match="TRUSTED_PROXY_HOPS"):
        create_app(Settings(_env_file=None, environment="production"), warm_cas=False)
    assert "TRUSTED_PROXY_HOPS must be set in production" in caplog.text


def test_production_accepts_a_trusted_proxy_setting():
    app = create_app(
        Settings(_env_file=None, environment="production", trusted_proxy_hops=1), warm_cas=False
    )
    assert app is not None
