"""Validate provider output before routes read or annotate it."""

from pydantic import BaseModel, ConfigDict, FiniteFloat

from .commands import Intent


class ProviderResponse(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")


class CaptureLine(ProviderResponse):
    latex: str
    confidence: FiniteFloat
    intent_notes: str


class Diagram(ProviderResponse):
    description: str


class CaptureResponse(ProviderResponse):
    instructions: str
    lines: list[CaptureLine]
    diagrams: list[Diagram]
    warnings: list[str]


class Alternative(ProviderResponse):
    latex: str
    readback: str


class SpokenResponse(ProviderResponse):
    latex: str | None
    ambiguous: bool
    clarifying_question: str | None
    alternatives: list[Alternative]
    readback: str | None


class CommandResponse(ProviderResponse):
    intent: Intent
    target_line: str | None
    instruction: str | None


RESPONSE_TYPES = {
    "capture": CaptureResponse,
    "spoken": SpokenResponse,
    "command": CommandResponse,
}
