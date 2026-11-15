# Deploying Glance

Two services: the back end (FastAPI) and the front end (static files). They find
each other through two environment variables, and **getting those two wrong is
the only way this fails quietly** — so they are the thing to check first.

Everything below was verified against a production build served as static files
with the back end started exactly as the host starts it.

---

## 1. Back end

Needs the repository and nothing else. It starts and serves `/api/health`
without any model keys, so deploy it first and add keys afterwards.

**Start command** (what `render.yaml` uses):

```
uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1 --no-access-log
```

Root directory is `backend`. Build is `pip install -r requirements.txt`.

**Python must be 3.11.** `pydantic==2.10.4` has no wheels for 3.13 or newer, so
a host defaulting to a newer Python fails at install with a compiler error that
does not mention Python at all. `backend/.python-version` and the
`PYTHON_VERSION` variable in `render.yaml` both pin it — do not remove either.

### Environment variables

| Variable | Needed for | Notes |
|---|---|---|
| `ALLOWED_ORIGIN` | everything | The **exact** front-end origin. See §3. |
| `OPENAI_API_KEY` | capture, speech | Without it those routes are not registered at all |
| `MODEL_VISION` | capture | |
| `MODEL_TEXT` | spoken maths, explanations | |
| `MODEL_STT` | recording | |
| `MODEL_CALL_LIMIT` | model-call budget | Set to `1500` for the public demo; adjust this number for the event. |
| `MODEL_CALL_WINDOW_SECONDS` | model-call budget window | Set to `86400` for the public demo (one day). |
| `ENVIRONMENT` | production safeguards | Set to `production` on the deployed API. |
| `TRUSTED_PROXY_HOPS` | per-address limits | Required in production; set to `1` for Render. Railway needs this set by hand too. |
| `STATS_TOKEN` | `/api/stats` | Optional |

For Railway, add `MODEL_CALL_LIMIT=1500`, `MODEL_CALL_WINDOW_SECONDS=86400`,
`ENVIRONMENT=production`, and `TRUSTED_PROXY_HOPS=1` in its Variables panel.
The cap is deliberately adjustable: change the limit to match the planned demo
traffic. Do not set a production environment without `TRUSTED_PROXY_HOPS`;
the API refuses to start so one visitor cannot consume every student's budget.

### What a keyless deploy looks like

This is the expected state before keys are added, not a broken one:

```
GET  /api/health    200   {"ok": true}
POST /api/capture   404   route not registered — no keys
POST /api/diff      200   {"verified": true, "method": "ratio_constant", …}
POST /api/validate  200   {"valid": true}
```

Step checking is pure SymPy, so **it works with no key and no credit**. The
sample problem, exploring, low-vision mode, the scratchpad and handing in all
work in this state. Only reading a *new* image and speech need a key.

The scratchpad works here because a typed line is read in the browser when the
model route is missing: symbols (`2x = 8`, `(x+1)/2 = 5`) and simple words
("two x equals eight"). Words whose grouping is unclear are refused, not
guessed, until a key is added. With no back end at all the line is still read,
read back and saved; it just cannot be step checked.

**If every step comes back "I couldn't confirm this step", the server is
missing `antlr4-python3-runtime==4.11.1`.** SymPy cannot parse LaTeX without
it and fails quietly. `POST /api/validate` with `{"latex": "2x = 8"}` is the
one-line test: it must say `true`.

---

## 2. Front end

Static files. Build with `npm run build` in `frontend`, serve `frontend/dist`.
`frontend/vercel.json` already sets the build command, output directory and the
rewrite that sends every path to `index.html`.

**One variable, set at build time, not runtime:**

```
VITE_API_BASE=https://your-back-end-host
```

Vite inlines this into the bundle, so **changing it means rebuilding**. Setting
it in a dashboard after the build has no effect. No trailing slash.

To check it took, after building:

```bash
grep -o 'https://your-back-end-host' frontend/dist/assets/*.js
```

Nothing printed means the bundle is still pointing somewhere else.

---

## 3. The failure that looks like something else

If `ALLOWED_ORIGIN` does not match the front end's origin **exactly**, the
browser blocks every request and the app reports that the server is
unreachable — while the server is up and answering fine from a terminal. It
cost me half an hour locally before I recognised it.

Exactly means scheme, host and port, with no trailing slash and no path:

```
https://glance.vercel.app        correct
https://glance.vercel.app/       trailing slash — stripped by the server, but do not rely on it
http://glance.vercel.app         wrong scheme
https://www.glance.vercel.app    different origin
```

Check it from a terminal, not the browser:

```bash
curl -s -i -H "Origin: https://your-front-end-origin" https://your-back-end-host/api/health | grep -i access-control-allow-origin
```

A header means it is right. **No header means the browser will block it**, even
though the status is 200.

The app now tells these apart for you: if the server is up but refusing the
origin, it says so and names the origin to add. If nothing answers at all, it
says that instead.

Preview deployments get their own origins. `ALLOWED_ORIGIN` takes a
comma-separated list.

---

## 4. Order to do it in

1. Deploy the back end. Confirm `/api/health` returns `{"ok": true}` in a browser.
2. Build and deploy the front end with `VITE_API_BASE` set to that host.
3. Set `ALLOWED_ORIGIN` on the back end to the front end's origin. Redeploy the
   back end — most hosts need a restart for a variable to take.
4. Open the front end. If the server notice is gone, they are talking.
5. Add the model keys and redeploy. `/api/capture` goes from 404 to 400 on an
   empty request, which is the sign it is on.
6. `bash scripts/preflight.sh` to check the whole thing at once.
