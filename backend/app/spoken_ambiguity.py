"""Recognize simple fraction phrases that have two explicit groupings."""

import re

_NUMBERS = dict(zip(
    'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(),
    map(str, range(21)),
))
_ATOM = r'(?:[a-z]|\d+(?:\.\d+)?|' + '|'.join(_NUMBERS) + ')'
_FRACTION = re.compile(
    rf'(?P<a>{_ATOM}) (?P<operator>plus|minus) (?P<b>{_ATOM}) over (?P<c>{_ATOM})'
)


def fraction_ambiguity(text: str) -> dict | None:
    phrase = re.sub(r'\s+', ' ', text.lower().strip().rstrip('.?!')).strip()
    match = _FRACTION.fullmatch(phrase)
    if match is None:
        return None
    a, operator, b, c = match.group('a', 'operator', 'b', 'c')
    left, middle, right = (_NUMBERS.get(value, value) for value in (a, b, c))
    symbol = '+' if operator == 'plus' else '-'
    return {
        'latex': None,
        'ambiguous': True,
        'clarifying_question': 'Which part is over ' + c + '?',
        'alternatives': [
            {
                'latex': r'\frac{' + left + symbol + middle + '}{' + right + '}',
                'readback': a + ' ' + operator + ' ' + b + ', all over ' + c,
            },
            {
                'latex': left + symbol + r'\frac{' + middle + '}{' + right + '}',
                'readback': a + ' ' + operator + ' the fraction ' + b + ' over ' + c,
            },
        ],
        'readback': None,
    }
