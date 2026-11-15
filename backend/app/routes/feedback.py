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
_UNSAFE = re.compile(r"=|\b(answer|solution|next step|you should|try this|calculate)\b", re.I)


class FeedbackRequest(BaseModel):
    problem_lines: list[str] = Field(min_length=1, max_length=_MAX_LINES)
    work_lines: list[str] = Field(min_length=1, max_length=_MAX_LINES)
    mode: Literal["study", "homework", "exam"]
    kind: Literal["review", "hint"]


class FeedbackResponse(BaseModel):
    outcome: Literal["confirmed", "needs_review", "hint"]
    message: str = Field(min_length=1, max_length=240)


def _fallback(kind: str) -> FeedbackResponse:
    if kind == "hint":
        return FeedbackResponse(outcome="hint", message="Read each line back and check that every sign and grouping matches what you wrote.")
    return FeedbackResponse(outcome="needs_review", message="I couldn't safely confirm the submitted work. Review your recorded lines before handing it in.")


def feedback_router(models: ModelClient) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.post("/feedback", response_model=FeedbackResponse)
    async def feedback(req: FeedbackRequest) -> FeedbackResponse:
        if req.mode == "exam":
            raise ApiError("MODE_DISABLED", "AI feedback is off in exam mode.", 403)
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
        return response

    return router
