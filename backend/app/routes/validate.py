"""POST /api/validate — can SymPy read this line? (DESIGN.md 11)

A line the student typed with ordinary symbols is turned into LaTeX in the
browser, with no model involved. This is the same `valid` flag that capture and
spoken lines carry, for that path: without it a typed line could never be step
checked, because the front end would not know whether it parses.

It answers one question with one boolean. It never returns the parsed form, a
simplified form, or anything else that could be read as working the line out.
"""

from collections.abc import Awaitable, Callable

from fastapi import APIRouter
from pydantic import BaseModel, Field


class ValidateRequest(BaseModel):
    latex: str = Field(min_length=1, max_length=500)


class ValidateResponse(BaseModel):
    valid: bool


def validate_router(validate_latex: Callable[[str], Awaitable[bool]]) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.post("/validate", response_model=ValidateResponse)
    async def validate(req: ValidateRequest) -> ValidateResponse:
        return ValidateResponse(valid=await validate_latex(req.latex))

    return router
