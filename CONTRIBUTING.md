# Contributing — Glance

Read `DESIGN.md` before making changes. Business and validation context is in `docs/BUSINESS.md`.
These rules are not negotiable — they are what makes the product trustworthy for the students who use it.

## Product
Accessibility app for blind, low-vision, and motor-impaired students: bring in math (file, screenshot, photo) → structured LaTeX → navigable speech / large print / braille → voice or typed scratchpad with every line confirmed → typed hand-in export.

## Hard rules
- Never add a feature that solves problems, gives answers, or suggests next steps — in any mode.
- Every model call uses structured outputs with the JSON schemas in `backend/app/schemas/`.
- Deterministic code (SymPy, MathJax/Speech Rule Engine) verifies; the model only interprets and explains. Explanations are generated only after SymPy verifies a step.
- Never say a step is "wrong" — say "I couldn't confirm this step."
- Never store images, audio, or student work server-side. No database.
- API keys only in `backend/.env`. Never in code, the front end, logs, or screenshots.
- Wrap SymPy parse/simplify/solveset in a 2-second timeout.
- No AGPL dependencies. Credit every library in README.

## Accessibility (UI changes)
- Real `<button>`/`<input>`/`<a>` elements with accessible names.
- Fully keyboard-operable; visible focus; move focus to new results.
- Announce every state change through the `LiveRegion` component (`aria-live`).
- App text-to-speech is off by default (screen readers speak `aria-live`); self-voicing is opt-in.
- Touch targets ≥ 48 px; no custom gestures that conflict with VoiceOver/TalkBack.
- No new axe-core critical/serious violations.

## Stack
- Front end: React + Vite + TypeScript + Tailwind, MathJax 4 (`frontend/`).
- Back end: Python 3.11, FastAPI, SymPy, `openai` SDK (`backend/`).
- Models via env vars: `MODEL_VISION`, `MODEL_TEXT`, `MODEL_STT`.

## Conventions
- Branch per ticket: `feat/<issue#>-short-name`; PR with `Closes #<issue>`.
- Small functions; add/update pytest for every `mathcheck.py` change.
- Run `pytest` and `npx playwright test` before opening a PR.
- Keep responses within the performance budget in `DESIGN.md` §16.

## First thing after cloning

One command, once per machine, from inside the repository:

```bash
bash scripts/setup.sh
```

It installs the git hooks, checks you have the prerequisites, and lists your open
tickets. It writes nothing else into your working copy.

If your editor or command-line tooling reads a project rules file, create one
yourself with the filename it expects:

```bash
bash scripts/local-rules.sh <FILENAME>
```

That fills the file from this page and excludes it from version control in your
clone only, so it never reaches the repository. Re-run it after this file or
`DESIGN.md` changes.

Then read issue #57 and start your lowest-numbered `blocker`.

### What the hooks do

```bash
bash scripts/install-hooks.sh
```

Everyone runs this on every machine they commit from. It points `core.hooksPath`
at `.githooks`. Two checks run locally: `pre-commit` refuses a staged
credential or env file, and `commit-msg` checks the message shape.

Commit messages, branch names and pull request text describe **the change** —
what it does, and why it matters to the user. No footers, no trailers, nothing
about how the work got done. A `Co-Authored-By` line is for a teammate who
actually worked on the commit with you. The `Commit hygiene` workflow is the
backstop; if it flags something, fix it with `git commit --amend` for the last
commit or `git rebase -i` for earlier ones before opening the pull request.
