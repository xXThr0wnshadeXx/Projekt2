"""Words that give an answer, a method or a next step — issue #188.

Glance reads and writes down; it never solves, hints, corrects or says what to
do next. Text the model writes for the student (a readback, a question, a note)
that uses this language is refused outright, whatever the student said: a
readback reads a line, it never explains one.
"""

import re

METHOD_LANGUAGE = re.compile(
    r"\b(?:answers?|solutions?|solv(?:e|es|ed|ing)|therefore|thus|hence|"
    r"next steps?|you (?:should|could|can|need|must|have to|ought)|"
    r"try (?:to|adding|subtracting|multiplying|dividing)|first\b.{0,80}\bthen\b|then|"
    r"isolat\w*|hints?|both sides|the value of|works? out|"
    r"(?:to|and) (?:find|get|work out)|which (?:is|means|gives)|that means|"
    r"gives|giving|yields?|so [a-z]\b)\b",
    re.IGNORECASE,
)


def gives_answer_or_method(text: str | None) -> bool:
    return bool(text and METHOD_LANGUAGE.search(text))
