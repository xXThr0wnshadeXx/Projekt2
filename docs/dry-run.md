# Dry run: Flow A on a clean machine

Issue #55. Catches "works on my laptop" before judging.

## Rules

- **A machine that has never run the dev server**: a teammate's other laptop, a friend's, a library computer. No local `.env`, no `npm run dev`, no cached app.
- **Deployed link only.** Type it in; don't open it from a dev bookmark.
- A private/incognito window, so no saved problem or settings carry over.
- Run it **twice**: once on venue Wi-Fi, once on the phone hotspot.
- **File each failure within 10 minutes** (command at the bottom). Don't fix it mid-run; finish, then fix.

Back end: before starting, run `bash scripts/preflight.sh` from any laptop (`docs/demo-day.md`). If it FAILs, fix that first; the dry run is for what pre-flight can't see.

## Run sheet

Time each step with a phone stopwatch. Budgets are from DESIGN.md §16.

| # | Step (Flow A) | Pass? | Time | Budget | Notes |
|---|---|---|---|---|---|
| 1 | Open the link; page usable | | | ≤ 2 s | |
| 2 | Footer says "Back end: reachable" | | | — | |
| 3 | Capture → upload the demo worksheet → lines appear, focus on line 1 | | | ≤ 6 s (hard 12 s) | |
| 4 | `G` speaks the structure | | | — | |
| 5 | `Enter`, arrows, `Esc` explore the equation | | | — | |
| 6 | `S`, hold Space, say "two x equals eight", release → readback | | | ≤ 3 s (hard 6 s) | Allow the microphone when asked |
| 7 | `Enter` saves → "This step checks out." | | | ≤ 1.5 s | |
| 8 | Say "x plus one over two" → question → press 1 → saved | | | — | |
| 9 | `L` low-vision mode, arrows, `Esc` | | | — | |
| 10 | `X` → Download accessible HTML → open the file | | | — | Math reads as math |
| 11 | Reload the page: the problem and work are still there | | | — | |

| Run | Network | Machine / browser | Who | All passed? |
|---|---|---|---|---|
| 1 | Venue Wi-Fi | | | |
| 2 | Hotspot | | | |

## File a failure (within 10 minutes)

```bash
gh issue create --title "Dry run: <step> failed on <network>" --label "type:bug" --body "Step: …  Network: …  Machine/browser: …  What happened: …  Expected: …"
```

No `gh` on that machine? Open an issue on GitHub from your phone, or post in the team chat and the next person at a laptop files it.
