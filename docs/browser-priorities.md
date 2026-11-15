# Browser demo priorities — Shreev

Checked against the GitHub issues, open PRs, and [Glance board](https://github.com/users/shreev2703/projects/3) on November 15, 2026 (Pacific time).

The demo to make dependable is **bring in a worksheet → hear and explore the math → type or speak your own line → confirm it → export accessible work**. Finish that flow before adding more features.

## Ownership handoff to tuffling

At Shreev's request on November 15, 2026, the remaining browser follow-through
is split explicitly between transferred work and newly assigned development:

| Order | Ticket | Origin | Current work for tuffling |
|---|---|---|---|
| 1 — P0 | #164 / PR #165 | Transferred from shreev2703 | Review the implemented request recovery, complete required checks/review, merge, deploy and verify. In Review. |
| 2 — P1 | #176 | Newly assigned to tuffling; previously unassigned | Fix invented/duplicated capture instructions and add the two reported regression/evaluation fixtures. Todo. |
| 3 — P1 | #109 / PR #174 | Transferred from shreev2703 | Review and merge the browser handoff documentation, then reconcile the release checklist with verified shipped work. In Review. |

All three carry `new-for:tuffling`; only #164 and #109 carry
`handoff:shreev-to-tuffling`. Their issue bodies preserve the original criteria
and add the remaining work. PRs #165 and #174 are assigned to tuffling for
follow-through with review requested. Existing PR authorship is unchanged.
Shreev retains the hardware-dependent #154 and product/research tickets;
available AI usage does not substitute for actual device or participant evidence.

Most of Shreev's original implementation tickets (#9–#14, #16, #18, #19) are already Done. Several later fixes have open PRs but were missing from the board. Continue from those implementations rather than rebuilding them. Review requirements still apply; an open PR is not a shipped fix.

## Work in this order

| Order | Work | Tickets / existing PRs | Owner and next action |
|---|---|---|---|
| Complete | Production deployment and worksheet upload | #3, #125, #123 | Closed with live evidence: a two-line PNG uploaded through the browser, results were announced, focus moved to Line 1, and keyboard exploration worked. Real microphone and iPhone testing remain separate. |
| 1 — P0 | Recover from stalled browser requests | #164 → PR #165 | Transferred to tuffling for review and release. Implemented; merge conflict resolved against current main, including capture cancellation. Required review/checks still apply. |
| 2 — P1 | Preserve captured source instructions | #176 | Newly assigned to tuffling. Fix the two documented live capture-fidelity defects; keep the already-working upload/focus path intact. |
| 3 — P0 for the demo | Keep work usable when the API is unavailable | #128, #131 → PR #136; #127 → PR #152 | Existing work by Nicolas: review the offline-command, unavailable-check announcement, and capability-gating fixes together with the typed fallback. Preserve saved work and explicit confirmation. |
| 4 — P0 if voice is demonstrated | Make microphone lifecycle reliable | #16 follow-up → PR #119 | Existing work by Nicolas: review timed stop, permission-prompt cancellation, and cleanup. Test both desktop hold-Space and phone tap-to-toggle. |
| 5 — P1 | Preserve speech continuity | #146 → PR #161; #132 → PR #139; #163 | Skip-link focus is now merged into main. Review the remaining speech fixes. Tuffling owns the speech/rebase coordination; avoid concurrent edits to those branches. |
| 6 — P1, required before claiming real-device support | Real screen-reader and iPhone pass | #32, #133, #154 | Shreev owns #154; Tuffling owns #32/#133. Run VoiceOver/NVDA and record actual device/version/results. WebKit automation does not establish real iPhone or screen-reader support. |
| 7 — P1 | Rehearse the same flow on venue Wi-Fi and hotspot | #55, #34, #155 | Coordinate with existing owners. Include upload, ambiguity, explicit save, export, an unavailable API, and a stalled connection. |

Live-board capture, the initial PWA shell and glossary expansion have since
landed in main. Defer further expansion of those features until the main flow
is dependable. PR #170 was reviewed and merged with Shreev's explicit approval
to isolate service workers in browser tests. Keep existing owners; this list
is a delivery sequence, not a reassignment of teammates' work.

## Production check completed this session

Site: https://glance-shreev2703.vercel.app

API: https://glance-api-production-e9997db1.up.railway.app

- Vercel reports the current production deployment Ready.
- `/api/health` returned 200 with `{"ok":true}` and the exact Vercel origin in `Access-Control-Allow-Origin`.
- `/api/validate` accepted `2x = 8`.
- A synthetic PNG sent directly to `/api/capture` returned 200, the equation `2x + 3 = 11`, and the exact Vercel CORS origin. It also emitted the instruction as a math line; check instruction/line separation with real worksheets before calling the capture quality verified.
- In the live browser: opened the sample, entered equation exploration, returned with Escape, opened the scratchpad with S, typed `2x = 8`, received readback, explicitly saved, received “This step checks out,” opened export with X, and downloaded accessible HTML.
- Follow-up live upload: used the actual file chooser to upload a PNG with `2x + 3 = 11` and `(x + 1) / 2 = 5`. The polite live region announced “Found 2 lines,” L1 received focus, both equations rendered, and Down/Right in the explorer exposed “2 x plus 3” then “equals.” Evidence is recorded on #123 and #3. No API responses were mocked in this check.
- The browser exposed equation speech in its accessibility tree. This is not a listening test with a screen reader.

Still unverified in this session: user-supplied worksheet quality across varied
images, microphone recording/transcription, real iPhone Safari, physical
braille output, PDF print-dialog output, and venue/hotspot behavior. Shreev has
confirmed that no real-device or user-research results are available yet and
asked to focus on browser tickets; keep those manual tickets open.

## Request recovery in #164

The API client now limits individual capture/PDF-page requests to 12 seconds, ordinary requests to 6 seconds, health/diagnostics to 5 seconds, and typed validation to 3 seconds. A deadline includes response-body consumption, preserves an earlier caller cancellation, and clears its timer/listener afterwards. No request is retried automatically.

These are per-request recovery limits, not a measurement of the end-to-end latency targets in DESIGN.md. Multiple stages (for example transcription then interpretation) can add together. Model and real-device latency still need measurement.

Regression coverage checks capture recovery and manual retry, the PDF page picker, typed fallback with explicit confirmation, stalled JSON bodies, and step-check cancellation in Chromium and WebKit. Existing accessibility and main-flow coverage remains part of the full browser suite.
