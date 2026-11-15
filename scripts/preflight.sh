#!/usr/bin/env bash
# Pre-flight check before a demo (issue #34). Run it 15 minutes before going
# on, and again on the hotspot.
#
#   API=https://<back-end> FRONTEND=https://<front-end> bash scripts/preflight.sh
#
# Optional: STATS_TOKEN=... to print the live latency summary.
#
# Prints one PASS / WARN / FAIL line per check and exits 1 if anything the demo
# depends on is broken. Sends only fixed sample math — no student content.
# Works with the bash that ships with macOS.

set -u

API="${API:-${1:-}}"
FRONTEND="${FRONTEND:-${2:-}}"
API="${API%/}"
FRONTEND="${FRONTEND%/}"

if [ -z "$API" ]; then
  echo "Usage: API=https://<back-end> [FRONTEND=https://<front-end>] bash scripts/preflight.sh" >&2
  exit 2
fi
command -v curl >/dev/null || { echo "curl is required" >&2; exit 2; }

FAILS=0
WARNS=0
pass() { printf '  PASS  %s\n' "$1"; }
warn() { printf '  WARN  %s\n' "$1"; WARNS=$((WARNS + 1)); }
fail() { printf '  FAIL  %s\n' "$1"; FAILS=$((FAILS + 1)); }

# curl wrapper: prints "<status> <seconds>" and leaves the body in $BODY_FILE.
BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT
req() {
  curl -sS -o "$BODY_FILE" -w '%{http_code} %{time_total}' --max-time 15 "$@" 2>/dev/null || echo "000 0"
}
ms() { awk -v s="$1" 'BEGIN { printf "%d", s * 1000 }'; }
body() { cat "$BODY_FILE"; }

echo "Glance pre-flight — $API"
echo

# 1. Health, twice: the second time shows the warm latency.
read -r code secs <<< "$(req "$API/api/health")"
if [ "$code" = "200" ] && body | grep -q '"ok":true'; then
  pass "back end is up ($(ms "$secs") ms first request)"
else
  fail "back end health returned $code — is the deploy running and the URL right?"
fi
read -r code secs <<< "$(req "$API/api/health")"
[ "$code" = "200" ] && [ "$(ms "$secs")" -gt 1500 ] && warn "health is slow when warm ($(ms "$secs") ms) — check the network"

# 2. CORS for the deployed front end, or the browser blocks every call.
if [ -n "$FRONTEND" ]; then
  origin="$(printf '%s' "$FRONTEND" | sed -E 's#^(https?://[^/]+).*#\1#')"
  allowed="$(curl -sS -o /dev/null -D - --max-time 10 -X OPTIONS "$API/api/diff" \
    -H "Origin: $origin" -H 'Access-Control-Request-Method: POST' \
    -H 'Access-Control-Request-Headers: content-type' 2>/dev/null \
    | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin" {print $2}')"
  if [ "$allowed" = "$origin" ]; then
    pass "back end accepts calls from $origin"
  else
    fail "back end does not allow $origin — add it to ALLOWED_ORIGIN on the host"
  fi
else
  warn "FRONTEND not set — skipped the CORS and front-end checks"
fi

# 3. Step check: SymPy, warm, inside the 1.5 s budget (DESIGN.md 16).
read -r code secs <<< "$(req -X POST "$API/api/diff" -H 'Content-Type: application/json' \
  -d '{"from_latex":"2x + 3 = 11","to_latex":"2x = 8","mode":"homework"}')"
if [ "$code" = "200" ] && body | grep -q '"verified":true'; then
  t="$(ms "$secs")"
  if [ "$t" -le 1500 ]; then pass "step check works (${t} ms)"; else warn "step check works but took ${t} ms (budget 1500) — run keep_warm.sh"; fi
else
  fail "step check returned $code: $(body | head -c 200)"
fi
read -r code _ <<< "$(req -X POST "$API/api/diff" -H 'Content-Type: application/json' \
  -d '{"from_latex":"2x = 8","to_latex":"x = 4","mode":"exam"}')"
[ "$code" = "403" ] && pass "exam mode refuses step checks" || fail "exam mode returned $code, expected 403"

# 4. Commands (rules need no model).
read -r code _ <<< "$(req -X POST "$API/api/command" -H 'Content-Type: application/json' \
  -d '{"text":"next line","current_line":"W1","line_count":2}')"
case "$code" in
  200) body | grep -q '"navigate"' && pass "voice commands work" || fail "commands answered oddly: $(body | head -c 200)" ;;
  404) warn "voice commands are not deployed yet (#24)" ;;
  *)   fail "commands returned $code" ;;
esac

# 5. Model-backed routes: registered only when keys are configured.
read -r code _ <<< "$(req -X POST "$API/api/capture")"
case "$code" in
  400) pass "capture is switched on (model keys configured)" ;;
  404) warn "capture is OFF — no model keys on the host; demo with the sample problem" ;;
  429) warn "capture rate-limited right now — wait a minute before demoing" ;;
  *)   fail "capture returned $code" ;;
esac

# 6. Live numbers, if the stats token is available.
if [ -n "${STATS_TOKEN:-}" ]; then
  read -r code _ <<< "$(req "$API/api/stats" -H "X-Stats-Token: $STATS_TOKEN")"
  if [ "$code" = "200" ]; then
    pass "stats reachable"
    body | tr ',' '\n' | grep -E '"p50_ms"|"errors"|cost_per_page' | head -12 | sed 's/^/          /'
  else
    warn "stats returned $code — STATS_TOKEN wrong or not set on the host"
  fi
fi

# 7. Front end serves the app.
if [ -n "$FRONTEND" ]; then
  read -r code secs <<< "$(req "$FRONTEND/")"
  if [ "$code" = "200" ] && body | grep -q '<div id="root">'; then
    t="$(ms "$secs")"
    [ "$t" -le 2000 ] && pass "front end loads (${t} ms)" || warn "front end took ${t} ms (budget 2000)"
  else
    fail "front end returned $code"
  fi
fi

echo
if [ "$FAILS" -gt 0 ]; then
  echo "$FAILS failed, $WARNS warnings. Fix the FAILs, or switch to the backup video (docs/demo-day.md)."
  exit 1
fi
echo "Ready: $WARNS warnings."
