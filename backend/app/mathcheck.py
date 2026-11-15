"""Deterministic math checks (DESIGN.md 11).

The pure functions here run inside the worker pool from `timeouts.py`; the
`async` wrappers are what routes call. Nothing here ever describes a line or a
step as wrong: a line either parses or it is "unsure", and a step is either
verified or "couldn't confirm".
"""

import re

from .timeouts import CasTimeout, run_cas

__all__ = ["parse", "is_parseable", "validate_latex", "require_parse", "steps_equivalent", "check_step"]


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


# --- step equivalence (issue #20) ---------------------------------------------

def _is_settled_set(s) -> bool:
    """A solution set we can compare: not a ConditionSet SymPy gave up on."""
    from sympy.sets.conditionset import ConditionSet

    return not s.atoms(ConditionSet) and not isinstance(s, ConditionSet)


def _same_real_solutions(da, db) -> bool:
    from sympy import S, solveset

    syms = da.free_symbols | db.free_symbols
    if len(syms) != 1:
        return False  # multi-variable: documented limitation
    x = next(iter(syms))
    sa, sb = solveset(da, x, S.Reals), solveset(db, x, S.Reals)
    return _is_settled_set(sa) and _is_settled_set(sb) and sa == sb


def steps_equivalent(a_latex: str, b_latex: str) -> tuple[bool, str]:
    """Is line B a valid rewrite of line A?

    Returns (verified, method). `method` is one of: expr_equal, ratio_constant,
    same_solutions, unparseable, mixed, inequality, degenerate, not_verified.
    Anything but verified=True is reported as "I couldn't confirm this step."
    """
    from sympy import Eq, simplify
    from sympy.core.relational import Relational
    from sympy.logic.boolalg import BooleanAtom

    try:
        a, b = parse(a_latex), parse(b_latex)
    except Unparseable:
        return (False, "unparseable")
    if isinstance(a, BooleanAtom) or isinstance(b, BooleanAtom):
        return (False, "degenerate")  # SymPy already evaluated e.g. "0 = 0" to True

    a_rel, b_rel = isinstance(a, Relational), isinstance(b, Relational)
    if (a_rel and not isinstance(a, Eq)) or (b_rel and not isinstance(b, Eq)):
        return (False, "inequality")  # documented limitation
    if a_rel != b_rel:
        return (False, "mixed")

    if not a_rel:
        same = simplify(a - b) == 0
        return (bool(same), "expr_equal" if same else "not_verified")

    da, db = simplify(a.lhs - a.rhs), simplify(b.lhs - b.rhs)
    if da == 0 or db == 0:
        return (False, "degenerate")
    ratio = simplify(da / db)
    if not ratio.free_symbols and ratio != 0 and ratio.is_finite:
        return (True, "ratio_constant")
    if _same_real_solutions(da, db):
        return (True, "same_solutions")
    return (False, "not_verified")


async def check_step(a_latex: str, b_latex: str) -> tuple[bool, str]:
    """steps_equivalent under the CAS timeout. Raises CasTimeout past the budget."""
    return await run_cas(steps_equivalent, a_latex, b_latex)
