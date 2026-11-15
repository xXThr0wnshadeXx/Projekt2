# Back end during the demo

## Is it up?

```bash
curl -s "$API/api/health"          # {"ok":true,"models":true}  (models false = no key: typing and step checks only)
bash scripts/preflight.sh          # every check the demo depends on
```

Before and during a demo, follow `docs/demo-day.md`.

## Live logs: one place

Railway → the back-end service → **Deployments → View logs** (live tail). Each request is one JSON line:

```
{"evt":"request","path":"/api/diff","method":"POST","status":200,"ms":23.1,"error":null,"model":null,"tokens_in":0,"tokens_out":0,"cost_usd":null}
```

Filter for failures by searching `"error":"` in the log view. Codes are the §9 ones:
`TIMEOUT`, `MODEL_ERROR`, `UNPARSEABLE`, `BAD_INPUT`, `RATE_LIMITED`, `MODE_DISABLED`, `INTERNAL`.

Never in the logs: request bodies, query strings, images, audio, LaTeX, transcripts, IPs.
The uvicorn access log is off (`--no-access-log`) because it prints full URLs.

## Live numbers

Set `STATS_TOKEN` in the host's variables, then:

```bash
curl -s -H "X-Stats-Token: $STATS_TOKEN" "$API/api/stats" | python -m json.tool
```

Per endpoint over the last 2,000 requests: count, errors, p50/p90 ms (successful requests only), tokens, and cost.
Plus the last 50 log records. The window resets when the server restarts.
