#!/usr/bin/env bash
# Writes the project rules into a local file that whatever editor or tooling you
# use picks up automatically, so it works to this project's rules instead of
# generic defaults.
#
#   bash scripts/local-rules.sh <FILENAME> [MORE...]
#
# The filename is whatever your own setup looks for — check its documentation.
# Example:
#   bash scripts/local-rules.sh SOMEFILE.md
#
# Every file it writes is added to .git/info/exclude, which lives only in your
# clone and is never pushed. Your local setup stays yours; the repository stays
# the same for everyone.
#
# Re-run it after CONTRIBUTING.md or DESIGN.md changes to refresh the copy.

set -euo pipefail
cd "$(dirname "$0")/.."

if [ "$#" -eq 0 ]; then
  echo "Usage: bash scripts/local-rules.sh <FILENAME> [MORE...]" >&2
  echo >&2
  echo "Pass the filename your tooling reads. It will be filled with the" >&2
  echo "project rules and kept out of version control." >&2
  exit 1
fi

[ -f CONTRIBUTING.md ] || { echo "Run this from inside the repository." >&2; exit 1; }

BODY="$(cat <<'RULES'
# Project rules — Glance

Authoritative sources in this repository, in order:

1. `CONTRIBUTING.md` — the rules below, and the review checklist
2. `DESIGN.md` — architecture, API shapes, prompts, keyboard map, screens
3. `docs/owners.md` — who owns which area
4. `docs/BUSINESS.md` — who the users and buyers are, and what we may claim

Read `DESIGN.md` before changing anything. It is not a sketch; the API shapes,
JSON schemas and keyboard map in it are decided.

## What this product is

An accessibility tool for blind, low-vision and motor-impaired students. Math
comes in as a picture (file, screenshot, photo), becomes structured LaTeX, and
is delivered as navigable speech, large print and Nemeth braille. The student
then writes their own work by voice or keyboard, confirms every line, and
exports typed work to hand in.

The people who use this cannot see the screen. A change that looks right but is
not operable by keyboard and screen reader is not finished, it is broken.

## Rules that are never broken

- **Never solve.** No answers, no hints, no next steps, no worked examples, in
  any mode. This is a coursework tool; solving would make it unusable and
  dishonest. If a change would reveal a next step, it does not ship.
- **Never say a step is wrong.** When verification fails the wording is
  "I couldn't confirm this step." A false "wrong" on correct work is worse than
  saying nothing.
- **Deterministic code verifies; the model only interprets and explains.**
  SymPy and the Speech Rule Engine decide what is true. An explanation is
  generated only after SymPy has verified the step it describes.
- **Every model call uses structured outputs** against the strict schemas in
  `backend/app/schemas/`. `additionalProperties` is false and every field is
  required. No free-text parsing of model replies.
- **Transcribe exactly.** Capture never corrects, simplifies, completes or
  solves what is in the image, even when it is visibly wrong. An unclear symbol
  lowers that line's confidence and is explained in `intent_notes`.
- **Ask instead of guessing.** When spoken math is ambiguous about grouping,
  return `ambiguous: true` with two or three alternatives and one short
  question. Guessing silently corrupts the student's own work.
- **Store nothing.** No database, no server-side storage of images, audio or
  student work. Session state lives in the browser.
- **Keys only in `backend/.env`.** Never in code, the front end, logs, commit
  messages or screenshots. A pre-commit hook enforces this.
- **Wrap SymPy** parse, simplify and solveset in a 2-second timeout on a worker
  thread. `parse_latex` is fragile; an unparseable line is marked unsure and
  still rendered, and step checking is skipped for it.
- **No AGPL dependencies.** Every library is credited in `README.md` with its
  licence.

## Accessibility is the product

- Real `<button>`, `<input>`, `<a>` elements, each with an accessible name.
- Fully keyboard operable, visible focus, logical order. Focus moves to new
  results after a capture or a save.
- Every state change is announced through the `LiveRegion` component
  (`aria-live`). One polite region, one assertive.
- The app's own text-to-speech is **off by default** — screen readers already
  read `aria-live`, and two voices at once is unusable. Self-voicing is opt-in
  for people not running a screen reader.
- Touch targets at least 48 px. No custom gestures that fight VoiceOver or
  TalkBack.
- WCAG AA contrast everywhere, AAA in low-vision mode. Works at 400% zoom.
  Honours `prefers-reduced-motion`.
- Exported HTML carries MathML, headings and a `lang` attribute.
- No new axe-core critical or serious violations.

## Modes

| | Study | Homework | Exam |
|---|---|---|---|
| Capture, read, explore | yes | yes | yes |
| Scratchpad and readback | yes | yes | yes |
| Step check on own work | yes, with explanation | "checks out" / "couldn't confirm" | no |
| What changed, on the source | yes | no | no |
| Solve, hint, next step | never | never | never |

Enforced in the interface **and** in the API. `/api/diff` returns 403 in exam
mode. An instructor has to be able to rely on this.

## Stack

Front end: React 18, Vite, TypeScript, Tailwind, MathJax 4 (`frontend/`).
Back end: Python 3.11, FastAPI, SymPy (`backend/`).
Models come from the `MODEL_VISION`, `MODEL_TEXT` and `MODEL_STT` environment
variables — never hardcode a model name.

## How to start working

If you have just been told to start, do this and nothing else first:

```bash
gh issue list --assignee @me --state open --milestone "M0 Setup"
```

Pick the lowest-numbered one carrying the `blocker` label; if none is a
blocker, take the lowest-numbered one. Read the whole issue body — the
acceptance criteria are the specification, and `DESIGN.md` has the detail behind
them. If the issue is not clear, ask the person it is assigned to rather than
guessing at scope.

Then:

```bash
git checkout main && git pull
git checkout -b feat/<issue#>-short-name
```

Work only on that one issue. Do not touch files belonging to another open issue
— placeholder modules name the issue that owns them, and `docs/owners.md` names
the person. Two people editing the same file this weekend costs more time than
the feature is worth.

Before opening a pull request:

```bash
cd backend && python -m pytest ../tests -q
cd ../frontend && npx tsc --noEmit
npx playwright test
```

Then open it against `main` with `Closes #<issue>` in the body, and move the
card on the board to In Review. The board is at
https://github.com/users/shreev2703/projects/3

Scope discipline matters more than usual here: the build window closes Sunday at
12:00 and the cut order is in `docs/owners.md`. Finish one issue completely —
acceptance criteria met, keyboard and screen-reader operable, tests passing —
rather than starting three.

## Working in this repository

- One branch per ticket: `feat/<issue#>-short-name`.
- Small functions. Update pytest for every change to `mathcheck.py`.
- Run `pytest` and `npx playwright test` before opening a pull request.
- Pull requests link their issue (`Closes #<n>`) and get one review.
- Commit messages, branch names and pull request text describe the change —
  what it does and why it matters to the user. No footers, no trailers, nothing
  about how the work got done. A `Co-Authored-By` line is only for a teammate
  who actually worked on the commit.
- Stay inside the performance budget in `DESIGN.md` section 16: capture under
  6 s at p50, a spoken line under 3 s, a step check under 1.5 s.
- Placeholder modules name the issue that implements them. If you are not on
  that issue, leave the file alone and talk to its owner in `docs/owners.md`.
RULES
)"

EXCLUDE=".git/info/exclude"
mkdir -p "$(dirname "$EXCLUDE")"
touch "$EXCLUDE"

for f in "$@"; do
  case "$f" in
    /*|*..*) echo "Refusing an absolute or traversing path: $f" >&2; exit 1 ;;
  esac
  printf '%s\n' "$BODY" > "$f"
  if ! grep -qxF "$f" "$EXCLUDE"; then
    printf '%s\n' "$f" >> "$EXCLUDE"
  fi
  echo "wrote $f  (excluded from version control in this clone)"
done

echo
echo "Re-run this after CONTRIBUTING.md or DESIGN.md changes."
