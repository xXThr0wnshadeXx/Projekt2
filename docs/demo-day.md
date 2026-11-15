# Demo day

Keep-warm, pre-flight and fallbacks for the live demo (issue #34). Pair this
with `docs/demo-script.md` (what to click) and `docs/ops.md` (logs and stats).

Set these once in the terminal you'll use:

```bash
export API=https://<railway-back-end-domain>
export FRONTEND=https://<front-end-domain>
export STATS_TOKEN=<from the host's variables, never pasted anywhere shared>
```

## 60 minutes before

- [ ] Railway: latest deploy is green and on `main` (#67)
- [ ] Front end deployed with `VITE_API_BASE=$API`, and `$FRONTEND` is in the back end's `ALLOWED_ORIGIN`
- [ ] Pre-flight on the venue Wi-Fi, no FAILs. Review each warning before proceeding:
  ```bash
  bash scripts/preflight.sh
  ```
- [ ] If the demo uses live capture or speech, complete a synthetic worksheet
  capture and spoken line on the deployed app. The pre-flight script only
  checks route registration. Use the sample or the backup recording while
  live provider access is pending (#88).
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
| Drives the demo | |
| Runs pre-flight and watches keep-warm / logs | |
| Holds the hotspot phone | |
| Starts the backup video if called | |

## Afterwards

- Stop keep-warm (`Ctrl+C`)
- `curl -s -H "X-Stats-Token: $STATS_TOKEN" "$API/api/stats"` — note any errors for the team
