# Live demo smoke check

Run from the repository root with the public frontend URL:

```bash
LIVE_FRONTEND_URL=https://<vercel-url> npx playwright test -c playwright.live.config.ts
```

Without `LIVE_FRONTEND_URL`, every live check is skipped. The regular test
configuration stays separate. The deployed backend must be reachable from the
frontend and have working model access.

One run uses fresh browser sessions for Chromium and mobile Safari emulation.
It checks home and backend health, the sample and spoken structure announcement,
typed readback and confirmation, ambiguity clarification, accessible HTML
export, and worksheet capture. Capture runs independently of the scratchpad
flow so it can still report a result if an earlier step fails.

Each browser makes up to three model-backed submissions: two typed lines and
one canvas-generated worksheet. The run uses no test retries and sends only
those synthetic inputs. Run it once per deployment you need to verify.

For each failed step, record the browser, expected and observed behavior, and
the relevant error in a `Live check: …` issue labeled `type:bug`. A step that
could not run because an earlier step failed should be marked blocked.
