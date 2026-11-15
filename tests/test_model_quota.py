from concurrent.futures import ThreadPoolExecutor

import httpx
import openai
from fastapi.testclient import TestClient

from backend.app import model_quota, openai_client
from backend.app.config import Settings
from backend.app.errors import ApiError
from backend.app.main import create_app


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
        assert client.post("/api/diff", json={**step, "mode": "homework"}).json()["verified"]

    assert calls == ["/v1/chat/completions"]


def test_a_verified_step_survives_an_exhausted_quota(monkeypatch):
    """Reported by nicolashlam on #84.

    SymPy has already verified the step by the time the explanation is asked
    for, and the explanation is optional by design (#20). Running out of shared
    model budget must therefore fall back to the plain confirmation, not turn a
    verified step into a 429.
    """
    from fastapi.testclient import TestClient

    from backend.app import main
    from backend.app.config import Settings

    settings = Settings(
        _env_file=None, openai_api_key="test-value",
        model_vision="v", model_text="t", model_stt="s",
        model_call_limit=1, model_call_window_seconds=60,
    )
    step = {"from_latex": "2x + 3 = 11", "to_latex": "2x = 8", "mode": "study"}

    with TestClient(main.create_app(settings, warm_cas=False)) as client:
        first = client.post("/api/diff", json=step)
        second = client.post("/api/diff", json=step)

    # Whatever happens to the optional explanation, neither call may 429.
    for response in (first, second):
        assert response.status_code == 200, response.text
        assert response.json()["verified"] is True
        assert "couldn't confirm" not in response.json()["message"]
