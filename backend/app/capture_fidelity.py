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

_TEXT = re.compile(r"\\(?:text|textrm|mathrm|textit|mbox|operatorname)\s*\{([^{}]*)\}")
# Spacing commands and math-mode wrappers that carry no content of their own.
_NOISE = re.compile(r"\\[,;:! ]|\\quad|\\qquad|\$")

# Clear directions for processing the image itself. Worksheet tasks can
# still refer to a graph or shape in the image.
_INVENTED = re.compile(
    r"\btranscrib\w*\b"
    r"|^(?:please\s+)?(?:read|copy|convert)\s+"
    r"(?:the\s+(?:text|equations?|instructions?)\s+(?:from|in)\s+)?"
    r"(?:the|this)\s+(?:(?:uploaded|attached|given|provided)\s+)?"
    r"(?:image|picture|photo|screenshot)"
    r"(?:\s+(?:as|in|into|to)\s+(?:LaTeX|(?:plain\s+)?text)(?:\s+format)?)?[.!]?$",
    re.IGNORECASE,
)


def _key(text: str) -> str:
    """Compare sentences by their letters and digits only."""
    return re.sub(r"[^a-z0-9]", "", text.lower())


def prose_of(latex: str) -> str | None:
    """The sentence a "math" line really is, or None when it is math.

    A line is prose when it is only words in \\text{...} (a title such as
    `\\text{Algebra practice 1}`), or words plus at most a single letter and
    punctuation (`\\text{Solve for } x.`). `\\text{area} = 2x` is math.
    """
    words = " ".join(part.strip() for part in _TEXT.findall(latex))
    if not re.search(r"[A-Za-z]", words):
        return None
    outside = re.sub(r"[\s.,:;!?()]", "", _NOISE.sub("", _TEXT.sub(" ", latex)))
    if outside and (len(outside) > 1 or len(re.findall(r"[A-Za-z]{2,}", words)) < 2):
        return None
    sentence = _NOISE.sub("", _TEXT.sub(lambda m: m.group(1), latex))
    return re.sub(r"\s+", " ", sentence).strip()


def _words(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))


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
    if not instructions:
        # No printed instructions were reported (or only invented ones), so the
        # printed sentences, in reading order, are the instructions.
        instructions = " ".join(sentences)
        sentences = []
    for sentence in sentences:
        if _key(sentence) in _key(instructions):
            # The heading was given in both places; it is said once.
            continue
        elif _words(sentence) <= _words(instructions):
            # The instructions reword this heading ("Solve the equation for x."
            # for "Solve for x."); the printed words replace them.
            instructions = sentence
        # Otherwise it is a title beside real instructions ("Algebra practice 1"
        # beside "Solve each equation."): the instructions stay, the title goes.

    result["instructions"] = instructions
    result["lines"] = kept
    return result
