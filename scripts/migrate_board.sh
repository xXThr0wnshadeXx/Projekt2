#!/usr/bin/env bash
# Moves the Glance board under the repository owner's account so it can be
# linked to the repository. GitHub only links a user-owned project to repos
# owned by that same user, which is why the first board could not be linked.
#
# Run this as the REPOSITORY OWNER (xXThr0wnshadeXx):
#   gh auth login
#   gh auth refresh -s project,read:org
#   bash scripts/migrate_board.sh
#
# Idempotent: re-running adds only what is missing. It does not delete the old
# board — archive that by hand once this one looks right.

set -euo pipefail

# Git Bash on Windows rewrites a leading "/" into a Windows path, which turns
# a title like "/api/capture" into "C:/Program Files/Git/api/capture".
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

REPO="${REPO:-xXThr0wnshadeXx/Projekt2}"
OWNER="${OWNER:-${REPO%%/*}}"
TITLE="${PROJECT_TITLE:-Glance}"
TEAM="${TEAM:-shreev2703 nicolashlam tuffling}"

command -v gh >/dev/null || { echo "Install the GitHub CLI: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Run: gh auth login"; exit 1; }

ME="$(gh api user --jq '.login')"
if [ "$ME" != "$OWNER" ]; then
  echo "You are signed in as '$ME' but this script must run as '$OWNER'."
  echo "Only the repository owner can create a project that links to $REPO."
  exit 1
fi

echo "==> Finding or creating the project"
NUM="$(gh project list --owner "$OWNER" --format json \
        --jq ".projects[] | select(.title == \"$TITLE\") | .number" 2>/dev/null | head -1 || true)"
if [ -z "$NUM" ]; then
  NUM="$(gh project create --owner "$OWNER" --title "$TITLE" --format json --jq '.number')"
  echo "    created project #$NUM"
else
  echo "    reusing existing project #$NUM"
fi

PID="$(gh project view "$NUM" --owner "$OWNER" --format json --jq '.id')"

echo "==> Linking to $REPO"
if gh project link "$NUM" --owner "$OWNER" --repo "$REPO" >/dev/null 2>&1; then
  echo "    linked"
else
  echo "    link failed — check that you have admin on $REPO"
fi

echo "==> Making it visible to the team"
gh project edit "$NUM" --owner "$OWNER" --visibility PUBLIC >/dev/null 2>&1 \
  && echo "    visibility: public" || echo "    could not change visibility"

COLLAB=""
for u in $TEAM; do
  ID="$(gh api "users/$u" --jq '.node_id' 2>/dev/null || true)"
  if [ -n "$ID" ]; then
    COLLAB="$COLLAB{userId: \"$ID\", role: WRITER}"
    echo "    writer: $u"
  else
    echo "    skipped (no such user): $u"
  fi
done
if [ -n "$COLLAB" ]; then
  gh api graphql -f query="
    mutation {
      updateProjectV2Collaborators(input: {
        projectId: \"$PID\"
        collaborators: [$COLLAB]
      }) { clientMutationId }
    }" >/dev/null 2>&1 && echo "    collaborators updated" || echo "    could not update collaborators"
fi

echo "==> Status columns (DESIGN.md 18: Backlog -> Todo -> In Progress -> In Review -> Done)"
FID="$(gh project field-list "$NUM" --owner "$OWNER" --format json 2>/dev/null       | python -c 'import json,sys
try:
    d = json.load(sys.stdin)
except Exception:
    raise SystemExit(0)
for f in d.get("fields", []):
    if f.get("name") == "Status":
        print(f.get("id", ""))
        break' 2>/dev/null || true)"
if [ -n "$FID" ]; then
  gh api graphql -f query="
    mutation {
      updateProjectV2Field(input: {
        fieldId: \"$FID\"
        singleSelectOptions: [
          {name: \"Backlog\",     color: GRAY,   description: \"Not started, not this milestone\"}
          {name: \"Todo\",        color: BLUE,   description: \"Ready to pick up\"}
          {name: \"In Progress\", color: YELLOW, description: \"Someone is on it now\"}
          {name: \"In Review\",   color: ORANGE, description: \"PR open, waiting on a reviewer\"}
          {name: \"Done\",        color: GREEN,  description: \"Merged, deployed, acceptance met\"}
        ]
      }) { clientMutationId }
    }" >/dev/null 2>&1 && echo "    columns set" || echo "    could not set columns (set them in the UI)"
else
  echo "    no Status field found — set the columns in the UI"
fi

echo "==> Adding every open issue"
gh project item-list "$NUM" --owner "$OWNER" --limit 500 --format json \
  --jq '.items[].content.number // empty' 2>/dev/null | sort -n > /tmp/glance_onboard.txt || : > /tmp/glance_onboard.txt

ADDED=0; SKIPPED=0; FAILED=0
while read -r n; do
  [ -z "$n" ] && continue
  if grep -qx "$n" /tmp/glance_onboard.txt 2>/dev/null; then
    SKIPPED=$((SKIPPED+1)); continue
  fi
  if gh project item-add "$NUM" --owner "$OWNER" \
       --url "https://github.com/$REPO/issues/$n" >/dev/null 2>&1; then
    ADDED=$((ADDED+1))
  else
    echo "    failed: #$n"; FAILED=$((FAILED+1))
  fi
done < <(gh issue list --repo "$REPO" --state open --limit 500 --json number --jq '.[].number' | sort -n)

TOTAL="$(gh project item-list "$NUM" --owner "$OWNER" --limit 500 --format json --jq '.items | length')"
echo
echo "==> Done"
echo "    added $ADDED, already present $SKIPPED, failed $FAILED"
echo "    $TOTAL cards on the board"
echo "    https://github.com/users/$OWNER/projects/$NUM"
echo
echo "Next: archive the old board at https://github.com/users/shreev2703/projects/3"
echo "once this one looks right, so nobody works from the wrong one."
