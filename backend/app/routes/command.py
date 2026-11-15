"""POST /api/command — DESIGN.md 9, 10.3 (issue #24).

    {"text": "delete line two", "current_line": "W3", "line_count": 3}
 →  {"intent": "delete", "target_line": "W2", "instruction": null}

Rules first (commands.py), the model only for phrasings they don't cover, and
"unknown" whenever neither is sure. The front end says "I didn't catch that."
for unknown. A command never changes the math by itself: an edit comes back as
an instruction the student confirms.
"""

import json
import re

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..commands import INTENTS, Command, parse_command
from ..openai_client import ModelClient, ModelError
from ..prompts import COMMAND_PROMPT


class CommandResponse(BaseModel):
    intent: str
    target_line: str | None
    instruction: str | None


class CommandRequest(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    current_line: str | None = Field(default=None, max_length=12)
    line_count: int = Field(default=0, ge=0, le=500)


UNKNOWN: Command = {"intent": "unknown", "target_line": None, "instruction": None}


def _line_number(ref: str | None) -> int | None:
    m = re.fullmatch(r"W(\d{1,3})", ref or "")
    return int(m.group(1)) if m else None


def _checked(cmd: dict, line_count: int) -> Command:
    """Trust nothing about a result: intent from the list, line in range."""
    intent = cmd.get("intent")
    if intent not in INTENTS:
        return UNKNOWN
    target = cmd.get("target_line")
    number = _line_number(target)
    if target is not None and (number is None or not 1 <= number <= max(line_count, 0)):
        # Out of range is still a real request ("go to line 9" with 3 lines):
        # keep the number so the front end can say there is no such line.
        target = f"W{number}" if number else None
    instruction = cmd.get("instruction")
    if not isinstance(instruction, str) or not instruction.strip():
        instruction = None
    return {"intent": intent, "target_line": target, "instruction": instruction}


def command_router(models: ModelClient | None) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.post("/command", response_model=CommandResponse)
    async def command(req: CommandRequest) -> Command:
        current = _line_number(req.current_line)
        ruled = parse_command(req.text, current, req.line_count)
        if ruled is not None:
            return _checked(ruled, req.line_count)
        if models is None:
            return UNKNOWN
        try:
            result = await models.interpret("command", [
                {"role": "system", "content": COMMAND_PROMPT},
                {"role": "user", "content": json.dumps({
                    "command": req.text,
                    "current_line": req.current_line,
                    "line_count": req.line_count,
                })},
            ])
        except ModelError:
            return UNKNOWN
        return _checked(result, req.line_count)

    return router
