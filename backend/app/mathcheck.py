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


# Unicode the vision and speech models sometimes return instead of LaTeX.
_UNICODE = {
    "²": "^{2}", "³": "^{3}", "−": "-", "–": "-", "×": r"\times ", "÷": r"\div ",
    "≤": r"\le ", "≥": r"\ge ", "≠": r"\ne ", "±": r"\pm ", "·": r"\cdot ",
}
_MIXED = re.compile(r"(?<![\w.^_}])(\d+)\s*\\frac\{\s*(\d+)\s*\}\{\s*(\d+)\s*\}")
_PERCENT = re.compile(r"(\d+(?:\.\d+)?)\s*\\%")


def normalise(latex: str) -> str:
    out = latex.strip().rstrip(".,;")
    for char, repl in _UNICODE.items():
        out = out.replace(char, repl)
    out = _PERCENT.sub(r"\\frac{\1}{100}", out)
    for pattern, repl in _NORMALISE:
        out = pattern.sub(repl, out)
    # A whole number written straight before a fraction of whole numbers is a
    # mixed number: 3\frac{1}{2} is three and a half, not 3 x 1/2. Read the
    # other way, "2x = 3 -> x = 3 1/2" would wrongly check out.
    out = _MIXED.sub(r"(\1+\\frac{\2}{\3})", out)
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
    return _letters_times_brackets(expr)


# Letters students use as function names. Any other single letter written
# before brackets is multiplication: x(x + 1) means x times (x + 1).
_FUNCTION_LETTERS = {"f", "g", "h"}


def _letters_times_brackets(expr):
    from sympy import Mul, Symbol
    from sympy.core.function import AppliedUndef

    def is_misread(e) -> bool:
        name = e.func.__name__
        return isinstance(e, AppliedUndef) and len(name) == 1 and name not in _FUNCTION_LETTERS

    return expr.replace(is_misread, lambda e: Symbol(e.func.__name__) * Mul(*e.args))


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


# --- statements as solution sets (inequalities, ±, "or", chains) --------------
#
# A step like "x + 1 < 3 → x < 2", or a final answer like "x = ±3" or
# "-2 ≤ x ≤ 2", can't be checked by comparing shapes; it is checked by
# comparing the set of real numbers each line allows. One variable only.

_REL_TOKEN = re.compile(r"\\(?:leq|geq|le|ge|neq|ne|lt|gt)(?![a-zA-Z])|<|>|=")
_OR_TOKEN = re.compile(r"\bor\b|\\(?:lor|vee)(?![a-zA-Z])")
_SET_TRIGGER = re.compile(r"\\(?:leq|geq|le|ge|neq|ne|lt|gt|pm)(?![a-zA-Z])|<|>|\bor\b|\\(?:lor|vee)(?![a-zA-Z])")


def _split_top(text: str, pattern: re.Pattern) -> tuple[list[str], list[str]]:
    """Split on `pattern` only outside braces, brackets and parentheses."""
    parts, ops, depth, start = [], [], 0, 0
    depth_at = []
    for ch in text:
        depth_at.append(depth)
        depth += ch in "{[(" 
        depth -= ch in "}])"
    for m in pattern.finditer(text):
        if depth_at[m.start()] == 0:
            parts.append(text[start:m.start()].strip())
            ops.append(m.group(0))
            start = m.end()
    parts.append(text[start:].strip())
    return parts, ops


def _alternatives(text: str) -> list[str] | None:
    """"x = 3 or x = -3" and "x = \\pm 3" → one string per alternative."""
    alts: list[str] = []
    for alt in _split_top(text, _OR_TOKEN)[0]:
        n = alt.count(r"\pm")
        if n > 1:
            return None  # several ± signs: which pairing is meant is ambiguous
        alts.extend([alt.replace(r"\pm", "+"), alt.replace(r"\pm", "-")] if n else [alt])
    return alts if all(alts) else None


def _solution_set(latex: str):
    """(set of real solutions, its one symbol), or None if it isn't a
    one-variable statement SymPy can settle."""
    from sympy import Eq, S, Union, solveset
    from sympy.core.relational import Relational

    alts = _alternatives(normalise(latex))
    if not alts:
        return None
    rels = []
    for alt in alts:
        parts, ops = _split_top(alt, _REL_TOKEN)
        if not ops or not all(parts):
            return None  # an expression, not a statement
        try:
            chain = [parse(f"{parts[i]} {op} {parts[i + 1]}") for i, op in enumerate(ops)]
        except Unparseable:
            return None
        if not all(isinstance(r, Relational) for r in chain):
            return None  # e.g. "0 = 0" already evaluated to True
        rels.append(chain)
    symbols = set().union(*(r.free_symbols for chain in rels for r in chain))
    if len(symbols) != 1:
        return None
    x = next(iter(symbols))
    total = S.EmptySet
    for chain in rels:
        part = S.Reals
        for r in chain:
            sol = solveset(r.lhs - r.rhs, x, S.Reals) if isinstance(r, Eq) else solveset(r, x, S.Reals)
            if not _is_settled_set(sol):
                return None
            part = part.intersect(sol)
        total = Union(total, part)
    return total, x


def _needs_sets(latex: str) -> bool:
    return bool(_SET_TRIGGER.search(normalise(latex))) or len(_split_top(normalise(latex), _REL_TOKEN)[1]) > 1


def _by_solution_sets(a_latex: str, b_latex: str) -> tuple[bool, str] | None:
    a, b = _solution_set(a_latex), _solution_set(b_latex)
    if a is None or b is None or a[1] != b[1]:
        return None
    same = a[0] == b[0]
    return (bool(same), "same_solutions" if same else "not_verified")


def steps_equivalent(a_latex: str, b_latex: str) -> tuple[bool, str]:
    """Is line B a valid rewrite of line A?

    Returns (verified, method). `method` is one of: expr_equal, ratio_constant,
    same_solutions, unparseable, mixed, inequality, degenerate, not_verified.
    Anything but verified=True is reported as "I couldn't confirm this step."
    """
    from sympy import Eq, simplify
    from sympy.core.relational import Relational
    from sympy.logic.boolalg import BooleanAtom

    # Inequalities, "±", "or" and chains like "-2 ≤ x ≤ 2" compare as sets.
    if _needs_sets(a_latex) or _needs_sets(b_latex):
        by_sets = _by_solution_sets(a_latex, b_latex)
        if by_sets is not None:
            return by_sets

    try:
        a, b = parse(a_latex), parse(b_latex)
    except Unparseable:
        return (False, "unparseable")
    if isinstance(a, BooleanAtom) or isinstance(b, BooleanAtom):
        return (False, "degenerate")  # SymPy already evaluated e.g. "0 = 0" to True

    a_rel, b_rel = isinstance(a, Relational), isinstance(b, Relational)
    if (a_rel and not isinstance(a, Eq)) or (b_rel and not isinstance(b, Eq)):
        return (False, "inequality")  # more than one variable, or SymPy couldn't settle it
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
