#!/usr/bin/env bash
# Creates labels, milestones, all tickets, and a GitHub Project board for Glance.
# Usage:
#   gh auth login                      # once
#   gh auth refresh -s project         # once, grants Projects permission
#   bash scripts/setup_board.sh
# Safe to re-run for labels (uses --force). Re-running will duplicate issues.

set -euo pipefail

REPO="${REPO:-xXThr0wnshadeXx/Projekt2}"
OWNER="${PROJECT_OWNER:-${REPO%%/*}}"
PROJECT_TITLE="${PROJECT_TITLE:-Glance}"

command -v gh >/dev/null || { echo "Install GitHub CLI: https://cli.github.com"; exit 1; }
gh auth status >/dev/null || { echo "Run: gh auth login"; exit 1; }

echo "==> Labels"
lbl() { gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force >/dev/null; }
lbl "P0" "b60205" "Must ship"
lbl "P1" "d93f0b" "Should ship"
lbl "P2" "fbca04" "Stretch"
lbl "area:ai" "5319e7" "Prompts, models, evals"
lbl "area:backend" "1d76db" "FastAPI, SymPy, deploy"
lbl "area:frontend" "0e8a16" "React, MathJax, UI"
lbl "area:a11y" "006b75" "Accessibility"
lbl "area:product" "c5def5" "Users, pitch, submission"
lbl "type:feature" "a2eeef" "Feature"
lbl "type:infra" "bfdadc" "Setup / deploy"
lbl "type:test" "f9d0c4" "Tests / evals"
lbl "type:docs" "e4e669" "Docs"
lbl "type:bug" "ee0701" "Bug"

echo "==> Milestones"
ms() {
  gh api "repos/$REPO/milestones" -f title="$1" -f due_on="$2" -f description="$3" >/dev/null 2>&1 \
    || echo "   (milestone '$1' may already exist)"
}
M0="M0 Setup"; M1="M1 Core loop"; M2="M2 Feature complete"; M3="M3 Polish & submit"
ms "$M0" "2026-11-14T22:00:00Z" "Sat 2:00 PM PT — scaffold, deploys, go/no-go, board"
ms "$M1" "2026-11-15T02:00:00Z" "Sat 6:00 PM PT — capture → explore → summary → low-vision"
ms "$M2" "2026-11-15T07:00:00Z" "Sat 11:00 PM PT — scratchpad, ambiguity, export, step check, modes"
ms "$M3" "2026-11-15T19:30:00Z" "Sun 11:30 AM PT — evals, a11y pass, video, pitch, submission"

echo "==> Project board"
PROJECT_NUMBER="$(gh project create --owner "$OWNER" --title "$PROJECT_TITLE" --format json --jq '.number' 2>/dev/null || true)"
if [[ -n "${PROJECT_NUMBER}" ]]; then
  gh project link "$PROJECT_NUMBER" --owner "$OWNER" --repo "$REPO" >/dev/null 2>&1 || true
  echo "   Project #$PROJECT_NUMBER created and linked"
else
  echo "   Could not create project (run: gh auth refresh -s project). Issues will still be created."
fi

issue() {
  # $1 title, $2 labels (comma-separated), $3 milestone, $4 body
  local url
  url="$(gh issue create --repo "$REPO" --title "$1" --label "$2" --milestone "$3" --body "$4")"
  echo "   $url"
  if [[ -n "${PROJECT_NUMBER}" ]]; then
    gh project item-add "$PROJECT_NUMBER" --owner "$OWNER" --url "$url" >/dev/null 2>&1 || true
  fi
}

DOD=$'\n\n**Definition of done:** acceptance criteria met · keyboard + screen-reader operable (UI) · tests pass · reviewed PR `Closes #` · deployed · card in Done.\nSee `DESIGN.md`.'

echo "==> Issues: $M0"
issue "Repo scaffold" "P0,type:infra" "$M0" $'Set up folders per DESIGN.md §17, README, CONTRIBUTING.md, .gitignore (incl. .env), issue/PR templates.\n\n**Acceptance**\n- [ ] Structure matches §17\n- [ ] `.env` ignored, `.env.example` present\n- [ ] Templates in `.github/`'"$DOD"
issue "Back-end skeleton + deploy" "P0,area:backend,type:infra" "$M0" $'FastAPI app with `/api/health`, CORS (front-end origin only), env config, error format (§9). Deploy to Railway/Render/Fly.\n\n**Acceptance**\n- [ ] Public `/api/health` returns `{ok:true}`\n- [ ] Env vars: OPENAI_API_KEY, MODEL_VISION, MODEL_TEXT, MODEL_STT, ALLOWED_ORIGIN'"$DOD"
issue "Front-end skeleton + deploy" "P0,area:frontend,type:infra" "$M0" $'Vite + React + TS + Tailwind; MathJax 4 loaded; LiveRegion stub; deploy to Vercel; `api.ts` points at back end.\n\n**Acceptance**\n- [ ] Deployed URL renders a test equation with MathJax explorer working by keyboard'"$DOD"
issue "Model + API key config" "P0,area:ai,type:infra" "$M0" $'Confirm available model IDs for vision, text, STT; wire `openai_client.py` with structured outputs.\n\n**Acceptance**\n- [ ] One successful structured call per model from the deployed back end'"$DOD"
issue "Go/no-go OCR test (10 images) + latency sample" "P0,area:ai,type:test" "$M0" $'Run 10 real images (3 slides, 3 whiteboard, 2 textbook, 2 handwritten) through capture prompt. Record accuracy + time per call in `eval/notes.md`.\n\n**Acceptance**\n- [ ] Results table committed\n- [ ] Decision recorded: handwriting in or out of demo scope'"$DOD"
issue "User outreach + proof log" "P0,area:product" "$M0" $'Individual messages to disability services/alt-format staff, blind & low-vision students, motor-impaired students, TVIs. Create `docs/proof-log.md` (§23 format).\n\n**Acceptance**\n- [ ] ≥ 10 individual messages sent\n- [ ] ≥ 2 sessions scheduled'"$DOD"

echo "==> Issues: $M1"
issue "/api/capture with strict schema" "P0,area:ai,type:feature" "$M1" $'Image → OpenAI vision with capture schema (§10.1). Client downscale to 1600px max.\n\n**Acceptance**\n- [ ] Returns §9 shape\n- [ ] Never corrects/solves (tested on an image with a deliberate error)\n- [ ] p50 ≤ 6 s'"$DOD"
issue "mathcheck.parse + timeouts + validation" "P0,area:backend,type:feature" "$M1" $'Implement `parse`, 2 s timeouts, mark `valid` on capture lines (§11).\n\n**Acceptance**\n- [ ] Unparseable → `valid:false`, not a crash\n- [ ] Timeout path returns TIMEOUT error'"$DOD"
issue "Capture screen: upload, paste, camera, announcements, focus" "P0,area:frontend,area:a11y,type:feature" "$M1" $'Upload (image/PDF page), Ctrl/Cmd+V paste, camera 3-frame burst (keep sharpest). Announce "Reading your problem…" then results; move focus to Line 1.\n\n**Acceptance**\n- [ ] All three inputs work by keyboard and VoiceOver\n- [ ] Works on iPhone Safari + desktop Chrome'"$DOD"
issue "Problem screen: MathJax render + explorer + speech/braille" "P0,area:frontend,area:a11y,type:feature" "$M1" $'Focusable lines; explorer on; ClearSpeak; Nemeth; subtitles; keyboard magnifier (§12).\n\n**Acceptance**\n- [ ] Arrow navigation inside equations announces sub-expressions\n- [ ] Braille subtitles visible'"$DOD"
issue "Structure summary (glance)" "P0,area:frontend,area:ai,type:feature" "$M1" $'SRE `summary` modality; optional `/api/summary` rewrite (structure only).\n\n**Acceptance**\n- [ ] `G` speaks structure for current line\n- [ ] Never includes solving'"$DOD"
issue "Low-vision mode" "P0,area:frontend,area:a11y,type:feature" "$M1" $'Full-screen one line, adjustable size, 3 high-contrast themes, prev/next, optional self-voicing.\n\n**Acceptance**\n- [ ] AAA contrast\n- [ ] Works at 400% zoom'"$DOD"
issue "LiveRegion + focus-management utilities" "P0,area:frontend,area:a11y,type:feature" "$M1" $'Polite + assertive regions; `announce()` helper; `focusFirst()` after results; self-voicing off by default.\n\n**Acceptance**\n- [ ] No double voices with VoiceOver on'"$DOD"
issue "Retake guidance from warnings" "P1,area:ai,area:frontend,type:feature" "$M1" $'Turn capture `warnings` into one spoken, actionable instruction.\n\n**Acceptance**\n- [ ] Cut-off and blur cases produce correct guidance'"$DOD"

echo "==> Issues: $M2"
issue "/api/transcribe" "P0,area:ai,type:feature" "$M2" $'Audio (webm or mp4/aac) → text via STT model. ≤ 30 s clips.\n\n**Acceptance**\n- [ ] Works with Safari and Chrome recordings'"$DOD"
issue "Recorder: hold-Space desktop, tap toggle mobile" "P0,area:frontend,area:a11y,type:feature" "$M2" $'MediaRecorder with format fallback; RecordButton announces state; no gestures that conflict with VoiceOver.\n\n**Acceptance**\n- [ ] Desktop hold-Space works\n- [ ] iPhone tap start/stop works with VoiceOver'"$DOD"
issue "/api/spoken-to-latex with ambiguity" "P0,area:ai,type:feature" "$M2" $'Schema §10.2; SymPy validation of result.\n\n**Acceptance**\n- [ ] "x plus one over two" → ambiguous with 2 alternatives\n- [ ] Unambiguous phrases return readback\n- [ ] p50 end-to-end spoken line ≤ 3 s'"$DOD"
issue "Scratchpad screen" "P0,area:frontend,area:a11y,type:feature" "$M2" $'Numbered work lines; readback bar (Enter save / E edit); delete; undo; typed input alternative; problem pinned.\n\n**Acceptance**\n- [ ] Full Flow A by keyboard + screen reader'"$DOD"
issue "Clarify dialog (numbered choices)" "P0,area:frontend,area:a11y,type:feature" "$M2" $'Accessible dialog; keys 1–3; focus trapped and restored.\n\n**Acceptance**\n- [ ] VoiceOver reads question + options; selection saves the chosen LaTeX'"$DOD"
issue "/api/diff step check + explanation" "P1,area:backend,type:feature" "$M2" $'SymPy `steps_equivalent`; explanation only if verified; mode-aware messages; exam → 403.\n\n**Acceptance**\n- [ ] Never says "wrong"; uses "couldn\x27t confirm"'"$DOD"
issue "Modes: study / homework / exam" "P1,area:backend,area:frontend,type:feature" "$M2" $'Settings toggle; UI hides/disables per §14; API enforces.\n\n**Acceptance**\n- [ ] Exam mode: no step check, no what-changed (UI + API)'"$DOD"
issue "Export: PDF + accessible HTML" "P0,area:frontend,type:feature" "$M2" $'Numbered typed work; print-to-PDF; accessible HTML with MathML, headings, lang.\n\n**Acceptance**\n- [ ] HTML passes axe with no critical issues'"$DOD"
issue "Export: .tex + Nemeth" "P1,area:frontend,type:feature" "$M2" $'Download `.tex`; show/download Nemeth via SRE.\n\n**Acceptance**\n- [ ] Nemeth matches Braille Viewer output for sample lines'"$DOD"
issue "/api/command + voice commands" "P1,area:ai,area:frontend,type:feature" "$M2" $'Intent enum (§9); handlers for navigate/read/edit/delete/undo/check/export/help.\n\n**Acceptance**\n- [ ] Unknown commands say "I didn\x27t catch that"'"$DOD"
issue "Keyboard map + spoken help" "P1,area:frontend,area:a11y,type:feature" "$M2" $'Shortcuts per §12; disabled in text fields; `?` speaks help.'"$DOD"
issue "Multi-page PDF input" "P2,area:backend,type:feature" "$M2" $'Page count + page selection by number.'"$DOD"
issue "Live board mode" "P2,area:frontend,area:ai,type:feature" "$M2" $'Capture every ~10 s; announce only new lines. Stretch only.'"$DOD"

echo "==> Issues: $M3"
issue "mathcheck unit tests (20+ cases)" "P0,area:backend,type:test" "$M3" $'Valid/invalid steps, expr vs eq, unparseable, timeout (§22).'"$DOD"
issue "Capture eval (30 images) + report" "P0,area:ai,type:test" "$M3" $'Run `eval/run_capture_eval.py`; exact + equivalent match by category; commit report.'"$DOD"
issue "Spoken eval (50 phrases) + report" "P0,area:ai,type:test" "$M3" $'35 unambiguous, 15 ambiguous; correct rate + asked-instead-of-guessed rate.'"$DOD"
issue "Playwright + axe-core a11y tests" "P0,area:a11y,type:test" "$M3" $'Every screen; zero critical/serious violations.'"$DOD"
issue "Manual screen-reader pass" "P0,area:a11y,type:test" "$M3" $'VoiceOver Mac + iPhone (Screen Curtain on), NVDA + Braille Viewer; run Flows A–D; log issues.'"$DOD"
issue "Latency measurement + optimization" "P1,area:backend,type:feature" "$M3" $'Measure p50/p90 per §16; optimize to budget.'"$DOD"
issue "Keep-warm + demo reliability" "P0,type:infra" "$M3" $'Keep-warm pings during demo windows; hotspot test; backup video tab; cached demo inputs.'"$DOD"
issue "Equatio hands-on comparison" "P0,area:product" "$M3" $'Use Equatio trial with VoiceOver on the same worksheet; document verified differences in `docs/pitch.md`.'"$DOD"
issue "Pitch script + 3 rehearsals" "P0,area:product,type:docs" "$M3" $'`docs/pitch.md` + `docs/demo-script.md`; 4-minute timing; Q&A drills (§26).'"$DOD"
issue "Demo video (< 2 min)" "P0,area:product" "$M3" $'Unlisted link, no login, no keys on screen; shows Flow A + ambiguity moment.'"$DOD"
issue "README credits + submission" "P0,area:product,type:docs" "$M3" $'Credits + licenses, description (problem, user, what we built), live link, repo link, form submitted before 12:00.'"$DOD"

echo "==> Issues: business validation (docs/BUSINESS.md)"
issue "Sign-up page with role field + counter" "P0,area:product,type:feature" "$M1" $'Email, role (student / disability-services staff / instructor / TVI / other), free-text pain question. Shared one-to-one only.\n\n**Acceptance**\n- [ ] Live by Sat evening\n- [ ] Sign-up counts by role visible for the pitch'"$DOD"
issue "Interview scripts + evidence ledger" "P0,area:product,type:docs" "$M1" $'Scripts A/B/C from BUSINESS.md §4; `docs/proof-log.md` with §6 columns; `docs/evidence/` folder.\n\n**Acceptance**\n- [ ] Every teammate has the scripts\n- [ ] Ledger template committed'"$DOD"
issue "Run ≥5 student + ≥2 staff interviews" "P0,area:product" "$M2" $'Mom Test rules: last-time stories, no pitch until the end, ask for intros. Log within the hour.\n\n**Acceptance**\n- [ ] H1–H4 results recorded against thresholds (BUSINESS.md §3)'"$DOD"
issue "Concierge conversion test + timing" "P0,area:product,type:test" "$M2" $'Convert a real worksheet/slide for a student or office with Glance; teammate double-checks; time end to end vs. their usual turnaround.\n\n**Acceptance**\n- [ ] Pages, minutes, and their reported usual days logged'"$DOD"
issue "Pilot one-pager + written pilot interest" "P0,area:product,type:docs" "$M2" $'BUSINESS.md §9 plan; send to disability office/instructor; ask for a short written reply.\n\n**Acceptance**\n- [ ] One-pager in `docs/pilot.md`\n- [ ] Response (or follow-up meeting) logged'"$DOD"
issue "Cost + latency logging per request" "P1,area:backend,type:feature" "$M2" $'Log tokens, $ and ms per capture / spoken line (no content stored).\n\n**Acceptance**\n- [ ] Cost per page and per spoken line reported for unit economics'"$DOD"
issue "Bottom-up market sizing sheet" "P1,area:product,type:docs" "$M2" $'Named buyer counts × price (validated or marked hypothesis), every input sourced.\n\n**Acceptance**\n- [ ] Sheet in `docs/market.md` with sources'"$DOD"
issue "Evidence folder redaction pass" "P1,area:product" "$M3" $'Screenshots of sign-ups, LOI emails, session notes with personal info removed; permissions confirmed for any quote.'"$DOD"
issue "Pitch scoreboard slide (real numbers only)" "P0,area:product,type:docs" "$M3" $'Interviews, sessions, sign-ups, follow-ups, pilot interest, concierge timing, eval accuracy, cost per page.\n\n**Acceptance**\n- [ ] Every number traceable to the ledger or evals'"$DOD"

echo "==> Done."
[[ -n "${PROJECT_NUMBER}" ]] && echo "Board: https://github.com/users/$OWNER/projects/$PROJECT_NUMBER (or orgs/$OWNER/projects/$PROJECT_NUMBER)"
