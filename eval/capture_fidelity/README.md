# Source fidelity — issue #176

These are synthetic images, not student worksheets. `expected.json` records
every printed line. Regenerate the PNGs with
`python eval/capture_fidelity/generate.py` (the backend's Pillow dependency).

The two cases cover equations without any instructions and a printed heading
above an equation. The capture prompt and schema require verbatim source
instructions, an empty string when absent, and equations without duplicated
headings. The route's own message to the model no longer contains task-like
wording, and it labels optional notation context as separate from the printed
worksheet. Because a prompt is not a guarantee, `backend/app/capture_fidelity.py`
then checks the output: instructions that describe the image or transcribing
are cleared, and a line that is only a sentence in `\text{}` is moved out of the
math lines. No equation is ever changed.

Run against a backend **running the revision under review**, with its actual
vision model ID:

```bash
python -m eval.run_capture_fidelity http://localhost:8000 \
  --revision COMMIT_SHA --model VISION_MODEL > /tmp/capture-fidelity.json
```

This makes exactly two capture requests, without automatic retries. A nonzero
exit means a request failed or source fidelity failed. The comparison accepts
only TeX whitespace and delimiter/fraction sizing differences; equivalent but
solved, simplified, rearranged, missing or extra equations fail. Instructions
must match exactly. The report includes both actual responses and their
backend line IDs, so it can expose a prose heading receiving `L1`.

After that command succeeds, replay the real responses through the browser
upload flow to check the announcements, line count, first equation's focus and
math readback in both browsers:

```bash
CAPTURE_FIDELITY_REPORT=/tmp/capture-fidelity.json BASE_URL=http://localhost:5174 \
  npx playwright test tests/e2e/capture-fidelity.spec.ts \
  --project=chromium --project=mobile-safari
```

Without `CAPTURE_FIDELITY_REPORT`, the browser tests use expected contract
responses. Pytest checks that the evaluator rejects the two reported failures
and algebraic rewrites. Neither those tests nor the contract browser tests
prove that a live model follows the revised prompt. The live run and replay
remain required before claiming #176 verified. These two cases also do not
establish accuracy across handwriting, blurry images or full worksheets.

`baseline-2026-11-15.json` records two production requests at 09:29 UTC using
these PNGs. Both failed: equations-only input acquired invented instructions;
the heading case acquired rewritten instructions and a prose math line at L1.
The deployed backend revision and model ID were unavailable and are explicitly
unverified in the report. This is before-fix evidence, not a live pass of the
revised prompt.
