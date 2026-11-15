"""Nothing is written down that the student did not say.

The model that turns speech into LaTeX is told to transcribe and nothing else.
Told is not the same as held to. Asked to transcribe "next I divide both sides
by two" with `2x + 3 = 11` as context, it returned the divided equation: it did
the step. Asked "can you read the problem again", it returned the problem line
as though the student had said it. Either one, read back and confirmed, is the
app doing the student's work, which is the one thing it must never do.

So the model's answer is checked against the transcript, with no model
involved: every number and every variable in the LaTeX has to have been spoken,
and so does every sign and relation (minus, equals, less than ...), every Greek
letter or constant (pi, theta, infinity ...), and every word inside a
`\\text{}` wrapper. The text the model writes for the student to hear (the
readback, the clarifying question) is held to the same rule for numbers,
variables and minus signs. The check can only refuse; it never repairs, and a
refused line is simply asked for again.

When in doubt this module refuses. A false refusal costs the student one more
sentence; a leak is the app doing their work.
"""

import re
from typing import NamedTuple

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
_CARDINALS = set(_UNITS) | set(_TENS) | {"hundred", "thousand"}

# A fraction word names its denominator. Said in the singular ("half of x", "a
# third") it also puts the numerator 1 into the line; in the plural ("two
# thirds") the numerator was said separately.
_FRACTIONS = {
    "half": 2, "third": 3, "quarter": 4, "fourth": 4, "fifth": 5, "sixth": 6,
    "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10,
}
_FRACTIONS_PLURAL = {"halves": 2, **{f"{k}s": v for k, v in _FRACTIONS.items() if k != "half"}}
# Ordinals name a number only when they say which power or root: "to the second
# power", "third root". Anywhere else ("hold on a second") they name nothing.
_ORDINALS = {"first": 1, "second": 2}
_POWER_WORDS = {"power", "powers", "root", "roots"}
# Words that put a number into the line without being a number word.
_IMPLIED = {
    "squared": 2, "square": 2, "cubed": 3, "cube": 3, "double": 2, "twice": 2,
    "triple": 3, "inverse": 1, "reciprocal": 1, "percent": 100,
}
# "a hundred", "a thousand", "a half": only before these does "a" mean one.
_QUANTITY = {"hundred", "thousand"} | set(_FRACTIONS) | set(_FRACTIONS_PLURAL)

# How a speech recogniser may write a letter that was said aloud. The ones that
# are also ordinary words ("why", "tea", "sea", "bee") license a variable only
# where a variable is plausible, exactly like "a" and "i" below. Words that are
# far more often something else ("you", "are", "be", "see", "oh") license nothing.
_HEARD_AS = {
    "ex": "x", "zee": "z", "zed": "z", "pee": "p", "queue": "q", "cue": "q", "dee": "d",
    "gee": "g", "jay": "j", "el": "l", "ess": "s", "vee": "v", "eff": "f", "aitch": "h",
    "kay": "k", "em": "m", "en": "n", "tee": "t",
}
_HEARD_AS_AMBIGUOUS = {"why": "y", "tea": "t", "sea": "c", "bee": "b"}

# Words after which "a" or "i" is read as a variable rather than an article or
# the pronoun. Rule: "a" and "i" name a variable only when nothing, a single
# character, a digit, or one of these words follows. "hold on a second", "a
# fraction", "I think", "I divide" are then ordinary English and license
# nothing; "a plus b", "i squared", "x plus a" license the variable. A number
# word counts as following, so "a two" is never taken for an article.
_OPERATOR_WORDS = {
    "plus", "minus", "times", "over", "equals", "equal", "is", "are", "and", "or", "from",
    "by", "squared", "cubed", "to", "divided", "multiplied", "negative", "less", "greater",
    "subtract", "add", "then", "power", "all", "end", "point", "dot", "than",
} | set(_UNITS) | set(_TENS) | {"hundred", "thousand"}

_MINUS_WORDS = {
    "minus", "negative", "subtract", "subtracted", "subtract", "subtraction", "take",
    "takeaway", "less", "neg", "dash", "decrease", "decreased",
}
_EQUAL_WORDS = {
    "equals", "equal", "equalled", "equaling", "is", "are", "was", "makes", "make", "gives",
    "give", "same", "equation", "isequal",
}
_LESS_GREATER_WORDS = {
    "less", "smaller", "fewer", "below", "under", "greater", "more", "larger", "bigger",
    "above", "exceeds", "exceed", "least", "most", "lt", "gt",
}
_NOT_EQUAL_WORDS = {"not", "unequal", "differs", "different", "doesnt", "isnt", "arent"}
_IMPLICATION_WORDS = {"therefore", "implies", "imply", "so", "thus", "hence", "then", "because"}

# Greek letters and constants: licensed only when the student said the name.
_NAMED_COMMANDS: dict[str, set[str]] = {
    "alpha": {"alpha"}, "beta": {"beta"}, "gamma": {"gamma"}, "delta": {"delta"},
    "epsilon": {"epsilon"}, "varepsilon": {"epsilon"}, "zeta": {"zeta"}, "eta": {"eta"},
    "theta": {"theta"}, "vartheta": {"theta"}, "iota": {"iota"}, "kappa": {"kappa"},
    "lambda": {"lambda"}, "mu": {"mu", "mew"}, "nu": {"nu", "new"}, "xi": {"xi", "ksi"},
    "pi": {"pi", "pie"}, "varpi": {"pi", "pie"}, "rho": {"rho", "row"}, "varrho": {"rho"},
    "sigma": {"sigma"}, "varsigma": {"sigma"}, "tau": {"tau"}, "upsilon": {"upsilon"},
    "phi": {"phi", "fi"}, "varphi": {"phi", "fi"}, "chi": {"chi", "kai"}, "psi": {"psi"},
    "omega": {"omega"},
    "infty": {"infinity", "infinite"}, "partial": {"partial"}, "nabla": {"nabla", "del"},
    "emptyset": {"empty", "emptyset", "null"}, "varnothing": {"empty", "emptyset", "null"},
}
_IMPLICATION_COMMANDS = {
    "therefore", "because", "implies", "impliedby", "iff", "rightarrow", "leftarrow",
    "leftrightarrow", "longrightarrow", "longleftarrow", "longleftrightarrow",
    "mapsto", "rightarrow",
}
# Function names are structure, whether typed `\sin` or `\operatorname{sin}`.
_FUNCTION_NAMES = {
    "sin", "cos", "tan", "sec", "csc", "cot", "sinh", "cosh", "tanh", "arcsin", "arccos",
    "arctan", "log", "ln", "exp", "lim", "min", "max", "det", "gcd", "lcm", "mod",
}

_TOKEN = re.compile(r"[a-z]+|\d+(?:\.\d+)?")
_LATEX_TEXT = re.compile(r"\\(?:text|textbf|textit|mbox|mathrm|operatorname)\s*\{([^{}]*)\}")
_LATEX_COMMAND = re.compile(r"(?<!\\)\\([a-zA-Z]+)")
_NUMBER = re.compile(r"\d+(?:\.\d+)?")
_DIGIT_GROUPING = re.compile(r"(?<=\d)(?:\{,\}|\\,|,)(?=\d{3}(?!\d))")
_CONTRACTION = re.compile(r"(?<=[a-z])['\u2019](?=[a-z])")
_INEQUALITY_COMMANDS = {"le", "leq", "ge", "geq", "lt", "gt", "leqslant", "geqslant", "ll", "gg"}
_NOT_EQUAL_COMMANDS = {"ne", "neq"}


class _Said(NamedTuple):
    numbers: set[str]
    letters: set[str]
    words: set[str]
    point: bool  # "point"/"dot" was said, so a decimal may open with an unsaid 0
    raw: str


def _tokens(text: str) -> list[str]:
    text = _CONTRACTION.sub("", text.lower())
    text = _DIGIT_GROUPING.sub("", text)
    return _TOKEN.findall(text)


def _is_variable_use(tokens: list[str], i: int) -> bool:
    """Whether the single letter or letter-name at tokens[i] plausibly names a variable."""
    following = tokens[i + 1] if i + 1 < len(tokens) else None
    if following is None:
        return True
    if tokens[i] in ("a", "an") and following in _QUANTITY:
        return False
    if len(following) < 2 or not following.isalpha():
        return True
    return following in _OPERATOR_WORDS


def _number_groups(tokens: list[str]) -> list[tuple[list[int], int]]:
    """Each spoken cardinal as (the values said on the way, the whole number)."""
    groups: list[tuple[list[int], int]] = []
    seen: list[int] = []
    total = current = 0
    active = False

    def close() -> None:
        nonlocal seen, total, current, active
        if active:
            groups.append((seen, total + current))
        seen, total, current, active = [], 0, 0, False

    for i, token in enumerate(tokens):
        following = tokens[i + 1] if i + 1 < len(tokens) else ""
        if token in ("a", "an") and following in ("hundred", "thousand"):
            close()
            current, active = 1, True
        elif token in _UNITS or token in _TENS:
            value = _UNITS.get(token, _TENS.get(token, 0))
            low = current % 100
            # "one two" is two numbers, not three; "twenty one" is one.
            if active and not (low == 0 or (value < 10 and low >= 20 and low % 10 == 0)):
                close()
            current += value
            active = True
            seen += [value, total + current]
        elif token == "hundred" and active:
            current = max(current, 1) * 100
            seen.append(total + current)
        elif token == "thousand" and active:
            total += max(current, 1) * 1000
            current = 0
            seen.append(total)
        elif token == "and" and active:
            pass
        else:
            close()
    close()
    return groups


def _digit_runs(tokens: list[str]) -> set[str]:
    """Numbers said digit by digit: "eight four" -> 84, "oh five" -> 05."""
    found: set[str] = set()
    run: list[str] = []

    def flush() -> None:
        for start in range(len(run)):
            for end in range(start + 1, len(run) + 1):
                found.add("".join(run[start:end]))
        run.clear()

    for token in tokens:
        if token.isdigit():
            run.append(token)
        elif token in _UNITS and _UNITS[token] < 10:
            run.append(str(_UNITS[token]))
        else:
            flush()
    flush()
    return found


def _power_position(tokens: list[str], i: int) -> bool:
    following = tokens[i + 1] if i + 1 < len(tokens) else ""
    return following in _POWER_WORDS or tokens[max(0, i - 2):i] == ["to", "the"]


def _spoken(text: str) -> _Said:
    """The numbers and the letters a transcript licenses."""
    tokens = _tokens(text)
    numbers: set[str] = set()
    letters: set[str] = set()

    for token in tokens:
        if token[0].isdigit():
            numbers.add(token)
            numbers.update(part for part in token.split(".") if part)
    for seen, whole in _number_groups(tokens):
        numbers.update(str(value) for value in seen)
        numbers.add(str(whole))
    numbers |= _digit_runs(tokens)

    skip = -1
    for i, token in enumerate(tokens):
        following = tokens[i + 1] if i + 1 < len(tokens) else ""
        if i == skip:
            continue
        if token == "double" and following in ("u", "you"):
            letters.add("w")  # "double u" is the letter w, not "two" and "u"
            skip = i + 1
            continue
        if token in _IMPLIED:
            numbers.add(str(_IMPLIED[token]))
        if token in _FRACTIONS:
            numbers.add(str(_FRACTIONS[token]))
            if not _power_position(tokens, i):
                numbers.add("1")
        elif token in _FRACTIONS_PLURAL:
            numbers.add(str(_FRACTIONS_PLURAL[token]))
        elif token in _ORDINALS and _power_position(tokens, i):
            numbers.add(str(_ORDINALS[token]))
        elif token in ("a", "i") and _is_variable_use(tokens, i):
            letters.add(token)
        elif len(token) == 1 and token not in ("a", "i"):
            letters.add(token)  # a single letter said alone names a variable
        elif token in _HEARD_AS:
            letters.add(_HEARD_AS[token])
        elif token in _HEARD_AS_AMBIGUOUS and _is_variable_use(tokens, i):
            letters.add(_HEARD_AS_AMBIGUOUS[token])
    return _Said(
        numbers, letters, {t for t in tokens if t.isalpha()},
        "point" in tokens or "dot" in tokens, text.lower(),
    )


class _Written(NamedTuple):
    numbers: set[str]
    letters: set[str]
    words: set[str]  # words inside \text{} and friends
    commands: set[str]
    minus: bool
    equals: bool
    order: bool  # an inequality
    not_equal: bool


def _written(latex: str) -> _Written:
    """What a line of LaTeX contains, with nothing blanked out."""
    latex = _DIGIT_GROUPING.sub("", latex)
    words: set[str] = set()

    def unwrap(match: re.Match) -> str:
        content = match.group(1)
        words.update(w.lower() for w in re.findall(r"[A-Za-z]+", content))
        # Hyphens and the like are punctuation inside text; digits still count.
        return " " + " ".join(_NUMBER.findall(content)) + " "

    unwrapped = _LATEX_TEXT.sub(unwrap, latex)
    commands = set(_LATEX_COMMAND.findall(unwrapped))
    bare = _LATEX_COMMAND.sub(" ", unwrapped)
    letters = set(re.findall(r"[a-z]", bare.lower()))
    lowered = {c.lower() for c in commands}
    return _Written(
        set(_NUMBER.findall(bare)), letters, words, lowered,
        any(c in bare for c in "-\u2212\u2013"),
        "=" in bare,
        any(c in bare for c in "<>") or bool(lowered & _INEQUALITY_COMMANDS),
        bool(lowered & _NOT_EQUAL_COMMANDS),
    )


def _number_was_said(number: str, said: _Said) -> bool:
    if number in said.numbers:
        return True
    whole, _, fraction = number.partition(".")
    if not fraction:
        return False
    # "point five" writes 0.5: the 0 is the writer's, not an invented number.
    whole_said = whole in said.numbers or (whole == "0" and said.point)
    return whole_said and fraction in said.numbers


def adds_to_what_was_said(latex: str, transcript: str) -> bool:
    """True when the LaTeX holds anything the student never spoke."""
    said = _spoken(transcript)
    written = _written(latex)
    if any(not _number_was_said(n, said) for n in written.numbers):
        return True
    if written.letters - said.letters:
        return True
    # Words inside \text{} are held to the transcript like everything else.
    for word in written.words:
        if len(word) == 1:
            if word not in said.letters:
                return True
        elif word not in _FUNCTION_NAMES and word not in said.words:
            return True
    # \pi, \theta, \infty ...: only when the student said the name.
    for command in written.commands:
        names = _NAMED_COMMANDS.get(command)
        if names is not None and not names & said.words:
            return True
        if command in _IMPLICATION_COMMANDS and not _IMPLICATION_WORDS & said.words:
            return True
    if written.minus and not (_MINUS_WORDS & said.words or any(c in said.raw for c in "-\u2212")):
        return True
    if written.equals and not (_EQUAL_WORDS & said.words or "=" in said.raw):
        return True
    if written.order and not (
        _LESS_GREATER_WORDS & said.words or any(c in said.raw for c in "<>\u2264\u2265")
    ):
        return True
    if written.not_equal and not (_NOT_EQUAL_WORDS & said.words or "\u2260" in said.raw):
        return True
    return False


# Idioms in a question or readback that are not numbers: "which one", "one of
# these", "two ways to read it".
_NOT_A_NUMBER_BEFORE = {
    "of", "or", "ways", "options", "readings", "interpretations", "choices",
    "possibilities", "versions", "groupings", "alternatives", "meanings",
}
_NOT_A_NUMBER_AFTER = {"which", "the", "that", "this", "each", "either", "no", "any", "every"}


def text_adds_to_what_was_said(text: str | None, transcript: str) -> bool:
    """True when text the model wrote for the student holds anything not spoken.

    Held to the same rule as the LaTeX for numbers (digits or number words),
    single-letter variable names and minus signs. Other words are free.
    """
    if not text:
        return False
    said = _spoken(transcript)
    tokens = _tokens(text)

    cardinals = list(tokens)
    for i, token in enumerate(tokens):
        if token in ("one", "two") and (
            (i + 1 < len(tokens) and tokens[i + 1] in _NOT_A_NUMBER_BEFORE)
            or (i > 0 and tokens[i - 1] in _NOT_A_NUMBER_AFTER)
        ):
            cardinals[i] = "_"  # breaks any number group around it
    if any(not _number_was_said(t, said) for t in cardinals if t[0].isdigit()):
        return True
    if any(not _number_was_said(str(whole), said) for _, whole in _number_groups(cardinals)):
        return True
    if any(t in ("half", "halves") for t in tokens) and "2" not in said.numbers:
        return True

    for i, token in enumerate(tokens):
        if token in ("a", "i"):
            if _is_variable_use(tokens, i) and token not in said.letters:
                return True
        elif len(token) == 1 and token.isalpha() and token not in said.letters:
            return True
    minus_said = bool(_MINUS_WORDS & said.words) or any(c in said.raw for c in "-\u2212")
    if not minus_said and {"minus", "negative", "subtract", "subtracted"} & set(tokens):
        return True
    return False
