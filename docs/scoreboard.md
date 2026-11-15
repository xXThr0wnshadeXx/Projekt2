# Slide

- 95% synthetic worksheet lines matched.
- 60% scripted clarification checks passed.
- 209 milliseconds for a live step check.
- 296 backend tests collected.
- 264 browser smoke tests listed.

## Sources

Test counts were collected on November 15, 2026 from `main` at `d50e3b4`.

| Number | What it means | Source |
| --- | --- | --- |
| 95% | The live capture run matched 57 of 60 rendered worksheet lines after normalizing notation. | [eval/notes.md:28–42](../eval/notes.md#L28-L42), [eval/run_synthetic_eval.mjs:72–85](../eval/run_synthetic_eval.mjs#L72-L85) |
| 60% | 9 of 15 ambiguous text fixtures met the scripted clarification check for a question and distinct LaTeX options. | [eval/notes.md:49–54](../eval/notes.md#L49-L54), [eval/run_spoken_eval.mjs:13–19](../eval/run_spoken_eval.mjs#L13-L19) |
| 209 ms | Elapsed time for the sample homework step check in the November 15 live preflight. | [Issue #34 preflight results](https://github.com/xXThr0wnshadeXx/Projekt2/issues/34#issuecomment-6891479938) |
| 296 | Backend test cases collected. | `backend/.venv/bin/python -m pytest -q --co \| tail -1` → `296 tests collected in 0.89s` |
| 264 | Browser smoke test cases listed across Chromium and mobile Safari. | `npx playwright test --grep @smoke --list \| tail -1` → `Total: 264 tests in 13 files` |
| 176 ms | First backend health response in the same live preflight. | [Issue #34 preflight results](https://github.com/xXThr0wnshadeXx/Projekt2/issues/34#issuecomment-6891479938) |
| 7 | Screens with axe checks in both color schemes: Home, Capture, Problem, Low-vision mode, Scratchpad, Settings, and Hand-in. Capture and Scratchpad also have checks for temporary states. | [tests/e2e/a11y.spec.ts:87–205](../tests/e2e/a11y.spec.ts#L87-L205) |

## Not measured yet

- Real-photo capture accuracy and the handwriting go/no-go decision. [#5](https://github.com/xXThr0wnshadeXx/Projekt2/issues/5) and [#29](https://github.com/xXThr0wnshadeXx/Projekt2/issues/29).
- Clarification accuracy after the remaining spoken cases have been addressed. The recorded run covers the scripted response check. [#30](https://github.com/xXThr0wnshadeXx/Projekt2/issues/30), [eval/notes.md:49–54](../eval/notes.md#L49-L54).
- End-to-end live browser timings for upload to readable math and speech to readback. [#33](https://github.com/xXThr0wnshadeXx/Projekt2/issues/33) and [#55](https://github.com/xXThr0wnshadeXx/Projekt2/issues/55).
- Measured cost per page and per spoken line. [#29](https://github.com/xXThr0wnshadeXx/Projekt2/issues/29), [#30](https://github.com/xXThr0wnshadeXx/Projekt2/issues/30), and [#44](https://github.com/xXThr0wnshadeXx/Projekt2/issues/44).
- Completed keyboard-only flows on the deployed app with a screen reader. [#32](https://github.com/xXThr0wnshadeXx/Projekt2/issues/32) and [#55](https://github.com/xXThr0wnshadeXx/Projekt2/issues/55).
- Interviews, usage sessions, sign-ups, follow-ups, pilot commitments, and concierge conversion time. The [evidence ledger](proof-log.md#L9-L11) has no entries. [#39](https://github.com/xXThr0wnshadeXx/Projekt2/issues/39), [#41](https://github.com/xXThr0wnshadeXx/Projekt2/issues/41), [#42](https://github.com/xXThr0wnshadeXx/Projekt2/issues/42), and [#43](https://github.com/xXThr0wnshadeXx/Projekt2/issues/43).
