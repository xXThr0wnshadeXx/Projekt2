#!/usr/bin/env bash
# One command, run once per machine, from inside the repository:
#
#   bash scripts/setup.sh
#
# It installs the local git hooks, checks your prerequisites and lists your open
# tickets. It writes no other files unless you ask it to with GLANCE_RULES_FILES
# (see below), and anything it does write is excluded from version control in
# your clone only — nothing new is committed, and the repository stays identical
# for everyone.
#
# Safe to re-run. Do re-run it after CONTRIBUTING.md or DESIGN.md changes.

set -euo pipefail
cd "$(dirname "$0")/.."

[ -f CONTRIBUTING.md ] || { echo "Run this from inside the repository." >&2; exit 1; }

echo "==> Git hooks"
bash scripts/install-hooks.sh

echo
echo "==> Project rules for local tooling"
# Nothing is written unless you ask for it, and nothing is named here. If your
# editor or command-line tooling reads a rules file, create one yourself with
# the filename it expects:
#
#   bash scripts/local-rules.sh <FILENAME>
#
# It fills that file from CONTRIBUTING.md and excludes it from version control
# in your clone only. Set GLANCE_RULES_FILES to have this script do it for you:
#
#   GLANCE_RULES_FILES="FILE_A FILE_B" bash scripts/setup.sh
if [ -n "${GLANCE_RULES_FILES:-}" ]; then
  # shellcheck disable=SC2086
  bash scripts/local-rules.sh $GLANCE_RULES_FILES
else
  echo "    skipped — see scripts/local-rules.sh if your tooling reads a rules file"
fi

echo
echo "==> Checking prerequisites"
miss=0
for c in git gh python node npm; do
  if command -v "$c" >/dev/null 2>&1; then
    printf '    %-7s %s\n' "$c" "$($c --version 2>&1 | head -1)"
  else
    printf '    %-7s MISSING\n' "$c"
    miss=1
  fi
done
if command -v gh >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then
    echo "    gh auth  signed in as $(gh api user --jq .login 2>/dev/null || echo '?')"
  else
    echo "    gh auth  NOT signed in — run: gh auth login"
    miss=1
  fi
fi

echo
echo "==> Your open tickets"
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  gh issue list --assignee @me --state open --limit 10 \
    --json number,title,labels,milestone \
    --jq '.[] | "    #\(.number)  \(.title)  [\(.milestone.title // "no milestone")]\(if ([.labels[].name]|index("blocker")) then "  BLOCKER" else "" end)"' \
    2>/dev/null || echo "    (could not list — check gh auth)"
else
  echo "    (sign in with gh auth login to see these)"
fi

echo
if [ "$miss" -eq 1 ]; then
  echo "Setup finished with something missing above. Fix that first."
else
  echo "Ready. Read issue #57, then start your lowest-numbered blocker."
fi
echo "Board: https://github.com/users/shreev2703/projects/3"
