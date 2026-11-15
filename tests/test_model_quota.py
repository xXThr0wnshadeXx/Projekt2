from concurrent.futures import ThreadPoolExecutor

import httpx
import openai
import pytest
from fastapi.testclient import TestClient

from backend.app import model_quota, openai_client
from backend.app.config import Settings
from backend.app.errors import ApiError
from backend.app.main import create_app


@pytest.mark.asyncio
async def test_quota_disables_unmetered_sdk_retries():
    settings = openai_client.ModelSettings(
        _env_file=None, openai_api_key="test-value", model_vision="vision",
        model_text="text", model_stt="speech", model_max_retries=2,
    )
    unmetered = openai_client.ModelClient(settings)
    metered = openai_client.ModelClient(settings, quota=model_quota.ModelQuota(3, 10))
    try:
        assert unmetered.client.max_retries == 2
        assert metered.client.max_retries == 0
    finally:
        await unmetered.close()
        await metered.close()


def test_shared_quota_is_atomic_and_expires(monkeypatch):
    now = 100
    monkeypatch.setattr(model_quota, "monotonic", lambda: now)
    quota = model_quota.ModelQuota(3, 10)

    def attempt(_):
        try:
            quota.acquire()
        except ApiError as error:
            assert error.headers == {"Retry-After": "10"}
            return False
        return True

    with ThreadPoolExecutor(max_workers=12) as pool:
        assert sum(pool.map(attempt, range(30))) == 3
    now += 10
    assert attempt(None)


def test_routes_and_study_explanations_share_an_upstream_budget(monkeypatch):
    calls = []
    original_client = openai.AsyncOpenAI

    def respond(request):
        calls.append(request.url.path)
        return httpx.Response(200, json={
            "choices": [{
                "index": 0,
                "finish_reason": "stop",
                "message": {"role": "assistant", "content": '{"explanation":"Both sides were divided by two."}'},
            }],
        })

    def fake_client(**kwargs):
        return original_client(
            **kwargs, http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond)),
        )

    monkeypatch.setattr(openai, "AsyncOpenAI", fake_client)
    monkeypatch.setattr(openai_client, "AsyncOpenAI", fake_client)
    app = create_app(Settings(
        _env_file=None, openai_api_key="test-value", model_vision="vision",
        model_text="text", model_stt="speech", model_call_limit=1,
    ))
    step = {"from_latex": "2x=4", "to_latex": "x=2"}

    with TestClient(app) as client:
        study = client.post("/api/diff", json={**step, "mode": "study"})
        assert study.json()["message"] == "Both sides were divided by two."
        response = client.post("/api/spoken-to-latex", json={"text": "x equals two"})
        assert response.status_code == 429
        assert response.json()["error"]["code"] == "RATE_LIMITED"
        assert int(response.headers["Retry-After"]) > 0
        assert client.get("/api/health").status_code == 200
        assert client.post("/api/diff", json=step).json()["verified"]

    assert calls == ["/v1/chat/completions"]
