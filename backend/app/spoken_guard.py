"""Nothing is written down that the student did not say.

The model that turns speech into LaTeX is told to transcribe and nothing else.
Told is not the same as held to. Asked to transcribe "next I divide both sides
by two" with `2x + 3 = 11` as context, it returned the divided equation: it did
the step. Asked "can you read the problem again", it returned the problem line
as though the student had said it. Either one, read back and confirmed, is the
app doing the student's work, which is the one thing it must never do.

So the model's answer is checked against the transcript, with no model
involved: every number and every variable in the LaTeX has to have been spoken.
A line that brings in a number or a letter from somewhere else is refused. The
check can only refuse; it never repairs, and a refused line is simply asked for
again.
"""

import re

_UNITS = {
    "zero": 0, "oh": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
    "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17,
    "eighteen": 18, "nineteen": 19,
}
_TENS = {
    "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70,
    "eighty": 80, "ninety": 90,
}
# Words that put a number into the line without being a number word.
_IMPLIED = {
    "a": 1, "an": 1, "half": 2, "halves": 2, "third": 3, "thirds": 3, "quarter": 4,
    "quarters": 4, "fourth": 4, "fourths": 4, "fifth": 5, "fifths": 5, "sixth": 6,
    "sixths": 6, "seventh": 7, "sevenths": 7, "eighth": 8, "eighths": 8, "ninth": 9,
    "ninths": 9, "tenth": 10, "tenths": 10, "first": 1, "second": 2, "squared": 2,
    "square": 2, "cubed": 3, "cube": 3, "double": 2, "twice": 2, "triple": 3,
    "inverse": 1, "reciprocal": 1, "percent": 100,
}
# How a speech recogniser may write a letter that was said aloud.
_HEARD_AS = {
    "ex": "x", "why": "y", "zee": "z", "zed": "z", "see": "c", "sea": "c", "bee": "b",
    "be": "b", "are": "r", "you": "u", "tea": "t", "tee": "t", "eye": "i", "en": "n",
    "em": "m", "kay": "k", "pee": "p", "queue": "q", "cue": "q", "dee": "d", "gee": "g",
    "jay": "j", "el": "l", "oh": "o", "ess": "s", "vee": "v", "eff": "f", "aitch": "h",
}

_TOKEN = re.compile(r"[a-z]+|\d+(?:\.\d+)?")
_LATEX_TEXT = re.compile(r"\\(?:text|mathrm|operatorname)\s*\{[^{}]*\}")
_LATEX_COMMAND = re.compile(r"\\[a-zA-Z]+")
_NUMBER = re.compile(r"\d+(?:\.\d+)?")


def _spoken(text: str) -> tuple[set[str], set[str]]:
    """The numbers and the letters a transcript licenses."""
    numbers: set[str] = set()
    letters: set[str] = set()
    total = current = 0
    counting = False

    def close() -> None:
        nonlocal total, current, counting
        if counting:
            numbers.add(str(total + current))
        total = current = 0
        counting = False

    for token in _TOKEN.findall(text.lower()):
        if token[0].isdigit():
            close()
            numbers.add(token)
            numbers.update(part for part in token.split(".") if part)
            numbers.update(token.replace(".", ""))  # digits said one at a time
            continue

        if token in _UNITS or token in _TENS:
            value = _UNITS.get(token, _TENS.get(token, 0))
            numbers.add(str(value))
            current += value
            counting = True
            numbers.add(str(total + current))
        elif token == "hundred" and counting:
            current = max(current, 1) * 100
            numbers.add(str(total + current))
        elif token == "thousand" and counting:
            total += max(current, 1) * 1000
            current = 0
            numbers.add(str(total))
        elif token == "and" and counting:
            pass
        else:
            close()

        if token in _IMPLIED:
            numbers.add(str(_IMPLIED[token]))
        if token in _HEARD_AS:
            letters.add(_HEARD_AS[token])
        # A letter said alone, or two said together ("x y"), names variables.
        if len(token) <= 2:
            letters.update(token)
    close()
    return numbers, letters


def _written(latex: str) -> tuple[set[str], set[str]]:
    """The numbers and the single-letter variables a line of LaTeX contains."""
    bare = _LATEX_COMMAND.sub(" ", _LATEX_TEXT.sub(" ", latex))
    numbers = set(_NUMBER.findall(bare))
    letters = set(re.findall(r"[a-z]", bare.lower()))
    return numbers, letters


def _number_was_said(number: str, said: set[str]) -> bool:
    if number in said:
        return True
    whole, _, fraction = number.partition(".")
    # "three point one four": the parts, or the digits one at a time.
    return (whole in said or all(d in said for d in whole)) and (
        not fraction or fraction in said or all(d in said for d in fraction)
    )


def adds_to_what_was_said(latex: str, transcript: str) -> bool:
    """True when the LaTeX holds a number or variable the student never spoke."""
    said_numbers, said_letters = _spoken(transcript)
    numbers, letters = _written(latex)
    if any(not _number_was_said(n, said_numbers) for n in numbers):
        return True
    return bool(letters - said_letters)
