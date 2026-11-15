"""Final, feedback-only AI review. It never returns an answer or a next step."""

import json
import re
from typing import Literal

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ..errors import ApiError
from ..openai_client import ModelClient, ModelError
from ..prompts import FEEDBACK_PROMPT

_MAX_LINES = 32
_MAX_LINE_CHARS = 500
_UNSAFE = re.compile(
    r"=|\b(answer|solution|next step|you should|try this|calculate|correct|incorrect|wrong|right|mistake|error)\b",
    re.I,
)
CONFIRMED_MESSAGE = "Nothing stood out for another look."
NOTHING_TO_ADD = "I have nothing to add on this one."


class FeedbackRequest(BaseModel):
    problem_lines: list[str] = Field(min_length=1, max_length=_MAX_LINES)
    work_lines: list[str] = Field(min_length=1, max_length=_MAX_LINES)
    mode: Literal["reader", "study", "homework", "exam"] = "reader"
    kind: Literal["review", "hint"]


class FeedbackResponse(BaseModel):
    outcome: Literal["confirmed", "needs_review", "hint"]
    message: str = Field(min_length=1, max_length=240)


def _fallback(kind: str) -> FeedbackResponse:
    if kind == "hint":
        return FeedbackResponse(outcome="hint", message="Read each line back and look at every sign and grouping.")
    return FeedbackResponse(outcome="needs_review", message=NOTHING_TO_ADD)


def feedback_router(models: ModelClient) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.post("/feedback", response_model=FeedbackResponse)
    async def feedback(req: FeedbackRequest) -> FeedbackResponse:
        # Same gate as step checks: only study and homework, before any model call.
        if req.mode in ("reader", "exam"):
            raise ApiError("MODE_DISABLED", "AI feedback is off.", 403)
        if any(not line.strip() or len(line) > _MAX_LINE_CHARS for line in req.problem_lines + req.work_lines):
            raise ApiError("BAD_INPUT", "Each problem and work line must be short math text.", 400)
        try:
            result = await models.interpret("feedback", [
                {"role": "system", "content": FEEDBACK_PROMPT},
                {"role": "user", "content": json.dumps({
                    "request": req.kind,
                    "problem_lines": req.problem_lines,
                    "student_work": req.work_lines,
                })},
            ])
            response = FeedbackResponse.model_validate(result)
        except (ModelError, ValueError):
            return _fallback(req.kind)

        expected = "hint" if req.kind == "hint" else {"confirmed", "needs_review"}
        if response.outcome not in expected or _UNSAFE.search(response.message):
            return _fallback(req.kind)
        if response.outcome == "confirmed":
            return FeedbackResponse(outcome="confirmed", message=CONFIRMED_MESSAGE)
        return response

    return router
