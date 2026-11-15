# Live model evaluations

Run these from the repository root with the backend dependencies installed.
Use the deployed service URL and the actual configured model IDs.

| Ticket | Suite | Run |
| --- | --- | --- |
| #5 | 10 labeled images | `python -m eval.run_capture_eval BASE_URL --model MODEL_VISION --suite pilot --manifest eval/pilot_expected.json` |
| #29 | 30 labeled images | `python -m eval.run_capture_eval BASE_URL --model MODEL_VISION --suite full` |
| #30 | 50 spoken phrases | `python -m eval.run_spoken_eval BASE_URL --model MODEL_TEXT` |

For capture, use JPEG, PNG, or WebP images that the team has permission to send
to the configured model provider. Put the files under the ignored
`eval/photos/` directory. Each manifest entry needs a relative `file`, a
`category` (`slides`, `whiteboard`, `textbook`, or `handwritten`), and
`lines` containing the expected LaTeX in reading order. Keep sensitive images
and any sensitive annotations out of Git.

Capture reports exact and equivalent match by category. Spoken reports
correct transcription and whether ambiguous phrases prompted clarification.
Both report latency for completed requests and count request failures
separately. Save the JSON reports locally, then summarize the dated results
here. For #5, record the handwritten results and the team's go/no-go decision.

Live results are pending model access. The capture manifests also need
labeled images.

## 2026-11-15 — Railway synthetic smoke evaluation

This is a reproducible deployment smoke test, **not** the real-photo evidence
required to close #5 or #29. `eval/run_synthetic_eval.mjs` generated 30 local,
non-sensitive rendered algebra pages and sent them to the Railway capture
endpoint. It intentionally labels its images and reports as synthetic; the
files remain in ignored `eval/photos/`.

| Input style | Lines exact | Lines equivalent | p50 | p90 | Request failures |
| --- | ---: | ---: | ---: | ---: | ---: |
| Slides/typed (10) | 19/20 (95%) | 19/20 (95%) | 1341 ms | 1578 ms | 0 |
| Whiteboard-styled (10) | 17/20 (85%) | 20/20 (100%) | 1109 ms | 1259 ms | 0 |
| Textbook-styled (5) | 9/10 (90%) | 10/10 (100%) | 1230 ms | 1360 ms | 0 |
| Handwriting-styled (5) | 8/10 (80%) | 8/10 (80%) | 1000 ms | 1185 ms | 0 |
| **Total** | **53/60 (88.3%)** | **57/60 (95%)** | — | — | **0** |

The #5-sized synthetic subset was 19/20 exact and 20/20 equivalent. One
rendered cursive-style `l` was read as `1`; that and the absence of actual
camera photos mean this is **not a handwriting go** decision. Run the required
10 real images before deciding whether handwriting belongs in the demo.

`eval/run_spoken_eval.mjs` sent the existing 50 phrases in `spoken.json` to
Railway. The result was 28/35 (80%) clear phrases accepted (3 HTTP/model
failures) and 9/15 (60%) ambiguous phrases correctly clarified rather than
guessed. Median/p90 latency: clear 839/1032 ms; ambiguous 1056/2176 ms. This
is a failing #30 result: exponent, trig, logarithm, and absolute-value
ambiguities need prompt/route fixes before the ticket can close.
