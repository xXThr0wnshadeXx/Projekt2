"""Exam lock set by an instructor's link, enforced by the server — #189."""

import time

from fastapi.testclient import TestClient

from backend.app import main
from backend.app.config import Settings
from backend.app.exam_lock import ExamLock

STEP = {"from_latex": "2x = 8", "to_latex": "x = 4"}


def app_client():
    settings = Settings(_env_file=None, exam_link_secret="test-secret")
    return TestClient(main.create_app(settings, warm_cas=False))


def test_a_token_holds_only_mode_and_expiry_and_is_checked():
    lock = ExamLock("s")
    token, expires = lock.make(60, now=1000)
    assert expires == 1000 + 3600
    assert lock.expires_at(token, now=1001) == expires
    assert lock.expires_at(token, now=expires) is None            # expired
    assert ExamLock("other").expires_at(token, now=1001) is None  # wrong secret
    body, sig = token.split(".")
    assert lock.expires_at(body + "." + sig[::-1], now=1001) is None  # tampered
    assert lock.expires_at("nonsense", now=1001) is None


def test_instructor_link_then_a_forged_study_request_is_refused():
    with app_client() as client:
        link = client.post("/api/exam/link", json={"minutes": 90}).json()
        assert link["expires_at"] > time.time() + 89 * 60
        check = client.post("/api/exam/check", json={"token": link["token"]}).json()
        assert check == {"valid": True, "expires_at": link["expires_at"]}

        # The lock wins over the mode the request claims.
        forged = client.post("/api/diff", json={**STEP, "mode": "study"},
                             headers={"X-Glance-Exam": link["token"]})
        assert forged.status_code == 403
        assert forged.json()["error"]["code"] == "MODE_DISABLED"

        # Without the lock, the student's own homework mode still checks steps.
        free = client.post("/api/diff", json={**STEP, "mode": "homework"})
        assert free.status_code == 200


def test_an_invalid_token_gives_no_exam_level_trust_and_is_reported_invalid():
    with app_client() as client:
        assert client.post("/api/exam/check", json={"token": "a.b"}).json() == {"valid": False, "expires_at": None}
        r = client.post("/api/diff", json={**STEP, "mode": "homework"}, headers={"X-Glance-Exam": "a.b"})
        assert r.status_code == 200


def test_link_length_is_bounded():
    with app_client() as client:
        assert client.post("/api/exam/link", json={"minutes": 5}).status_code == 400
        assert client.post("/api/exam/link", json={"minutes": 600}).status_code == 400


def test_the_browser_may_send_the_lock_header():
    with app_client() as client:
        r = client.options("/api/diff", headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-glance-exam",
        })
        assert "x-glance-exam" in r.headers.get("access-control-allow-headers", "").lower()
