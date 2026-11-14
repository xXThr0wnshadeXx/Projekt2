#!/usr/bin/env bash
# One command, run once per machine, from inside the repository:
#
#   bash scripts/setup.sh
#
# It installs the local git hooks and writes the project rules into the files
# that editors and command-line tooling look for, so your setup follows this
# project's conventions instead of generic defaults. Every file it writes is
# excluded from version control in your clone only — nothing new is committed,
# and the repository stays identical for everyone.
#
# Safe to re-run. Do re-run it after CONTRIBUTING.md or DESIGN.md changes.

set -euo pipefail
cd "$(dirname "$0")/.."

[ -f CONTRIBUTING.md ] || { echo "Run this from inside the repository." >&2; exit 1; }

echo "==> Git hooks"
bash scripts/install-hooks.sh

echo
echo "==> Project rules for local tooling"
# Common filenames across editors and CLI tooling. Harmless if your setup only
# reads one of them; add your own to this list if it reads something else.
bash scripts/local-rules.sh \
  AGENTS.md \
  CLAUDE.md \
  .cursorrules \
  .github/copilot-instructions.md \
  .windsurfrules

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
