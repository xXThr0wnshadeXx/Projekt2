#!/usr/bin/env bash
# Keep the back end warm during a demo window (issue #34, DESIGN.md 16).
#
#   API=https://<back-end> bash scripts/keep_warm.sh            # every 4 min, 2 hours
#   API=https://<back-end> MINUTES=30 EVERY=120 bash scripts/keep_warm.sh
#
# Each ping hits /api/health and one step check, so the host stays awake and
# the SymPy worker pool stays warm: the first step check in front of a judge
# isn't the one that pays the start-up cost. Ctrl+C to stop. Sends only a fixed
# sample step, never student content. Works with the bash that ships with macOS.

set -u

API="${API:-${1:-}}"
API="${API%/}"
EVERY="${EVERY:-240}"
MINUTES="${MINUTES:-120}"

if [ -z "$API" ]; then
  echo "Usage: API=https://<back-end> bash scripts/keep_warm.sh" >&2
  exit 2
fi

end=$(( $(date +%s) + MINUTES * 60 ))
echo "Keeping $API warm every ${EVERY}s for ${MINUTES} min. Ctrl+C to stop."

while [ "$(date +%s)" -lt "$end" ]; do
  health="$(curl -sS -o /dev/null -w '%{http_code} %{time_total}' --max-time 15 "$API/api/health" 2>/dev/null || echo '000 0')"
  step="$(curl -sS -o /dev/null -w '%{http_code} %{time_total}' --max-time 15 -X POST "$API/api/diff" \
    -H 'Content-Type: application/json' \
    -d '{"from_latex":"2x + 3 = 11","to_latex":"2x = 8","mode":"homework"}' 2>/dev/null || echo '000 0')"
  printf '%s  health %s  step check %s\n' "$(date '+%H:%M:%S')" \
    "$(echo "$health" | awk '{printf "%s %dms", $1, $2*1000}')" \
    "$(echo "$step" | awk '{printf "%s %dms", $1, $2*1000}')"
  case "$health" in 200*) ;; *) printf '          ^ back end not answering — check the host\n' ;; esac
  sleep "$EVERY"
done
echo "Done."
