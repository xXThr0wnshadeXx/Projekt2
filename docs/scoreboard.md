# Slide

- 95% of lines matched in meaning (88% exactly) on 30 synthetic worksheet pages.
- 1.3 seconds to read a typed page on the live server (median).
- 106 milliseconds for a live step check (median of 30).
- 7 screens checked automatically for accessibility, in light and dark.
- 562 back-end tests and 504 browser checks across three browsers.

## Sources

Test counts were collected on November 15, 2026 from `main` at `29170e3`. They are tests collected, not a record of a run.

| Number | What it means | Source |
| --- | --- | --- |
| 95% (88%) | Equivalent match: 57 of 60 lines on 30 synthetic rendered pages after normalizing notation. Exact match was 53 of 60 (88.3%). Not real camera photos. | [eval/notes.md:28–42](../eval/notes.md#L28-L42), [eval/run_synthetic_eval.mjs:72–85](../eval/run_synthetic_eval.mjs#L72-L85) |
| 1.3 s | Median time to read a slide-style typed page on the Railway capture endpoint (p50 1341 ms; p90 1578 ms), from the same synthetic run. | [eval/notes.md:36–42](../eval/notes.md#L36-L42) |
| 106 ms | Median (p50) of 30 live step checks on the Railway API; p95 155 ms. | [docs/latency.md](latency.md) (#195) |
| 562 | Back-end test cases collected. | `backend/.venv/bin/python -m pytest -q --co \| tail -1` → `562 tests collected` |
| 504 | Browser smoke test cases listed across Chromium, mobile Safari and Firefox. | `npx playwright test --grep @smoke --list \| tail -1` → `Total: 504 tests in 20 files` |
| 176 ms | First backend health response in the same live preflight. | [Issue #34 preflight results](https://github.com/xXThr0wnshadeXx/Projekt2/issues/34#issuecomment-6891479938) |
| 7 | Screens with axe checks in both color schemes: Home, Capture, Problem, Low-vision mode, Scratchpad, Settings, and Hand-in. Capture and Scratchpad also have checks for temporary states. | [tests/e2e/a11y.spec.ts:87–205](../tests/e2e/a11y.spec.ts#L87-L205) |

## Not measured yet

- Real-photo capture accuracy and the handwriting go/no-go decision. [#5](https://github.com/xXThr0wnshadeXx/Projekt2/issues/5) and [#29](https://github.com/xXThr0wnshadeXx/Projekt2/issues/29).
- Clarification accuracy. The recorded run asked instead of guessing on 9 of 15 ambiguous phrases (60%), which `eval/notes.md` calls a failing #30 result, so it stays off the slide until the exponent, trig, logarithm and absolute-value cases are fixed. [#30](https://github.com/xXThr0wnshadeXx/Projekt2/issues/30), [eval/notes.md:49–54](../eval/notes.md#L49-L54).
- End-to-end live browser timings for upload to readable math and speech to readback. [#33](https://github.com/xXThr0wnshadeXx/Projekt2/issues/33) and [#55](https://github.com/xXThr0wnshadeXx/Projekt2/issues/55).
- Measured cost per page and per spoken line. [#29](https://github.com/xXThr0wnshadeXx/Projekt2/issues/29), [#30](https://github.com/xXThr0wnshadeXx/Projekt2/issues/30), and [#44](https://github.com/xXThr0wnshadeXx/Projekt2/issues/44).
- Completed keyboard-only flows on the deployed app with a screen reader. [#32](https://github.com/xXThr0wnshadeXx/Projekt2/issues/32) and [#55](https://github.com/xXThr0wnshadeXx/Projekt2/issues/55).
- Interviews, usage sessions, sign-ups, follow-ups, pilot commitments, and concierge conversion time. The [evidence ledger](proof-log.md#L9-L11) has no entries. [#39](https://github.com/xXThr0wnshadeXx/Projekt2/issues/39), [#41](https://github.com/xXThr0wnshadeXx/Projekt2/issues/41), [#42](https://github.com/xXThr0wnshadeXx/Projekt2/issues/42), and [#43](https://github.com/xXThr0wnshadeXx/Projekt2/issues/43).
