"""Voice and typed commands for the scratchpad (DESIGN.md 9, F16; issue #24).

A fixed set of intents. The common phrasings are matched here by rules, so they
are instant, free, deterministic and work with no model at all. Only a phrase
the rules don't recognise is sent to the model, which must still pick one of
the same intents (strict schema). Nothing here touches the math itself: an
edit is returned as an instruction for the student to confirm, never applied.
"""

import re
from typing import Literal

from typing_extensions import TypedDict

Intent = Literal[
    "navigate", "read", "edit", "delete", "undo", "new_line",
    "check", "what_changed", "export", "help", "unknown",
]
INTENTS: tuple[str, ...] = (
    "navigate", "read", "edit", "delete", "undo", "new_line",
    "check", "what_changed", "export", "help", "unknown",
)


class Command(TypedDict):
    intent: Intent
    target_line: str | None
    instruction: str | None


NUMBER_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
    "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13,
    "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18,
    "nineteen": 19, "twenty": 20, "first": 1, "second": 2, "third": 3, "fourth": 4,
    "fifth": 5, "sixth": 6, "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10,
    # Speech-to-text often hears these for "two" and "four".
    "to": 2, "too": 2, "for": 4,
}
_NUM = r"(\d{1,3}|" + "|".join(sorted(NUMBER_WORDS, key=len, reverse=True)) + r")"
_ORDINALS = ("first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth")
# "the second line" / "the 2nd line". Only real ordinals here: "to line" must
# not read as "two line", which the misheard-number words above would allow.
_ORD = r"(\d{1,3})(?:st|nd|rd|th)|(" + "|".join(_ORDINALS) + r")"
_LINE = rf"(?:line\s+(?:number\s+)?{_NUM}|(?:the\s+)?(?:{_ORD})\s+line)"


def _number(token: str | None) -> int | None:
    if token is None:
        return None
    token = token.lower()
    return int(token) if token.isdigit() else NUMBER_WORDS.get(token)


def _line_ref(text: str) -> int | None:
    m = re.search(_LINE, text)
    if not m:
        return None
    return _number(next(g for g in m.groups() if g))


def _normalise(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[.,!?;:]+", " ", text)
    text = re.sub(r"^(please|okay|ok|um|uh|glance)\s+", "", text)
    text = re.sub(r"\s+(please)$", "", text)
    return re.sub(r"\s+", " ", text).strip()


EDIT_REFUSAL = "I can only change what you tell me to change. Say, for example, change the 3 to a 4."

# "fix my mistake", "make it right", "what's wrong with it": a request for a
# correction. Glance changes only what the student names, so these are refused.
_ASKS_FOR_CORRECTION = re.compile(
    r"\b(?:fix|correct|repair|redo|rewrite)\b(?!\s+(?:the\s+)?(?:\w+\s+)?(?:to|with|into)\b)"
    r"|\bmake (?:it|this|that|them) (?:right|correct|better|work)\b"
    r"|\bwhat(?:'s| is) wrong\b|\bwhere(?:'s| is| did i go) (?:my |the )?(?:mistake|error|wrong)\b"
    r"|\bmy (?:mistake|error)\b|\bget it right\b|\bdo (?:it|this) (?:right|correctly)\b",
    re.IGNORECASE,
)


def asks_for_correction(text: str) -> bool:
    return bool(_ASKS_FOR_CORRECTION.search(text))


_DIGIT_WORDS = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
    "plus": "+", "minus": "-", "times": "*", "equals": "=",
}


def _canon(token: str) -> str:
    token = token.lower().strip()
    return _DIGIT_WORDS.get(token, token)


def _token(text: str) -> str | None:
    """One number, letter or operator word: the only thing a student can name."""
    text = re.sub(r"^(?:a|an|the)\s+", "", text.strip().lower())
    if re.fullmatch(r"\d{1,6}|[a-z]|" + "|".join(_DIGIT_WORDS) + r"|[+\-*/=]", text):
        return _canon(text)
    return None


def grounded_edit(instruction: str | None, transcript: str) -> bool:
    """True only for "replace A with B" where A and B are single tokens the
    student said. A model may not choose the new value."""
    m = re.fullmatch(r"replace (.+) with (.+)", (instruction or "").strip(), re.IGNORECASE)
    if not m:
        return False
    old, new = _token(m.group(1)), _token(m.group(2))
    if old is None or new is None or old == new:
        return False
    said = {_canon(w) for w in re.findall(r"[a-z0-9+\-*/=]+", transcript.lower())}
    return old in said and new in said


def _cmd(intent: Intent, line: int | None = None, instruction: str | None = None) -> Command:
    return {
        "intent": intent,
        "target_line": f"W{line}" if line is not None else None,
        "instruction": instruction,
    }


def parse_command(text: str, current: int | None, line_count: int) -> Command | None:
    """Match a command by rules. None means "not recognised; ask the model".

    `current` is the 1-based line the student is on, if any. A command with no
    line number applies to it, or to the last line.
    """
    t = _normalise(text)
    if not t:
        return None
    here = current or (line_count or None)
    ref = _line_ref(t)

    if re.fullmatch(r"undo( that| it| the delete)?", t):
        return _cmd("undo")
    if re.fullmatch(r"(help|what can i say|what are the commands|commands)", t):
        return _cmd("help")
    if re.fullmatch(r"(export|hand (it )?in|hand in my work|download( my work)?|print( my work)?|save as pdf)", t):
        return _cmd("export")
    if re.fullmatch(r"(new line|next step|add (a )?(new )?line|start a new line)", t):
        return _cmd("new_line")
    if re.fullmatch(r"what changed( (on|in) " + _LINE + r")?", t):
        return _cmd("what_changed", ref or here)
    if re.fullmatch(r"(next|next line|go down|down)", t):
        return _cmd("navigate", (here or 0) + 1)
    if re.fullmatch(r"(previous|previous line|back|go back|go up|up|last line)", t):
        if t == "last line":
            return _cmd("navigate", line_count or None)
        return _cmd("navigate", max((here or 1) - 1, 1))
    if re.fullmatch(r"(first line|top)", t):
        return _cmd("navigate", 1)
    if re.fullmatch(r"(go to |jump to |move to )?" + _LINE, t):
        return _cmd("navigate", ref)
    if re.fullmatch(r"read( (it|this|that|this line|that line|the line|" + _LINE + r"))?", t):
        return _cmd("read", ref or here)
    if re.fullmatch(r"read (all|everything|it all|my work|all my work|all lines|back my work|the whole thing)", t):
        return _cmd("read", None, "all")
    if re.fullmatch(r"(delete|remove|erase|scratch|cross out)( (it|this|that|this line|that line|the line|" + _LINE + r"))?", t):
        return _cmd("delete", ref or here)
    if re.fullmatch(r"(check|check (it|this|that|this step|that step|my step|my work|" + _LINE + r"))", t):
        return _cmd("check", ref or here)

    m = re.fullmatch(
        r"(?:change|replace|swap)\s+(?:the\s+)?(.+?)\s+(?:to|with|for|into)\s+(?:a\s+|an\s+|the\s+)?(.+?)"
        r"(?:\s+(?:on|in)\s+" + _LINE + r")?",
        t,
    )
    if m:
        line = _number(next((g for g in m.groups()[2:] if g), None)) or here
        return _cmd("edit", line, f"replace {m.group(1)} with {m.group(2)}")
    if re.fullmatch(r"(edit|change)( (it|this|that|this line|that line|the line|" + _LINE + r"))?", t):
        return _cmd("edit", ref or here, None)

    return None

