# Vercel Services deployment

The root [`vercel.json`](../vercel.json) deploys this repository as one Vercel
project with two services on one domain:

| Service | Source | Public route | Entry point |
| --- | --- | --- | --- |
| `frontend` | `frontend/` | `/*` | Vite static build |
| `glance-api` | `backend/` | `/api/*` | `app.main:app` |

`frontend` builds with `VITE_API_BASE=/`. This is a build-time value and makes
the browser call the same deployment's `/api/*` routes; it is not an API
secret. There is no Railway address in this deployment path.

There are no service bindings. The only caller is browser code, and Vercel
bindings are runtime variables for server-side services, not values that can be
used by a Vite bundle in a visitor's browser. The API is public only through
the `/api/*` rewrite because the browser must call it.

## Vercel project setup

Import the repository with its root directory set to the repository root. In
**Project Settings → Build and Deployment**, choose **Services** as the
framework, then redeploy. Services mode is required for the root configuration
to be used.

Set these environment variables on the `glance-api` service for Production.
Use the same non-secret limits in Preview if preview API testing is wanted.

| Variable | Value / source | Secret |
| --- | --- | --- |
| `OPENAI_API_KEY` | Existing OpenAI project key | Yes |
| `MODEL_VISION` | Existing configured vision model ID | No |
| `MODEL_TEXT` | Existing configured text model ID | No |
| `MODEL_STT` | Existing configured transcription model ID | No |
| `APP_ENV` | `production` | No |
| `TRUSTED_PROXY_HOPS` | `1` | No |
| `MODEL_CALL_LIMIT` | `2000` | No |
| `MODEL_CALL_WINDOW_SECONDS` | `86400` | No |
| `CAS_WORKERS` | `1` | No |
| `STATS_TOKEN` | A newly generated, private random value | Yes, optional |
| `MODEL_PRICES` | JSON for the selected model IDs | No, optional |

The build command in `vercel.json` sets `VITE_API_BASE=/` for production.
For `vercel dev -L`, set `VITE_API_BASE=/` in the shell before starting Vercel.
Leave `ALLOWED_ORIGIN` unset for the single-domain deployment. The browser
sends requests to the same origin as the frontend.

The backend now selects Python 3.12 through `backend/.python-version`, because
that is the supported Vercel Python runtime compatible with this dependency
set. Run `vercel dev -L` from the repository root to exercise both services
through one local address.
