"""Nothing is written down that the student did not say.

The model that turns speech into LaTeX is told to transcribe and nothing else.
Told is not the same as held to. Asked to transcribe "next I divide both sides
by two" with `2x + 3 = 11` as context, it returned the divided equation: it did
the step. Asked "can you read the problem again", it returned the problem line
as though the student had said it. Either one, read back and confirmed, is the
app doing the student's work, which is the one thing it must never do.

So the model's answer is checked against the transcript, with no model
involved: every number, variable, operator and relation must have been spoken.
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

# Longest phrases first: "less than or equal to" is one relation, not two.
# Operators are compared in spoken order, not just as a bag of symbols: moving
# a minus across an equals sign would otherwise pass the same count check.
_OP_WORDS = [
    (r"less than or equal(?: to)?|at most", "<="),
    (r"greater than or equal(?: to)?|at least", ">="),
    (r"does not equal|not equal(?: to)?|is not equal to", "!="),
    (r"plus or minus", "±"),
    (r"minus or plus", "∓"),
    (r"square root(?: of)?", "root:2"),
    (r"cube root(?: of)?", "root:3"),
    (r"fourth root(?: of)?", "root:4"),
    (r"fifth root(?: of)?", "root:5"),
    (r"sixth root(?: of)?", "root:6"),
    (r"to the power(?: of)?|to the (?=(?:second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b)|squared|cubed", "^"),
    (r"divided by|all over|over|halves|half|thirds|quarters|quarter|fourths|fifths|sixths|sevenths|eighths|ninths|tenths", "/"),
    (r"multiplied by|times", "*"),
    (r"less than", "<"),
    (r"greater than", ">"),
    (r"is equal to|equal to|equals|equal|is", "="),
    (r"plus|positive", "+"),
    (r"minus|negative", "-"),
    (r"percent", "%"),
]
_SPOKEN_OP = re.compile(
    "|".join(f"(?P<op{i}>\\b(?:{words})\\b)" for i, (words, _) in enumerate(_OP_WORDS))
    + r"|(?P<symbol><=|>=|!=|[+−\-×*÷/=<>^±∓≤≥≠%])",
    re.IGNORECASE,
)
_SYMBOLS = {"−": "-", "×": "*", "÷": "/", "≤": "<=", "≥": ">=", "≠": "!="}
_COMMAND_OPS = {
    r"\times": "*", r"\cdot": "*", r"\div": "/", r"\over": "/",
    r"\le": "<=", r"\leq": "<=", r"\ge": ">=", r"\geq": ">=",
    r"\ne": "!=", r"\neq": "!=", r"\lt": "<", r"\gt": ">",
    r"\pm": "±", r"\mp": "∓", r"\%": "%",
}
# Formatting and named atoms cannot hide an operator. Anything else is refused
# rather than stripped, including text/macros that could conceal a changed sign.
_ATOM_COMMANDS = set(r"sin cos tan sec csc cot arcsin arccos arctan log ln exp theta alpha beta gamma delta pi phi omega infinity infty".split())
_FORMAT_COMMANDS = {r"\left", r"\right", r"\,", r"\;", r"\!", r"\:", r"\ ", r"\quad", r"\qquad"}


def _spoken_operators(text: str) -> list[str]:
    result = []
    for match in _SPOKEN_OP.finditer(text):
        if match.lastgroup == "symbol":
            value = match.group()
            result.append(_SYMBOLS.get(value, value))
        else:
            result.append(_OP_WORDS[int(match.lastgroup[2:])][1])
    return result


def _written_operators(latex: str) -> list[str] | None:
    """Read operators without evaluating, simplifying or repairing the math.

    Fractions are walked numerator / denominator so their prefix TeX command
    has the same order as spoken math. Both ambiguous fraction groupings can
    still be offered for confirmation. Unknown syntax fails closed.
    """
    tokens = re.findall(r"\\[a-zA-Z]+|\\.|<=|>=|!=|[^\s]", latex)
    index = 0

    def walk(end: str | None = None, depth: int = 0) -> list[str]:
        nonlocal index
        if depth > 32:
            raise ValueError("Too deeply nested")
        result = []

        def group() -> list[str]:
            nonlocal index
            if index >= len(tokens) or tokens[index] != "{":
                raise ValueError("Expected a TeX group")
            index += 1
            return walk("}", depth + 1)

        while index < len(tokens):
            token = tokens[index]
            index += 1
            if token == end:
                return result
            if token == "}":
                raise ValueError("Unexpected group end")
            if token == "{":
                result.extend(walk("}", depth + 1))
            elif token in (r"\frac", r"\dfrac", r"\tfrac"):
                numerator = group()
                denominator = group()
                result.extend([*numerator, "/", *denominator])
            elif token == r"\sqrt":
                root = "2"
                if index < len(tokens) and tokens[index] == "[":
                    index += 1
                    start = index
                    while index < len(tokens) and tokens[index].isdigit():
                        index += 1
                    root = "".join(tokens[start:index])
                    if not root or index >= len(tokens) or tokens[index] != "]":
                        raise ValueError("Unsupported root index")
                    index += 1
                result.extend([f"root:{root}", *group()])
            elif token in _COMMAND_OPS:
                result.append(_COMMAND_OPS[token])
            elif token in _FORMAT_COMMANDS or token.removeprefix("\\") in _ATOM_COMMANDS:
                continue
            elif token.startswith("\\"):
                raise ValueError("Unsupported command")
            elif token in ("<=", ">=", "!=") or token in "+-−*×/÷=<>^±∓≤≥≠%":
                result.append(_SYMBOLS.get(token, token))
            elif not (token.isalnum() or token in ".()[],"):
                raise ValueError("Unsupported notation")
        if end:
            raise ValueError("Unclosed group")
        return result

    try:
        return walk()
    except ValueError:
        return None


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
        if len(token) == 1:
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
    """Refuse unspoken atoms or changed operators; never judge correctness."""
    # A full restatement after a correction replaces the earlier version.
    # An incomplete restatement is refused rather than filled in from context.
    transcript = re.split(r"\b(?:sorry|no wait|i mean|correction)\b", transcript,
                          flags=re.IGNORECASE)[-1]
    said_numbers, said_letters = _spoken(transcript)
    numbers, letters = _written(latex)
    if any(not _number_was_said(n, said_numbers) for n in numbers):
        return True
    if letters - said_letters:
        return True
    operators = _written_operators(latex)
    return operators is None or operators != _spoken_operators(transcript)
