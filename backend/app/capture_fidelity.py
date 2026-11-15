"""Keep capture's instructions and math lines apart — issue #176.

The vision model is told to copy printed instructions exactly and keep words out
of the math lines, but it does not always obey. Two failures were seen on the
live site:

- An image with only equations came back with instructions the model wrote
  itself ("Transcribe the two given algebraic equations from the image."), which
  the browser then announced as the worksheet's instructions.
- A heading ("Solve for x.") came back as a math line, `\\text{Solve for } x.`,
  so the student's focus landed on a sentence instead of the first equation.

This is deterministic, like the rest of the checking: code decides what is a
sentence and what is math, the model only reads the image. Nothing here adds
words that were not in the model's transcription, and no equation is changed.
"""

import re
from typing import Any

_TEXT = re.compile(r"\\(?:text|textrm|mathrm|textit|mbox)\s*\{([^{}]*)\}")
# Spacing commands and math-mode wrappers that carry no content of their own.
_NOISE = re.compile(r"\\[,;:! ]|\\quad|\\qquad|\$")

# Instructions that talk about the picture or the act of transcribing were
# written by the model, not printed on a worksheet.
_INVENTED = re.compile(
    r"\b(?:transcrib\w*|the (?:uploaded |attached |given |provided )?(?:image|picture|photo|screenshot)"
    r"|(?:from|in|on) (?:the|this) (?:image|picture|photo|screenshot))\b",
    re.IGNORECASE,
)


def _key(text: str) -> str:
    """Compare sentences by their letters and digits only."""
    return re.sub(r"[^a-z0-9]", "", text.lower())


def prose_of(latex: str) -> str | None:
    """The sentence a "math" line really is, or None when it is math.

    A line is prose when it has words in \\text{...} and, outside them, at most
    a single letter and punctuation: `\\text{Solve for } x.` is a sentence,
    `\\text{area} = 2x` is math.
    """
    words = " ".join(part.strip() for part in _TEXT.findall(latex))
    if len(re.findall(r"[A-Za-z]{2,}", words)) < 2:
        return None
    outside = _NOISE.sub("", _TEXT.sub(" ", latex))
    if len(re.sub(r"[\s.,:;!?()]", "", outside)) > 1:
        return None
    sentence = _NOISE.sub("", _TEXT.sub(lambda m: m.group(1), latex))
    return re.sub(r"\s+", " ", sentence).strip()


def tidy_capture(result: dict[str, Any]) -> dict[str, Any]:
    """Clear invented instructions and move sentence lines out of the math."""
    instructions = str(result.get("instructions", "")).strip()
    if _INVENTED.search(instructions):
        instructions = ""

    kept, sentences = [], []
    for line in result.get("lines", []):
        sentence = prose_of(str(line.get("latex", "")))
        if sentence is None:
            kept.append(line)
        else:
            sentences.append(sentence)

    # A sentence the model put among the math is text it copied from the page.
    # If the instructions already contain it, the heading was given twice and
    # is said once. If they do not, the instructions are the model's rewording
    # of that heading ("Solve the equation for x." for "Solve for x."), so the
    # printed words replace them.
    if sentences and not all(_key(s) in _key(instructions) for s in sentences):
        instructions = " ".join(sentences)

    result["instructions"] = instructions
    result["lines"] = kept
    return result
