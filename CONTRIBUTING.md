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

```bash
bash scripts/install-hooks.sh
```

Everyone runs this on every machine they commit from. It points `core.hooksPath`
at `.githooks`, which checks each commit message locally before it lands.

Commit messages, branch names and pull request text describe **the change** —
what it does and why it matters to the user. They do not name editors, tools or
assistants, and they carry no attribution trailers; the `Commit hygiene`
workflow fails the pull request if any slip through. If a commit is already
wrong, fix it with `git commit --amend` (last commit) or `git rebase -i`
(earlier ones) before opening the pull request.
