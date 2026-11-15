"""Exam lock: exam mode set by an instructor's link, enforced by the server — #189.

Without this, exam mode is a setting the student chooses, and the API trusted
whatever `mode` the browser sent. So one click in Settings, or one edited
request, during an exam turned step checks back on. No school can sign off on
that.

An instructor creates a link. It carries a token signed with a server secret
that contains only the mode and an expiry: no student, no answers, nothing
stored. Every request from a locked session sends the token, and the server
refuses step checks for it whatever mode the request claims.

What it cannot do without accounts: know that a student who never opened the
link is in an exam. The hand-in receipt (#190) records whether work was done in
a locked session, which closes that gap for the instructor.
"""

import base64
import hashlib
import hmac
import json
import logging
import secrets
import time

from fastapi import APIRouter
from pydantic import BaseModel, Field

log = logging.getLogger("glance.exam_lock")

HEADER = "X-Glance-Exam"


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


class ExamLock:
    def __init__(self, secret: str | None):
        if not secret:
            # Links then stop working when the server restarts, which is safe
            # (the session falls back to the student's own setting) but should
            # be configured for a real exam.
            log.warning("EXAM_LINK_SECRET is not set; exam links last until the server restarts.")
            secret = secrets.token_urlsafe(32)
        self._key = secret.encode()

    def _sign(self, body: str) -> str:
        return _b64(hmac.new(self._key, body.encode(), hashlib.sha256).digest())

    def make(self, minutes: int, now: float | None = None) -> tuple[str, int]:
        expires = int((now if now is not None else time.time()) + minutes * 60)
        body = _b64(json.dumps({"mode": "exam", "exp": expires}, separators=(",", ":")).encode())
        return f"{body}.{self._sign(body)}", expires

    def expires_at(self, token: str | None, now: float | None = None) -> int | None:
        """The expiry of a valid, unexpired exam token, or None."""
        if not token or token.count(".") != 1:
            return None
        body, signature = token.split(".")
        if not hmac.compare_digest(signature, self._sign(body)):
            return None
        try:
            claims = json.loads(_unb64(body))
        except ValueError:
            return None
        if claims.get("mode") != "exam" or not isinstance(claims.get("exp"), int):
            return None
        if claims["exp"] <= (now if now is not None else time.time()):
            return None
        return claims["exp"]


class LinkRequest(BaseModel):
    # Long enough for an exam, short enough that a forgotten link expires.
    minutes: int = Field(ge=15, le=300)


class CheckRequest(BaseModel):
    token: str = Field(min_length=1, max_length=512)


def exam_router(lock: ExamLock) -> APIRouter:
    router = APIRouter(prefix="/api/exam")

    @router.post("/link")
    async def link(req: LinkRequest) -> dict:
        # Anyone may create one: a link can only take features away.
        token, expires = lock.make(req.minutes)
        return {"token": token, "expires_at": expires}

    @router.post("/check")
    async def check(req: CheckRequest) -> dict:
        expires = lock.expires_at(req.token)
        return {"valid": expires is not None, "expires_at": expires}

    return router
