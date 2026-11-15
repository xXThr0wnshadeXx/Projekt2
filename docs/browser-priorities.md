# Browser demo priorities — Shreev

Checked against the GitHub issues, open PRs, and [Glance board](https://github.com/users/shreev2703/projects/3) on November 15, 2026 (Pacific time).

The demo to make dependable is **bring in a worksheet → hear and explore the math → type or speak your own line → confirm it → export accessible work**. Finish that flow before adding more features.

Most of Shreev's original implementation tickets (#9–#14, #16, #18, #19) are already Done. Several later fixes have open PRs but were missing from the board. Continue from those implementations rather than rebuilding them. Review requirements still apply; an open PR is not a shipped fix.

## Work in this order

| Order | Work | Tickets / existing PRs | Owner and next action |
|---|---|---|---|
| 1 — P0 | Finish production input verification | #3, #125, #123; origin guard PR #144 | Shreev: check a real worksheet upload and actual microphone input, then record the deployed result. The sample/typed/export path already passed the check below. Review the existing origin guard rather than implementing it twice. |
| 2 — P0 | Recover from stalled browser requests | #164 | Shreev: review and ship the bounded-request fix on this branch. It restores capture/PDF controls and reaches local typed readback when model or validation requests stall. |
| 3 — P0 for the demo | Keep work usable when the API is unavailable | #128, #131 → PR #136; #127 → PR #152 | Existing work by Nicolas: review the offline-command, unavailable-check announcement, and capability-gating fixes together with the typed fallback. Preserve saved work and explicit confirmation. |
| 4 — P0 if voice is demonstrated | Make microphone lifecycle reliable | #16 follow-up → PR #119 | Existing work by Nicolas: review timed stop, permission-prompt cancellation, and cleanup. Test both desktop hold-Space and phone tap-to-toggle. |
| 5 — P1 | Preserve keyboard and speech continuity | #126 → PR #137; #146 → PR #161; #132 → PR #139; #163 | Review existing focus and speech fixes. Tuffling owns the speech/rebase coordination; avoid concurrent edits to those branches. |
| 6 — P1, required before claiming real-device support | Real screen-reader and iPhone pass | #32, #133, #154 | Shreev owns #154; Tuffling owns #32/#133. Run VoiceOver/NVDA and record actual device/version/results. WebKit automation does not establish real iPhone or screen-reader support. |
| 7 — P1 | Rehearse the same flow on venue Wi-Fi and hotspot | #55, #34, #155 | Coordinate with existing owners. Include upload, ambiguity, explicit save, export, an unavailable API, and a stalled connection. |

Defer live whiteboard capture (#27), PWA installation (#160), extra vocabulary (#147), and additional export formats until the main flow is dependable. Keep existing owners; this list is a delivery sequence, not a reassignment of teammates' work.

## Production check completed this session

Site: https://glance-shreev2703.vercel.app

API: https://glance-api-production-e9997db1.up.railway.app

- Vercel reports the current production deployment Ready.
- `/api/health` returned 200 with `{"ok":true}` and the exact Vercel origin in `Access-Control-Allow-Origin`.
- `/api/validate` accepted `2x = 8`.
- In the live browser: opened the sample, entered equation exploration, returned with Escape, opened the scratchpad with S, typed `2x = 8`, received readback, explicitly saved, received “This step checks out,” opened export with X, and downloaded accessible HTML.
- The browser exposed equation speech in its accessibility tree. This is not a listening test with a screen reader.

Still unverified in this session: actual worksheet capture against the live model, microphone recording/transcription, real iPhone Safari, physical braille output, PDF print-dialog output, and venue/hotspot behavior. Leave deployment/input acceptance open until those relevant checks are recorded.

## Request recovery in #164

The API client now limits individual capture/PDF-page requests to 12 seconds, ordinary requests to 6 seconds, health/diagnostics to 5 seconds, and typed validation to 3 seconds. A deadline includes response-body consumption, preserves an earlier caller cancellation, and clears its timer/listener afterwards. No request is retried automatically.

These are per-request recovery limits, not a measurement of the end-to-end latency targets in DESIGN.md. Multiple stages (for example transcription then interpretation) can add together. Model and real-device latency still need measurement.

Regression coverage checks capture recovery and manual retry, the PDF page picker, typed fallback with explicit confirmation, stalled JSON bodies, and step-check cancellation in Chromium and WebKit. Existing accessibility and main-flow coverage remains part of the full browser suite.
