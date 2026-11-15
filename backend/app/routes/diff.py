"""Deterministic math validation and step checks (DESIGN.md 9, 11, 14).

    study     verified → one-sentence explanation of the operation
    homework  verified → "This step checks out."
    any       not verified → "I couldn't confirm this step."
    exam      403 MODE_DISABLED, before any work is done

Never says a step is wrong, never suggests what to do next.
"""

from typing import Annotated, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field, StringConstraints

from ..errors import ApiError
from ..explain import Explainer
from ..mathcheck import check_step, validate_latex

CHECKS_OUT = "This step checks out."
COULDNT_CONFIRM = "I couldn't confirm this step."
_MAX_LATEX = 500


class ValidateRequest(BaseModel):
    latex: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=_MAX_LATEX)]


class DiffRequest(BaseModel):
    from_latex: str = Field(min_length=1, max_length=_MAX_LATEX)
    to_latex: str = Field(min_length=1, max_length=_MAX_LATEX)
    mode: Literal["study", "homework", "exam"] = "homework"


class DiffResponse(BaseModel):
    verified: bool
    method: str
    message: str


def diff_router(explain: Explainer | None = None) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.post("/validate-latex")
    async def validate(req: ValidateRequest) -> dict[str, bool]:
        return {"valid": await validate_latex(req.latex)}

    @router.post("/diff", response_model=DiffResponse)
    async def diff(req: DiffRequest) -> DiffResponse:
        if req.mode == "exam":
            raise ApiError("MODE_DISABLED", "Step checking is off in exam mode.", 403)

        verified, method = await check_step(req.from_latex, req.to_latex)
        if not verified:
            return DiffResponse(verified=False, method=method, message=COULDNT_CONFIRM)

        message = CHECKS_OUT
        if req.mode == "study" and explain is not None:
            message = await explain(req.from_latex, req.to_latex) or CHECKS_OUT
        return DiffResponse(verified=True, method=method, message=message)

    return router
