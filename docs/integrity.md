# Glance's integrity contract

Glance is a reader and a scribe. Understanding what the page says is different
from deciding how to solve it. The student supplies the work and confirms it.
This is the product contract; the status below distinguishes enforcement from
work still required. It is not a certification for use in any particular exam.

| Glance does | Glance never does |
| --- | --- |
| Reads the page aloud, in braille and in large print, as often as asked | Solves, hints, gives an answer or a next step |
| Writes down exactly what the student dictates or types, and reads it back | Changes, fixes or completes the student's maths |
| Asks when dictation is ambiguous | Guesses |
| In Study/Homework only, if the instructor allows, says whether a step follows | Says “wrong”, or explains how to do a step |
| In Study/Homework only, once per problem before hand-in, says which line of the work may be worth another look | Says what is wrong with it, hints, or reviews the same problem twice |
| Exports the student's own work | Stores images, audio or student work on Glance's server |

Images and audio are sent to the configured model provider for processing.
Confirmed work may be saved locally in the student's browser. “No server
storage” describes Glance's application, not a claim about provider retention;
TODO: verify the deployed provider/account data settings before making a
retention promise. Exam permission is decided by the institution or instructor.

## Explanation boundary

After deterministic verification, a study explanation may name only addition,
subtraction, multiplication, division, factoring, expansion, simplification or
combining like terms, in the fixed passive sentence forms in
[`explain.py`](../backend/app/explain.py). A numeric or single-letter operand
must already occur in line A or B. Advice, results, added expressions, unknown
wording and non-text replies are refused. The existing route then says
“This step checks out.” No code here determines or recommends a student's next
line, or proves that the model named the historical operation correctly.

## Loopholes and remaining ownership

| Loophole | Enforcement or remaining work |
| --- | --- |
| The caller declares the mode | Explicit exam requests are refused; an instructor-authenticated lock and forged-study-body tests remain #189. This PR does not change `routes/diff.py`. |
| Study explanations are free model prose | Fixed operation forms and source-atom checks are enforced in `model_explainer`; rejected text falls back to the plain verified message. |
| Spoken operators, signs or edits change the student's work | #191 owns the operator guard. Exact edit-token diffs and live dictation evaluation must be checked separately; this document does not claim them complete. |
| Capture completes or corrects a line | #176 owns exact-source fixtures. TODO: include incorrect `2x + 3 = 12` and unfinished `x =` pages and run the revised backend live. A parseable line is not proof it was printed. |
| Worksheet, context or voice prompt injection | The explanation boundary is tested below. Capture metadata, spoken readback and model edit instructions still have executable failing contracts; their owning routes need fixes. |
| Glossary meanings become methods | Every glossary meaning is read from `frontend/src/talk.ts` as text and screened for method phrases. The existing “solve” definition triggers “to find”; it remains a strict expected failure for its frontend owner to resolve. This lexical flag alone is not proof that the definition supplies a solution. |
| Other free text reaches the student | TODO: template or source-check `readback`, `clarifying_question`, edit `instruction`, capture `warnings`, `intent_notes` and diagram descriptions. These are not covered by the explanation allowlist. |
| Step checks can confirm guesses | #207 owns the check policy; a verification result is not evidence that the student derived the line independently. |

## Reproducible evidence, not a live pass rate

Run `python -m pytest tests/test_red_team.py tests/test_glossary_never_teaches.py -q`.
CI's existing backend job includes both files.

The explanation suite supplies 20 adversarial model replies against three
source-text injection forms: **60 stubbed attempts**. Each must yield no
explanation. It also checks approved operation forms, new atoms, non-text
replies, the route's fallback message, and explicit exam refusal. This is an
explanation-boundary result, not 60 successful end-to-end microphone/camera
trials.

Three additional route attacks and one glossary check are marked **strict
expected failures**, with ticket/scope reasons. They still execute, and an
unexpected pass fails CI so the owner must remove the marker once fixed.
Do not count these as passes or claim a 100% system-wide red-team result.
TODO: run the full typed, spoken and captured attack set against the deployed
revision, including a real instructor lock, and record the revision, model,
date, denominator and every failure before the demo.

The 50-line synthetic dictation set in #191 includes 17 incorrect or unfinished
lines to preserve, not correct. TODO: live-model and real-voice results. No
user testing, exam approval or live-model accuracy is established by CI.
