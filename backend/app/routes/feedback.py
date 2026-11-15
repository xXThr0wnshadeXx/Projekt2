"""POST /api/feedback — one review of the finished work before hand-in (#215).

Allowed exactly where step checks are (DESIGN.md 14, docs/integrity.md):
study and homework, never exam. It answers the same question a step check
does, for the whole page at once: does each line follow? It never hints,
never says "wrong", and never gives an answer or a next step.

The model returns only an outcome and, at most, a line number. Every
sentence the student hears is written here, so no model prose reaches them.
"""

import json
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ..errors import ApiError
from ..openai_client import ModelClient, ModelError
from ..prompts import FEEDBACK_PROMPT

_MAX_LINES = 32
_MAX_LINE_CHARS = 500

NOTHING_STOOD_OUT = "Nothing stood out for another look."
LOOK_AGAIN = "Line {n} of your work may be worth another look."
LOOK_AGAIN_SOMEWHERE = "Part of your work may be worth another look."
UNAVAILABLE = "I couldn't review your work right now. Nothing was checked."


class FeedbackRequest(BaseModel):
    problem_lines: list[str] = Field(min_length=1, max_length=_MAX_LINES)
    work_lines: list[str] = Field(min_length=1, max_length=_MAX_LINES)
    mode: Literal["study", "homework", "exam"] = "homework"


class FeedbackResponse(BaseModel):
    outcome: Literal["nothing_flagged", "look_again"]
    #: 1-based line of the student's work, or null.
    line: int | None
    message: str


class _ModelReview(BaseModel):
    # Anything more than an outcome and a line, such as a sentence, is refused.
    model_config = ConfigDict(extra="forbid", strict=True)

    outcome: Literal["nothing_flagged", "look_again"]
    line: int | None


def _templated(review: _ModelReview, work_lines: int) -> FeedbackResponse:
    if review.outcome == "nothing_flagged":
        return FeedbackResponse(outcome="nothing_flagged", line=None, message=NOTHING_STOOD_OUT)
    if review.line is not None and 1 <= review.line <= work_lines:
        return FeedbackResponse(
            outcome="look_again", line=review.line, message=LOOK_AGAIN.format(n=review.line)
        )
    return FeedbackResponse(outcome="look_again", line=None, message=LOOK_AGAIN_SOMEWHERE)


def feedback_router(models: ModelClient) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.post("/feedback", response_model=FeedbackResponse)
    async def feedback(req: FeedbackRequest) -> FeedbackResponse:
        if req.mode == "exam":
            raise ApiError("MODE_DISABLED", "Reviewing work is off in exam mode.", 403)
        lines = req.problem_lines + req.work_lines
        if any(not line.strip() or len(line) > _MAX_LINE_CHARS for line in lines):
            raise ApiError("BAD_INPUT", "Each problem and work line must be short math text.", 400)
        try:
            result = await models.interpret("feedback", [
                {"role": "system", "content": FEEDBACK_PROMPT},
                {"role": "user", "content": json.dumps({
                    "problem_lines": req.problem_lines,
                    "student_work": req.work_lines,
                })},
            ])
            review = _ModelReview.model_validate(result)
        except (ModelError, ValidationError):
            # Never guess: a failed review must not sound like a verdict.
            raise ApiError("MODEL_ERROR", UNAVAILABLE, 502)
        return _templated(review, len(req.work_lines))

    return router
