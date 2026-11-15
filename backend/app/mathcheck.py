"""Deterministic math checks (DESIGN.md 11).

The pure functions here run inside the worker pool from `timeouts.py`; the
`async` wrappers are what routes call. Nothing here ever describes a line or a
step as wrong: a line either parses or it is "unsure", and a step is either
verified or "couldn't confirm".
"""

import re

from .timeouts import CasTimeout, run_cas


class Unparseable(ValueError):
    """SymPy could not read this LaTeX."""


# Display-only LaTeX that changes nothing mathematically but trips the strict parser.
_NORMALISE = [
    (re.compile(r"\\(?:d|t)frac\b"), r"\\frac"),
    (re.compile(r"\\(?:displaystyle|textstyle|scriptstyle)\b"), " "),
    (re.compile(r"\\(?:left|right|bigl|bigr|Bigl|Bigr|big|Big)\s*(?=[()\[\]|.]|\\[{}])"), ""),
    (re.compile(r"\\left\.|\\right\."), ""),
    (re.compile(r"\\[,;:!]|\\q?quad\b|~"), " "),
    (re.compile(r"\\(?:mathrm|text)\{([^{}]*)\}"), r"\1"),
]


def normalise(latex: str) -> str:
    out = latex.strip().rstrip(".,;")
    for pattern, repl in _NORMALISE:
        out = pattern.sub(repl, out)
    return out.strip()


def parse(latex: str):
    """LaTeX → SymPy object, or raise Unparseable.

    Uses the strict parser so that truncated input such as `x +` is rejected
    instead of silently dropping the dangling operator.
    """
    from sympy.core.relational import Relational
    from sympy.parsing.latex import parse_latex

    text = normalise(latex or "")
    if not text:
        raise Unparseable("empty")
    try:
        expr = parse_latex(text, strict=True)
    except Exception as exc:  # the parser raises several unrelated types
        raise Unparseable(str(exc)) from None
    if isinstance(expr, Relational) and any(isinstance(a, Relational) for a in expr.args):
        raise Unparseable("chained relation")  # e.g. x = y = z
    return expr


def is_parseable(latex: str) -> bool:
    try:
        parse(latex)
    except Unparseable:
        return False
    return True


async def validate_latex(latex: str) -> bool:
    """`valid` flag for a captured or spoken line.

    False means "unsure": the line is still shown and rendered by MathJax, it is
    announced as unsure, and step checks are skipped for it. A timeout counts as
    unsure rather than failing the whole capture.
    """
    try:
        return await run_cas(is_parseable, latex)
    except CasTimeout:
        return False


async def require_parse(latex: str) -> None:
    """Raise the §9 UNPARSEABLE or TIMEOUT error if `latex` can't be read."""
    from .errors import ApiError

    if not await run_cas(is_parseable, latex):
        raise ApiError("UNPARSEABLE", "I couldn't read that line as math.", 422)
