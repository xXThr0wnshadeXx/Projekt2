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
