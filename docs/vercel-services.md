# Vercel frontend with the Railway API

The root [`vercel.json`](../vercel.json) builds the Vite frontend in the Vercel
Services project and proxies `/api/*` to the existing Glance API on Railway.
The rewrite preserves the `/api` prefix and runs before the frontend catch-all.

Keep the Vercel root directory at the repository root and the framework preset
set to **Services**. The configured build sets `VITE_API_BASE=/`, so the browser
sends requests to the Vercel origin. Keep API keys, model IDs, and backend limits
on Railway. See [`backend/.env.example`](../backend/.env.example) for the
available settings. This same-origin request path needs no additional CORS
origin on Railway.

After deploying, open `/api/health` on the Vercel domain. Expect
`{"ok":true,"models":true}` when Railway is healthy and its models are configured.
For local work, run Vite and FastAPI as described in [the README](../README.md).
