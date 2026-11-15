# Deployed API latency

Measured on 2026-11-15 from 01:49:50 to 01:50:20 PST (UTC−08:00) from an Apple Silicon Mac (arm64, macOS 26.6.2) on Wi-Fi. One run against the production Railway API used the defaults of [`scripts/latency.py`](../scripts/latency.py) at `3104e9a`.

The capture input was a typed PNG with `2x + 3 = 11` and `(sqrt(x+1))/2 = 5`. The audio input was a 1.29-second synthesized recording of “Two x equals eight.” Step checks used the script’s fixed pairs.

## Results

Step check, capture and spoken-line API timings all met the p50 and hard limits in [DESIGN.md §16](../DESIGN.md#16-performance-budget), including their first requests. Every request succeeded. The benchmark ends at the API response. Browser rendering, announcements and first page load were outside this run. Health also met the script's 300 ms p50 target.

| Route | Attempts | Timed samples | p50 (ms) | p95 (ms) | Max (ms) | First (ms) | §16 p50 (ms) | §16 hard limit (ms) | Result |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Health (`/api/health`) | 31 | 30 | 66 | 134 | 146 | 165 | — | — | No §16 target |
| Step check (`/api/diff`) | 31 | 30 | 106 | 155 | 186 | 122 | 1,500 | 3,000 | Met both |
| Capture (`/api/capture`) | 6 | 5 | 1,176 | 1,363 | 1,363 | 1,461 | 6,000 | 12,000 | Met both |
| Spoken line (`/api/transcribe → /api/spoken-to-latex`) | 6 | 5 | 1,821 | 1,916 | 1,916 | 2,613 | 3,000 | 6,000 | Met both |
| Transcription (`/api/transcribe`) | 6 | 5 | 822 | 1,024 | 1,024 | 1,680 | — | — | Included in spoken line |

The first attempt is shown separately and excluded from p50, p95 and max. The p95 uses the script’s nearest-rank method on the same samples used for its p90. Transcription is timed inside each spoken-line attempt, so this row adds no requests. Times are reported to the nearest millisecond.

## First load

Measured separately on 2026-11-15 with `--frontend https://glance-shreev2703.vercel.app` and no image, audio or text, so no model calls were made. The same machine and Wi-Fi as above.

| Step | Runs | p50 (ms) | p90 (ms) | Max (ms) | First (ms) | Target p50 (ms) | Result |
|---|---:|---:|---:|---:|---:|---:|---|
| First load (`GET /` on Vercel) | 5 | 53 | 150 | 150 | 94 | 2,000 | Met |

This times fetching the HTML page only, with `Cache-Control: no-cache`. It does not include downloading the JavaScript, loading MathJax from its CDN or rendering the first equation, so it is a lower bound on what a student waits for. A browser-measured time to the first readable equation is still open (#55).

## Raw output

```text
Latency against `https://glance-api-production-e9997db1.up.railway.app` (ms; first request excluded from p50/p90)

| Step | Runs | p50 | p90 | Max | First | Target p50 | Hard limit | Errors | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| health | 30 | 66 | 128 | 146 | 165 | 300 | — | 0 | ok |
| step_check | 30 | 106 | 141 | 186 | 122 | 1,500 | 3,000 | 0 | ok |
| capture | 5 | 1,176 | 1,363 | 1,363 | 1,461 | 6,000 | 12,000 | 0 | ok |
| spoken_line | 5 | 1,821 | 1,916 | 1,916 | 2,613 | 3,000 | 6,000 | 0 | ok |
| first_load | — | — | — | — | — | 2,000 | — | — | skipped: no --frontend |
```
