# Demo day

Keep-warm, pre-flight and fallbacks for the live demo (issue #34). Use the
[hero-flow run-sheet](demo-hero-flow.md) for the Screen Curtain take and the
[Q&A sheet](demo-qa.md) for judging. The [keyboard demo](demo-script.md)
and [operations guide](ops.md) cover the existing walkthrough and server checks.

Set these once in the terminal you'll use:

```bash
export API=https://<railway-back-end-domain>
export FRONTEND=https://<front-end-domain>
export STATS_TOKEN=<from the host's variables, never pasted anywhere shared>
```

## 60 minutes before

- [ ] Railway: latest deploy is green and on `main` (#67)
- [ ] Front end deployed with `VITE_API_BASE=$API`, and `$FRONTEND` is in the back end's `ALLOWED_ORIGIN`
- [ ] Pre-flight on the venue Wi-Fi, all PASS:
  ```bash
  bash scripts/preflight.sh
  ```
  See the [recorded live preflight results on #34](https://github.com/xXThr0wnshadeXx/Projekt2/issues/34#issuecomment-6891479938).
- [ ] Start keep-warm in its own terminal tab and leave it running:
  ```bash
  bash scripts/keep_warm.sh
  ```

## 15 minutes before

- [ ] Switch the laptop to the phone hotspot and run `bash scripts/preflight.sh` again, so we know the fallback network works *before* we need it
- [ ] Backup video open in a tab, paused at the start (#37)
- [ ] Demo inputs ready: the worksheet photo/PDF in an easy folder, and the **sample problem** (works with no network at all)
- [ ] Screen reader set up and audible if it's part of the demo; volume checked on the room's speakers
- [ ] Do Not Disturb on; other apps and tabs closed
- [ ] **Nothing secret on screen:** no Railway/OpenAI dashboards, no terminal showing variables

## If something breaks on stage

Go down this list; don't debug live.

| What broke | What to do |
|---|---|
| Capture fails or is slow | Say "let me use the sample", press **Try a sample problem**. Reading, glance (`G`), explore, and low-vision mode all work offline |
| A step check doesn't answer | The line is still saved; carry on. Mention it's checked by SymPy on the server |
| Venue Wi-Fi drops | Switch to the hotspot (already tested above), reload the page |
| Back end down entirely | Sample problem for the reading half; backup video for the voice half |
| Laptop or browser misbehaves | Backup video, full screen |

## Who does what

| Job | Person |
|---|---|
| Drives the demo | Unassigned (decide at standup) |
| Runs pre-flight and watches keep-warm / logs | Nicolas for pre-flight ([#110](https://github.com/xXThr0wnshadeXx/Projekt2/issues/110)). Keep-warm and logs: Unassigned (decide at standup) |
| Holds the hotspot phone | Unassigned (decide at standup) |
| Starts the backup video if called | Unassigned (decide at standup) |
| Tests the hotspot and opens the backup-video tab before the demo ([#111](https://github.com/xXThr0wnshadeXx/Projekt2/issues/111)) | Unassigned (decide at standup) |
| Confirms the deployed demo end to end ([#155](https://github.com/xXThr0wnshadeXx/Projekt2/issues/155)) | Shaswath |
| Rehearses Flow A on a clean machine using venue Wi-Fi and hotspot, after #155 passes ([#55](https://github.com/xXThr0wnshadeXx/Projekt2/issues/55)) | tuffling |
| Runs the manual screen-reader pass and checks for repeated line numbers in the same session ([#32](https://github.com/xXThr0wnshadeXx/Projekt2/issues/32), [#133](https://github.com/xXThr0wnshadeXx/Projekt2/issues/133)) | tuffling |
| Tests live voice input with a microphone ([#150](https://github.com/xXThr0wnshadeXx/Projekt2/issues/150)) | tuffling |
| Checks read-aloud and typed lines on a real iPhone with VoiceOver ([#154](https://github.com/xXThr0wnshadeXx/Projekt2/issues/154)) | Shreev |

## Afterwards

- Stop keep-warm (`Ctrl+C`)
- `curl -s -H "X-Stats-Token: $STATS_TOKEN" "$API/api/stats"` — note any errors for the team
