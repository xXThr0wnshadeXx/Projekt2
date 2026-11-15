# Deploying the back end

Primary host: **Railway** (doesn't sleep, so no cold starts during judging).
Backup: **Render** via `render.yaml` (its free tier sleeps unless pinged).

## Railway, once

1. railway.app → sign in with GitHub → **New Project → Deploy from GitHub repo** → `xXThr0wnshadeXx/Projekt2`.
2. Service → **Settings**
   - **Root Directory:** `/backend`
   - **Config file path:** `/railway.json` (Railway reads it from the repo root, not the root directory)
   - **Networking → Generate Domain**
3. Service → **Variables** (typed in the dashboard, never committed):

   | Variable | Value |
   |---|---|
   | `OPENAI_API_KEY` | the team key |
   | `MODEL_VISION`, `MODEL_TEXT`, `MODEL_STT` | model IDs confirmed in #4 |
   | `ALLOWED_ORIGIN` | the deployed front-end origin, e.g. `https://glance.vercel.app` (comma-separate to add `http://localhost:5173`) |
   | `TRUSTED_PROXY_HOPS` | `1` (so the rate limit sees real client IPs, not Railway's proxy) |
   | `STATS_TOKEN` | any long random string, for `/api/stats` |

4. Deploys run on every push to `main` that touches `backend/`. Python 3.11 comes from `backend/.python-version`.

Check: `curl -s https://<domain>/api/health` → `{"ok":true}`.
Logs: service → **Deployments → View logs** (live). See `docs/ops.md` once #53 is merged.
