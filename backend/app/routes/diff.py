"""POST /api/diff — step check (DESIGN.md 9, 11, 14).

    study     verified → one-sentence explanation of the operation
    homework  verified → "This step checks out."
    any       not verified → "I couldn't confirm this step."
    exam      403 MODE_DISABLED, before any work is done

Never says a step is wrong, never suggests what to do next.
"""

from typing import Literal

from fastapi import APIRouter, Header
from pydantic import BaseModel, Field

from ..errors import ApiError
from ..exam_lock import ExamLock
from ..explain import Explainer
from ..mathcheck import check_step

CHECKS_OUT = "This step checks out."
COULDNT_CONFIRM = "I couldn't confirm this step."
_MAX_LATEX = 500


class DiffRequest(BaseModel):
    from_latex: str = Field(min_length=1, max_length=_MAX_LATEX)
    to_latex: str = Field(min_length=1, max_length=_MAX_LATEX)
    mode: Literal["study", "homework", "exam"] = "homework"


class DiffResponse(BaseModel):
    verified: bool
    method: str
    message: str


def diff_router(explain: Explainer | None = None, lock: ExamLock | None = None) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.post("/diff", response_model=DiffResponse)
    async def diff(
        req: DiffRequest,
        x_glance_exam: str | None = Header(default=None),
    ) -> DiffResponse:
        # An instructor's exam lock (#189) wins over whatever mode the request
        # claims: a forged `mode: "study"` from a locked session is refused.
        locked = lock is not None and lock.expires_at(x_glance_exam) is not None
        if req.mode == "exam" or locked:
            raise ApiError("MODE_DISABLED", "Step checking is off in exam mode.", 403)

        verified, method = await check_step(req.from_latex, req.to_latex)
        if not verified:
            return DiffResponse(verified=False, method=method, message=COULDNT_CONFIRM)

        message = CHECKS_OUT
        if req.mode == "study" and explain is not None:
            message = await explain(req.from_latex, req.to_latex) or CHECKS_OUT
        return DiffResponse(verified=True, method=method, message=message)

    return router
