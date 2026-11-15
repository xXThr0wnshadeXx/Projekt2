"""Read the glossary as text only; never execute or modify frontend source."""

import ast
from pathlib import Path
import re

import pytest

SOURCE = Path(__file__).resolve().parents[1] / "frontend/src/talk.ts"
BLOCK = SOURCE.read_text().split("export const GLOSSARY:", 1)[1].split("\n];", 1)[0]
STRING = r"'(?:\\.|[^'\\])*'"
ROWS = re.findall(rf"^\s*\[/.*?/\w*,\s*({STRING}),\s*({STRING})\],?\s*$", BLOCK, re.MULTILINE)
MEANINGS = [(ast.literal_eval(term), ast.literal_eval(meaning)) for term, meaning in ROWS]
TEACHES = re.compile(
    r"\b(?:how to|first|then|next step|you should|you can solve|to find|to solve|"
    r"isolate|divide both sides|multiply both sides|subtract .+ from both sides|"
    r"add .+ to both sides|the answer is|the solution is)\b|[a-z]\s*=\s*-?\d",
    re.IGNORECASE,
)


def test_every_glossary_entry_is_inspected():
    assert MEANINGS
    assert len(MEANINGS) == len(re.findall(r"^\s*\[/", BLOCK, re.MULTILINE))


@pytest.mark.parametrize("term,meaning", MEANINGS, ids=[term for term, _ in MEANINGS])
def test_glossary_defines_a_word_without_teaching_a_method(term, meaning):
    assert not TEACHES.search(meaning), f"{term}: {meaning}"


@pytest.mark.parametrize("meaning", [
    "First, divide both sides by two.", "To find x, subtract three.",
    "You should factor it next.", "The answer is x = 4.",
])
def test_method_detector_catches_advice(meaning):
    assert TEACHES.search(meaning)
