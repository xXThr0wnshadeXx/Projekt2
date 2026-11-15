# Glance — System Design

> **Math for students who are blind or have low vision.** Bring in any math problem (file, screenshot, photo). Hear its structure, navigate it piece by piece, work it out loud, confirm every line, and hand in clean typed work.

Repo: `xXThr0wnshadeXx/Projekt2` · Team of 4 · Build window: Fri Nov 13, 5 PM → Sun Nov 15, 12 PM

---

## Contents

1. [Problem](#1-problem)
2. [Users and buyers](#2-users-and-buyers)
3. [Positioning vs. existing tools](#3-positioning-vs-existing-tools)
4. [Scope: what we build, what we don't](#4-scope-what-we-build-what-we-dont)
5. [Core user flows](#5-core-user-flows)
6. [Feature spec](#6-feature-spec)
7. [Architecture](#7-architecture)
8. [Tech stack, models, libraries](#8-tech-stack-models-libraries)
9. [API spec](#9-api-spec)
10. [Prompts and JSON schemas](#10-prompts-and-json-schemas)
11. [Math engine](#11-math-engine)
12. [Front end](#12-front-end)
13. [Accessibility requirements](#13-accessibility-requirements)
14. [Modes (reader / exam / homework / study)](#14-modes-reader--exam--homework--study)
15. [Privacy and data](#15-privacy-and-data)
16. [Performance budget](#16-performance-budget)
17. [Repo structure](#17-repo-structure)
18. [Workflow: branches, PRs, board](#18-workflow-branches-prs-board)
19. [Team roles](#19-team-roles)
20. [Milestones and timeline](#20-milestones-and-timeline)
21. [Ticket list](#21-ticket-list)
22. [Testing and evaluation](#22-testing-and-evaluation)
23. [User research and proof](#23-user-research-and-proof)
24. [Business model](#24-business-model)
25. [Pitch and demo](#25-pitch-and-demo)
26. [Q&A prep](#26-qa-prep)
27. [Risks and mitigations](#27-risks-and-mitigations)
28. [Definition of done](#28-definition-of-done)

---

## 1. Problem

Math assumes you can **see** it and **write** it.

- Screen readers read an equation one token at a time, left to right. A sighted reader glances and knows its shape ("a fraction with a root on top"). A blind reader must hold the whole expression in working memory. The barrier is access and cognitive load, not ability.
- In K–12, 75% of students who are blind or low vision are at least one grade behind their peers in math (Microsoft / NWEA research). *Always label this as a K–12 statistic.*
- Most real course math is a **picture**: slide screenshots, scanned PDFs, whiteboard photos, photographed worksheets. Accessibility engines (MathJax, Speech Rule Engine, MathCAT) need **structured** math (MathML/LaTeX) to work.
- Converted materials (accessible/braille formats) take days to weeks.
- Doing the work is its own barrier: no pencil, no scratch paper, and work in braille isn't readable by most instructors.

**Glance closes the loop:** picture → structured math → navigable audio / large print / braille → student's own spoken or typed work, each line confirmed → typed hand-in.

---

## 2. Users and buyers

### Users
| User | Barrier | What Glance provides |
|---|---|---|
| Blind students (screen reader users) | Can't read print math or write by hand | Structure summary, keyboard/gesture navigation, voice scratchpad, typed export |
| Low-vision students | Small/blurry math, long derivations | One-line-at-a-time giant high-contrast view, step-through, optional speech |
| Students with motor/handwriting disabilities | Can't write math by hand | Voice/typed scratchpad, typed export |

**Primary demo user:** a blind or low-vision student doing algebra homework.

### Buyers
- University disability services / alternate-format offices (campus license)
- K–12 districts (teachers of students with visual impairments)
- Students: free

---

## 3. Positioning vs. existing tools

| Tool | Strength | Gap Glance targets |
|---|---|---|
| **Equatio** (Texthelp/Everway) | Screenshot reader, speech input, handwriting, widely licensed by schools | Screenshot reader is region-select (crosshair) — mouse-oriented. An equation editor, not a blind-first workspace. *Verify each gap hands-on before claiming it.* |
| MathJax 4 / Speech Rule Engine / MathCAT | Excellent speech, navigation, Nemeth from structured math | Need structured input; can't read photos/scans |
| General AI chat (image upload) | Reads images, explains | Solves problems (not allowed in coursework); text output isn't navigable math; can misread confidently |
| Be My Eyes / scene description | Describes images | Description ≠ navigable, verifiable math |
| ShareTheBoard | Clean, zoomable whiteboard feed | Visual only |
| Human transcription | Accurate | Days to weeks |

**Our wedge (what we demo):**
1. **Blind-first input** — whole page/screen/photo, no region drawing; spoken retake guidance.
2. **Ambiguity-aware voice math** — asks "did you mean (x+1)/2 or x + ½?" instead of guessing.
3. **Verified steps** — a computer algebra system checks equivalence before anything is explained.
4. **A workspace, not an editor** — the student's own numbered work, confirmed line by line, exported to hand in.
5. **No solving, ever** — modes an instructor can rely on.

---

## 4. Scope: what we build, what we don't

### In scope
- Input: file upload (image/PDF page), paste screenshot, phone camera
- Capture → LaTeX lines with confidence; validation
- Structure summary ("glance"), MathJax explorer navigation, speech, Nemeth braille output
- Low-vision mode
- Voice + typed scratchpad with readback/confirm and ambiguity clarification
- Step check ("what changed?") with CAS verification
- Export: typed PDF, accessible HTML, `.tex`, Nemeth text
- Modes: study / homework / exam

### Out of scope (say so if asked)
- Solving or hinting next steps
- Geometry/graph interaction beyond short descriptions (algebra-first)
- Live whiteboard auto-capture (stretch only)
- Accounts, LMS integrations, server-side storage
- Nemeth/UEB braille *input*

---

## 5. Core user flows

### Flow A — Blind student, laptop + screen reader (primary demo)
1. Opens Glance → screen reader: "Glance. Upload a file. Paste a screenshot. Take a photo."
2. Uploads the worksheet PDF/image (or presses `Ctrl/Cmd+V` after a full-screen screenshot).
3. App announces: "Found 2 lines. Instructions: Solve for x. Line 1: 2x plus 3 equals 11." Focus moves to Line 1.
4. `G` → structure summary. `Enter` → explore inside the equation with arrow keys.
5. `S` → start working. Holds `Space`, says "two x equals eight", releases.
6. App: "Your line 1: 2x equals 8. Save? Enter to save, E to edit." → `Enter`.
7. (Reader mode) App: "Saved as line 1." No check is made.
8. Says "x equals four" → saved → "Saved as line 2."
9. `X` → Export → downloads PDF + accessible HTML → submits on the LMS.

### Flow B — Blind student, iPhone + VoiceOver
- Same flow with swipe/double-tap. Record button is **tap to start / tap to stop** (no hold gesture).
- Announcements go through `aria-live` so VoiceOver speaks them (app's own TTS off by default to avoid double voices).

### Flow C — Low-vision student
- Upload → `L` low-vision mode → one line at a time, giant high-contrast type → arrows to step → optional "read aloud" (app TTS on).

### Flow D — Paper worksheet via camera
- Hold phone ~30 cm above page → Capture (takes 3 frames, keeps sharpest) → if `warnings` returned, speak guidance ("Bottom of the page is cut off. Move the phone down and try again.").

### Flow E — Whiteboard
- Low-vision student aims and captures directly.
- Blind student: a classmate/instructor shares a photo, or a helper places the phone on a stand once (stretch: live board mode).

### Flow F — Ambiguous speech
- Student: "x plus one over two" → app: "Did you mean x plus one, all over two — press 1 — or x plus one half — press 2?" → chosen version saved.

---

## 6. Feature spec

Priorities: **P0** must ship · **P1** should ship · **P2** stretch.

| # | Feature | P | Acceptance criteria |
|---|---|---|---|
| F1 | File upload (jpg/png/webp/pdf ≤ 8 MB) | P0 | Keyboard + screen-reader operable; PDF asks for page number |
| F2 | Paste screenshot | P0 | `Ctrl/Cmd+V` anywhere on Capture screen starts capture |
| F3 | Camera capture | P0 | 3-frame burst, sharpest kept; works on iPhone Safari + Android Chrome |
| F4 | Capture → LaTeX lines | P0 | Lines in reading order with confidence; exact transcription |
| F5 | Validation | P0 | Every line parsed by SymPy + rendered by MathJax; failures marked "unsure" and announced |
| F6 | Retake guidance | P1 | `warnings` turned into one spoken instruction |
| F7 | Structure summary ("glance") | P0 | SRE `summary` output; optional AI rewrite (structure only) |
| F8 | Explore | P0 | MathJax 4 explorer: arrows navigate, speech + braille + magnifier on |
| F9 | Low-vision mode | P0 | One line, adjustable font, 3 high-contrast themes, prev/next |
| F10 | Push-to-talk | P0 | Desktop: hold Space. Mobile: tap start/stop. Safari-compatible audio |
| F11 | Speech → LaTeX + ambiguity | P0 | Unambiguous → readback; ambiguous → clarifying question with numbered choices |
| F12 | Scratchpad | P0 | Numbered lines; confirm/edit/delete/undo; typed input alternative |
| F13 | Step check | P1 | SymPy verifies; explanation only if verified; "couldn't confirm" otherwise |
| F14 | Modes | P1 | Study / homework / exam behavior per §14 |
| F15 | Export | P0 PDF+HTML, P1 .tex+Nemeth | Typed work numbered; HTML export is accessible (MathML) |
| F16 | Voice commands | P1 | Fixed intent set (§9 `/command`) |
| F17 | Keyboard map + spoken help | P1 | `?` speaks shortcuts |
| F18 | Multi-page PDF | P2 | Page navigation by number |
| F19 | Live board mode | P2 | Capture every ~10 s; announce new lines only |

---

## 7. Architecture

```
┌────────────────────────── FRONT END (React + Vite + TS) ──────────────────────────┐
│ Screens: Home · Capture · Problem · Scratchpad · LowVision · Export · Settings     │
│ MathJax 4 (render · explorer · speech · Nemeth · magnifier)                        │
│ LiveRegion (aria-live) · Web Speech API (optional self-voicing) · MediaRecorder    │
│ Session state in memory (+ optional localStorage, try/catch)                       │
└───────────────────────────────┬────────────────────────────────────────────────────┘
                                │ HTTPS JSON / multipart
┌───────────────────────────────▼──────────── BACK END (FastAPI) ────────────────────┐
│ POST /api/capture        image → OpenAI vision (strict JSON) → SymPy validate      │
│ POST /api/transcribe     audio → OpenAI speech-to-text                             │
│ POST /api/spoken-to-latex text → OpenAI (strict JSON) → SymPy validate             │
│ POST /api/command        text → OpenAI intent (enum)                               │
│ POST /api/diff           SymPy equivalence → OpenAI explanation (only if verified) │
│ POST /api/validate       SymPy parse check for a typed line (one boolean, no model)│
│ POST /api/summary        optional structure-only rewrite                           │
│ GET  /api/health                                                                   │
│ No database. No file storage. Timeouts on every external/CAS call.                 │
└───────────────────────────────┬────────────────────────────────────────────────────┘
                                ▼
                          OpenAI API (key server-side only)
```

**Principle:** deterministic code measures and verifies (SymPy, MathJax/SRE); the model interprets and explains; the student confirms.

---

## 8. Tech stack, models, libraries

### Stack
| Layer | Choice |
|---|---|
| Front end | React 18 + Vite + TypeScript, Tailwind CSS |
| Math + a11y | MathJax 4 (includes Speech Rule Engine) |
| Audio | MediaRecorder (webm on Chromium, mp4/aac on Safari), Web Speech API for optional TTS |
| Back end | Python 3.11, FastAPI, Uvicorn, Pydantic |
| CAS | SymPy + `antlr4-python3-runtime` (for `parse_latex`) |
| AI | OpenAI API via `openai` Python SDK, structured outputs |
| Hosting | Vercel (FE), Railway/Render/Fly (BE) — keep-warm before demos |
| Tests | pytest, Playwright + axe-core |

### Models (env-configured; confirm IDs on the account)
| Env var | Job | Notes |
|---|---|---|
| `MODEL_VISION` | Image → LaTeX | Latest GPT vision-capable model; strict JSON schema |
| `MODEL_TEXT` | Speech-text → LaTeX, commands, explanations, summary | Fast tier preferred (latency) |
| `MODEL_STT` | Audio → text | OpenAI transcription model |

### Libraries (credit in README; verify each license)
MathJax (Apache-2.0) · Speech Rule Engine (Apache-2.0) · SymPy (BSD-3) · antlr4-python3-runtime (BSD-3) · FastAPI (MIT) · openai-python (Apache-2.0) · React / Vite (MIT) · Tailwind (MIT) · axe-core (MPL-2.0) · Playwright (Apache-2.0). Reference: MathCAT (DAISY). No AGPL dependencies.

---

## 9. API spec

All endpoints under `/api`, stateless, JSON responses, CORS limited to the front-end origin.

### `POST /api/capture` (multipart)
Fields: `image` (required), `context` (optional string).
```json
{
  "instructions": "Solve for x.",
  "lines": [
    { "id": "L1", "latex": "2x + 3 = 11", "confidence": 0.94, "intent_notes": "", "valid": true }
  ],
  "diagrams": [{ "id": "D1", "description": "Right triangle, legs 3 and 4." }],
  "warnings": []
}
```

### `POST /api/transcribe` (multipart)
Field: `audio` (≤ 30 s). → `{ "text": "two x equals eight" }`

### `POST /api/spoken-to-latex`
Request `{ "text": "...", "context_lines": ["2x + 3 = 11"] }`
```json
{
  "latex": "2x = 8",
  "ambiguous": false,
  "clarifying_question": null,
  "alternatives": [],
  "readback": "2 x equals 8",
  "valid": true
}
```
Ambiguous case: `latex: null`, `ambiguous: true`, question + 2–3 `alternatives` (`{latex, readback}`).

### `POST /api/command`
Request `{ "text": "change the three to a four", "current_line": "W2", "line_count": 3 }`
→ `{ "intent": "edit", "target_line": "W2", "instruction": "replace 3 with 4" }`
Intents: `navigate | read | edit | delete | undo | new_line | check | what_changed | export | help | unknown`.

### `POST /api/diff`
Request `{ "from_latex": "2x + 3 = 11", "to_latex": "2x = 8", "mode": "study" }`
→ `{ "verified": true, "message": "3 was subtracted from both sides." }`
- `homework`: message is "This step checks out." / "I couldn't confirm this step."
- `reader` (the default when `mode` is omitted) and `exam`: `403 MODE_DISABLED`, before any work is done.
- The response has no `method` field; it would tell a client why a step failed. `/api/diff` shares the 20/min model rate bucket.

### `POST /api/validate`
Request `{ "latex": "2x = 8" }` → `{ "valid": true }`

A line typed with ordinary symbols (`2x = 8`, `(x+1)/2 = 5`, "two x equals eight") is read in the
browser by `frontend/src/math/typed.ts` whenever the model route is unavailable, so the student can
always write their work. This route gives that line the same `valid` flag a spoken line carries.
It needs no model key, returns one boolean and nothing else, and words whose grouping is unclear
("x plus one over two") are refused in the browser rather than guessed.

### `POST /api/summary`
`{ "latex": "...", "sre_summary": "..." }` → `{ "summary": "..." }`

### Errors
`{ "error": { "code": "UNPARSEABLE|TIMEOUT|MODEL_ERROR|BAD_INPUT", "message": "..." } }` — front end announces `message`.

---

## 10. Prompts and JSON schemas

All calls: structured outputs, strict schema, temperature 0–0.2. Files live in `backend/app/prompts.py` and `backend/app/schemas/`.

### 10.1 Capture (vision)
```
You transcribe math from images for blind and low-vision students.
- Transcribe EXACTLY. Never correct, simplify, complete, or solve.
- One LaTeX string per math line, reading order.
- Plain-language instructions go in `instructions`.
- Unclear symbol → lower `confidence` for that line and explain in `intent_notes`.
- Resolve ambiguous notation from context; record reasoning in `intent_notes`.
- Diagrams: brief factual description only.
- Framing/quality problems (cut off, blurry, glare) → short, actionable `warnings`
  (e.g., "Bottom of page cut off — move phone down").
- No math → empty `lines`.
```
Schema: `instructions: string`, `lines: [{latex: string, confidence: number, intent_notes: string}]`, `diagrams: [{description: string}]`, `warnings: [string]` — all required, `additionalProperties: false`.

### 10.2 Spoken → LaTeX
```
Convert a student's spoken math into LaTeX.
- Write exactly what was said. Never fix or complete their math.
- If grouping is unclear (fractions, exponents, roots, function application,
  implied multiplication): ambiguous=true, latex=null, 2–3 alternatives with short
  spoken readbacks, ONE short clarifying question.
- Otherwise ambiguous=false and a clear `readback` ("all over", "end exponent").
- Use previous lines only for variable names.
```
Schema: `latex: string|null`, `ambiguous: boolean`, `clarifying_question: string|null`, `alternatives: [{latex, readback}]`, `readback: string|null`.

### 10.3 Command
```
Map the command to exactly one allowed intent:
navigate, read, edit, delete, undo, new_line, check, what_changed, export, help, unknown.
Extract target_line if mentioned, else current_line. For edit, put the change in `instruction`.
```

### 10.4 Step explanation (only after CAS verification)
```
Line A and line B are verified equivalent. In ONE short sentence, name the operation
that turns A into B. No hints, no further steps, no final answer.
```

### 10.5 Summary (optional)
```
Describe only the STRUCTURE of this expression in 1–2 short sentences for a blind listener:
type (equation/expression/inequality), main parts, fractions/roots/exponents/nesting.
Never simplify or solve.
```

---

## 11. Math engine

```python
# backend/app/mathcheck.py
from sympy import simplify, Eq, solveset, S
from sympy.parsing.latex import parse_latex

def parse(latex: str):
    try:
        return parse_latex(latex)
    except Exception as e:
        raise ValueError(f"unparseable: {e}")

def _diff(obj):
    return obj.lhs - obj.rhs if isinstance(obj, Eq) else obj

def steps_equivalent(a_latex: str, b_latex: str) -> tuple[bool, str]:
    a, b = parse(a_latex), parse(b_latex)
    if not isinstance(a, Eq) and not isinstance(b, Eq):
        return (simplify(a - b) == 0, "expr_equal")
    da, db = _diff(a), _diff(b)
    if db == 0:
        return (False, "degenerate")
    ratio = simplify(da / db)
    if not ratio.free_symbols and ratio != 0:
        return (True, "ratio_constant")
    syms = da.free_symbols | db.free_symbols
    if len(syms) == 1:
        x = next(iter(syms))
        if solveset(da, x, S.Reals) == solveset(db, x, S.Reals):
            return (True, "same_solutions")
    return (False, "not_verified")
```

Rules:
- Wrap `parse`, `simplify`, `solveset` in a **2 s timeout** (run in a worker thread/process).
- `not_verified` is never phrased as "wrong" — always "I couldn't confirm this step."
- Inequalities, systems, multi-variable: return `not_verified` (documented limitation).

---

## 12. Front end

### Screens
1. **Home** — Upload a file · Paste a screenshot · Take a photo · Open scratchpad · Settings. Mode badge.
2. **Capture** — input controls, progress announcement ("Reading your problem…"), results summary.
3. **Problem** — instructions + focusable MathJax lines; buttons: Glance · Read all · Low-vision · Start working.
4. **Scratchpad** — problem pinned (collapsible); numbered work lines; Record button; readback bar; clarify dialog; typed input.
5. **Low-vision** — full-screen one line; theme + size controls; prev/next.
6. **Export** — preview; Download PDF · Download accessible HTML · Download .tex · Show Nemeth.
7. **Settings** — mode, self-voicing on/off, speech rate/voice, theme, font size, braille "combine with speech" (NVDA).

### MathJax 4
- Load the default v4 combined component (a11y explorer + speech enabled by default), then set: speech rule set ClearSpeak, braille Nemeth, subtitles on, keyboard magnifier on. *Confirm exact option names against the MathJax v4 docs.*
- After inserting math: `await MathJax.typesetPromise([el])`.
- Nemeth/summary strings for export/glance: SRE via MathJax (`modality: 'braille'` with Nemeth locale; `modality: 'summary'`).

### Keyboard map
| Key | Action |
|---|---|
| `U` / `Ctrl/Cmd+V` / `C` | Upload / paste / camera |
| `G` | Structure summary |
| `R` / `Shift+R` | Read line / read all |
| `N` / `P` | Next / previous line |
| `Enter` on equation | Explore (arrows inside, `Esc` out) |
| `S` | Start working (scratchpad) |
| `Space` (hold) | Push-to-talk (desktop) |
| `Enter` / `E` | Confirm / edit readback |
| `1`–`3` | Pick ambiguity option |
| `W` | What changed? (only when the instructor allows step checks; compares your own lines) |
| `L` | Low-vision mode |
| `X` | Export |
| `?` | Speak help |

Shortcuts are scoped to the current screen. On Capture, `U` uploads and `C`
opens the camera; on Problem, `N` / `P` move between lines and `U` returns to
Capture. In the Scratchpad, `U` undoes a deletion and `P` shows or hides the
source problem. These Scratchpad meanings are intentional: editing the
student's work is the active task there. `?` describes the keys for the
current screen, matching `frontend/src/shortcuts.ts`.

Shortcuts are disabled while focus is in a text field or the MathJax explorer.

### Components
`LiveRegion`, `MathLine`, `RecordButton`, `ReadbackBar`, `ClarifyDialog`, `ModeBadge`, `ExportPreview`, `ThemeProvider`.

---

## 13. Accessibility requirements

- Real `<button>`/`<input>`/`<a>` elements, all with accessible names.
- Full keyboard operation; visible focus; logical order; **focus moves to new results** after capture/save.
- One polite and one assertive `aria-live` region; every state change announced.
- Screen-reader users: announcements via `aria-live`; **app TTS off by default** (self-voicing toggle for non-screen-reader users).
- Touch targets ≥ 48 px; no custom gestures that conflict with VoiceOver/TalkBack.
- Contrast ≥ WCAG AA everywhere, AAA in low-vision mode; works at 400% zoom; honors `prefers-reduced-motion`.
- Exported HTML is accessible (MathML + headings + lang).
- Verified with: VoiceOver (Mac + iPhone, Screen Curtain on), NVDA (+ Braille Viewer), axe-core (zero critical/serious).

---

## 14. Modes (reader / exam / homework / study)

Glance is a reader and scribe. It never solves, so it is safe in exams. Reader and scribe is the default; step checks exist only for students whose instructor turns them on.

| | Reader and scribe (default) | Exam | Homework | Study |
|---|---|---|---|---|
| Capture / read / explore | ✅ | ✅ | ✅ | ✅ |
| Scratchpad + readback | ✅ | ✅ | ✅ | ✅ |
| Word meanings | ✅ | ❌ | ✅ | ✅ |
| Step check on own work | ❌ | ❌ | ✅ "checks out" / "couldn't confirm" | ✅ with explanation |
| One AI review + one hint of the finished work (hand-in screen; never in the file, never sent to the teacher) | ❌ | ❌ | ✅ neutral wording only | ✅ neutral wording only |
| Solve / hint / next step | ❌ never | ❌ never | ❌ never | ❌ never |

Where checks are allowed (homework, study) they cannot hunt for answers: a check only compares a saved work line with the student's own previous work line, never a problem line, and at most 3 checks are allowed per problem (auto and asked-for together; the count survives a reload and resets with a new problem). After that: "I can't check more lines on this problem."

The AI review (`/api/feedback`) uses the same gate: one review and one hint per problem (persisted, cleared with a new problem), never "correct"/"wrong", no answers or next steps; after use: "I can't review this problem again."

Enforced in both UI (controls hidden/disabled) and API (`/diff` and `/api/feedback` return 403 in reader and exam).

---|---|---|---|
| Capture / read / explore | ✅ | ✅ | ✅ |
| Scratchpad + readback | ✅ | ✅ | ✅ |
| Step check on own work | ✅ with explanation | ✅ "checks out" / "couldn't confirm" | ❌ |
| What changed? on source | ✅ | ✅ | ❌ |
| Solve / hint / next step | ❌ never | ❌ never | ❌ never |

Enforced in both UI (controls hidden/disabled) and API (`/diff` returns 403 in exam).

---

## 15. Privacy and data

- No accounts, no database, no server-side storage of images, audio, or work.
- Images/audio are sent to the OpenAI API for processing; one-line notice on Home.
- Session state in browser memory; optional `localStorage` (try/catch).
- Keys only in back-end env vars; `.env` in `.gitignore`; never in screenshots/video.
- User research: no names/disability details recorded without explicit consent; roles only.

---

## 16. Performance budget

| Step | Target (p50) | Hard limit |
|---|---|---|
| Capture (upload → lines announced) | ≤ 6 s | 12 s |
| Spoken line (release → readback) | ≤ 3 s | 6 s |
| Step check | ≤ 1.5 s | 3 s |
| First load (FE) | ≤ 2 s | — |

Tactics: fast text model tier, downscale images client-side (max 1600 px), parallelize validation, announce "Working…" after 1 s, keep back end warm (ping every 5 min during demo windows).

---

## 17. Repo structure

```
Projekt2/
├─ DESIGN.md
├─ README.md
├─ CONTRIBUTING.md
├─ .gitignore
├─ .github/
│  ├─ ISSUE_TEMPLATE/{feature.md,bug.md}
│  └─ pull_request_template.md
├─ frontend/
│  ├─ index.html
│  ├─ package.json · vite.config.ts · tsconfig.json · tailwind.config.js
│  └─ src/
│     ├─ main.tsx · App.tsx · api.ts · state.ts · shortcuts.ts
│     ├─ audio/{recorder.ts,tts.ts}
│     ├─ math/{mathjax.ts,sre.ts}
│     ├─ components/{LiveRegion,MathLine,RecordButton,ReadbackBar,ClarifyDialog,ModeBadge,ExportPreview}.tsx
│     └─ screens/{Home,Capture,Problem,Scratchpad,LowVision,Export,Settings}.tsx
├─ backend/
│  ├─ requirements.txt · .env.example
│  └─ app/
│     ├─ main.py · config.py · errors.py · timeouts.py
│     ├─ openai_client.py · prompts.py · mathcheck.py
│     ├─ schemas/{capture,spoken,command}.json
│     └─ routes/{capture,transcribe,spoken,command,diff,summary}.py
├─ eval/
│  ├─ photos/ · photos_expected.json · spoken.json
│  └─ run_capture_eval.py · run_spoken_eval.py
├─ tests/
│  ├─ test_mathcheck.py · test_routes.py
│  └─ e2e/{a11y.spec.ts,flow.spec.ts}
└─ docs/
   ├─ proof-log.md
   ├─ pitch.md
   └─ demo-script.md
```

---

## 18. Workflow: branches, PRs, board

- **Board columns:** Backlog → Todo → In Progress → In Review → Done.
- **Branches:** `feat/<ticket#>-short-name`, `fix/<ticket#>-...`. Never commit directly to `main` after setup.
- **PRs:** small; link the issue (`Closes #12`); one teammate reviews; CI green (pytest + Playwright smoke) before merge.
- **Commits:** frequent, descriptive. Never rewrite/squash shared history.
- **Labels:** `P0` `P1` `P2` · `area:ai` `area:backend` `area:frontend` `area:a11y` `area:product` · `type:feature` `type:infra` `type:test` `type:docs` `type:bug`.
- **Milestones:** M0 Setup · M1 Core loop · M2 Feature complete · M3 Polish & submit.
- **Standups:** 10:00, 14:00, 18:00, 22:00 Sat; 08:30 Sun — 5 minutes, board-driven.

---

## 19. Team roles

| Role | Owns |
|---|---|
| **AI pipeline** | `/capture`, `/transcribe`, `/spoken-to-latex`, `/command`, prompts, schemas, eval sets |
| **Back end + math** | FastAPI, deploy, timeouts, `mathcheck.py`, `/diff`, `/summary`, modes enforcement, latency |
| **Front end + accessibility** | All screens, MathJax, recorder, LiveRegion, keyboard map, low-vision mode, export, a11y testing |
| **Product + users + pitch** | Outreach, proof log, competitor test (Equatio), business model, pitch, demo video, submission |

---

## 20. Milestones and timeline

| Milestone | Due | Exit criteria |
|---|---|---|
| **M0 Setup** | Sat 14:00 | Repo scaffolded, both services deployed, go/no-go OCR test done, board populated |
| **M1 Core loop** | Sat 18:00 | Upload/paste → lines → explore → summary → low-vision, all by keyboard, deployed |
| **M2 Feature complete** | Sat 23:00 | Voice scratchpad + ambiguity + export + step check + modes; live link stable |
| **M3 Polish & submit** | Sun 11:30 | Evals run, a11y pass, demo video, pitch rehearsed ×3, submission complete |

Key fixed times: Sat 14:00 project link · Sat 19:00 "How Sunday works" · Sat 20:00 Sunday commit (live link) · Sun 10:00 feature freeze · Sun 12:00 submissions close.

---

## 21. Ticket list

(Created on the board by `scripts/setup_board.sh`.)

**M0 Setup**
1. Repo scaffold (folders, README, CONTRIBUTING.md, templates, .gitignore) — infra · P0
2. Back-end skeleton + deploy (`/api/health`, CORS, env config) — backend · P0
3. Front-end skeleton + deploy (Vite/React/Tailwind, MathJax loaded) — frontend · P0
4. Model + key config; confirm model IDs — ai · P0
5. Go/no-go OCR test (10 real images) + latency sample — ai · P0
6. User outreach + proof log — product · P0

**M1 Core loop**
7. `/api/capture` with strict schema — ai · P0
8. `mathcheck.parse` + timeouts + validation in capture — backend · P0
9. Capture screen: upload, paste, camera burst, announcements, focus — frontend · P0
10. Problem screen: MathJax 4 render + explorer + speech/braille config — frontend · a11y · P0
11. Structure summary (SRE summary + optional `/api/summary`) — frontend · ai · P0
12. Low-vision mode — frontend · a11y · P0
13. LiveRegion + focus-management utilities — frontend · a11y · P0
14. Retake guidance from `warnings` — ai · frontend · P1

**M2 Feature complete**
15. `/api/transcribe` — ai · P0
16. Recorder (hold-Space desktop, tap toggle mobile, Safari formats) — frontend · P0
17. `/api/spoken-to-latex` with ambiguity — ai · P0
18. Scratchpad screen (readback, confirm, edit, delete, undo, typed input) — frontend · P0
19. Clarify dialog (numbered choices, keyboard 1–3) — frontend · a11y · P0
20. `/api/diff` step check + explanation — backend · P1
21. Modes (UI + API enforcement) — backend · frontend · P1
22. Export: PDF + accessible HTML — frontend · P0
23. Export: `.tex` + Nemeth — frontend · P1
24. `/api/command` + voice command handling — ai · frontend · P1
25. Keyboard map + spoken help — frontend · a11y · P1
26. Multi-page PDF input — backend · P2
27. Live board mode — frontend · ai · P2

**M3 Polish & submit**
28. `mathcheck` unit tests (20+ cases) — test · P0
29. Capture eval (30 images) + report — test · ai · P0
30. Spoken eval (50 phrases) + report — test · ai · P0
31. Playwright + axe-core a11y tests — test · a11y · P0
32. Manual screen-reader pass (VoiceOver Mac+iPhone, NVDA + Braille Viewer) — a11y · P0
33. Latency measurement + optimization to budget — backend · P1
34. Keep-warm + demo-day reliability (hotspot, backup video) — infra · P0
35. Equatio hands-on comparison + positioning notes — product · P0
36. Pitch script + 3 rehearsals — product · P0
37. Demo video (< 2 min) — product · P0
38. README credits + submission form — product · docs · P0

**Business validation** (details in `docs/BUSINESS.md`)
39. Sign-up page with role field + counter — product · P0 · M1
40. Interview scripts + evidence ledger — product · P0 · M1
41. Run ≥ 5 student + ≥ 2 staff interviews — product · P0 · M2
42. Concierge conversion test + timing — product · P0 · M2
43. Pilot one-pager + written pilot interest — product · P0 · M2
44. Cost + latency logging per request — backend · P1 · M2
45. Bottom-up market sizing sheet — product · P1 · M2
46. Evidence folder redaction pass — product · P1 · M3
47. Pitch scoreboard slide (real numbers only) — product · P0 · M3

---

## 22. Testing and evaluation

- **Unit:** `test_mathcheck.py` — valid steps (subtract, divide, distribute, factor, combine like terms), invalid steps, expression vs equation, unparseable input, timeout path.
- **API:** `test_routes.py` with mocked OpenAI responses (valid, ambiguous, malformed).
- **Capture eval:** 30 images — 10 slides/typed, 10 whiteboard (photographed in build rooms), 5 textbook, 5 handwritten. Metrics: exact line match and SymPy-equivalent match, per category.
- **Spoken eval:** 50 phrases — 35 unambiguous (correct LaTeX rate), 15 ambiguous (asked-instead-of-guessed rate).
- **Latency:** p50/p90 per step against §16.
- **Accessibility:** axe-core on every screen; manual screen-curtain runs of Flows A and B; Nemeth checked in NVDA Braille Viewer.
- **Demo reliability:** 3 full run-throughs on the demo laptop on venue Wi-Fi and on hotspot.

---

## 23. User research and proof

**Targets:** disability services / alternate-format staff; blind and low-vision students (remote sessions fine); students with motor/handwriting disabilities; teachers of students with visual impairments.

**Method:** individual, respectful messages (no list blasts); explain it's a student project; 15-min sessions; collect no sensitive data; log every session in `docs/proof-log.md`:

```
| Date/time | Role (no names w/o consent) | What they tried | What worked | What broke | Quote (with permission) |
```

**Questions for alternate-format staff:** How long does one STEM worksheet take to convert today? What breaks? What do you spend per term? Would you trial this?

**Proof shown to judges:** session count + roles, 1–3 quotes, eval numbers, one before/after (days of conversion vs. seconds + student confirmation).

Teammate eyes-closed testing is QA, not user proof — label it that way.

---

## 24. Business model

- **Free for students.**
- **Campus license** for disability services / alt-format offices; **district license** for K–12.
- **Pricing:** hypothesis — validate against current conversion spend in interviews; don't quote untested numbers.
- **Why switch:** minutes instead of days; works on real materials (photos/scans/screens); two-way (students hand in typed work); no-solve modes instructors can rely on; supports public institutions' ADA Title II digital accessibility work (large-institution deadline April 2027).
- **Unit economics:** measure API cost per capture and per spoken line during evals; report cost per student-hour.
- **Go-to-market:** Cal Poly pilot → CSU campuses → other public universities → K–12 districts.

---

## 25. Pitch and demo

**0:00–0:30 — Who + problem**
"Math assumes you can see the board and hold a pencil. For blind and low-vision students, that's the barrier — not ability. Glance: bring in any math problem, hear its shape, work it out loud, hand in typed work."

**0:30–2:45 — Live demo (one student's flow)**
1. Upload a worksheet (or photo of the room's whiteboard).
2. Structure summary → explore with arrows (subtitles on so judges see speech + braille).
3. Speak "two x equals eight" → readback → save → "Saved as line 1."
4. Say "x plus one over two" → clarifying question → pick 1. *(the wow)*
5. Low-vision mode flip.
6. Export → typed PDF + accessible HTML.
7. "Without the AI, this photo is just 'image' to a screen reader."

**2:45–3:30 — Proof:** sessions, quotes, eval numbers.
**3:30–4:00 — Path to customers:** campus licenses, free for students, Cal Poly → CSU → K–12.

Backup: demo video open in a tab; hotspot ready; back end pinged 5 min before slot.

---

## 26. Q&A prep

| Question | Answer |
|---|---|
| Isn't this Equatio? | Equatio is a strong equation editor with a screenshot reader. Glance is a blind-first workspace: whole-page/photo input without region-drawing, ambiguity-aware voice math, CAS-verified steps, and a confirm-every-line scratchpad that exports hand-in work. *(Use only gaps you verified.)* |
| Why not upload to a chatbot? | Chatbots solve problems — not allowed in coursework — and their text isn't navigable math. Glance never solves, and its output is structured, navigable, verified. |
| Cheating? | No solve/hint in any mode; exam mode is transcription only; step check never gives the next step. |
| Accuracy? | Eval numbers by category; low-confidence lines flagged; every line read back and confirmed. |
| Who pays? | Disability services already pay for conversion and wait days; campus license; free for students. |
| Braille? | Nemeth output via MathJax/SRE through the user's screen reader and braille display; verified in NVDA's Braille Viewer. Speech and large print first. |
| Privacy? | Nothing stored server-side; no accounts; images/audio processed transiently. |
| Geometry? | Algebra-first; diagrams get descriptions today; tactile/sonified graphs are next. |

---

## 27. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Overlap with Equatio | Hands-on comparison (#35); pitch only verified differences |
| No real users | Outreach early; remote sessions; include low-vision/motor users; honest eval numbers |
| OCR errors (handwriting, glare) | Go/no-go test; scope demo to typed/slides/neat board; confidence + readback |
| Latency | Fast models, image downscaling, "Working…" announcement, budget in §16 |
| `parse_latex` fragility | Mark "unsure", still render via MathJax, skip step check for that line |
| False "doesn't match" | Never say "wrong"; say "couldn't confirm" |
| Cold starts | Keep-warm pings; avoid sleeping tiers during judging |
| Safari audio/sharing quirks | Test on real iPhone; format fallbacks; upload as universal path |
| Screen-reader conflicts | `aria-live` first; self-voicing off by default; manual SR passes |
| Inaccessible exported PDF | Also export accessible HTML |
| Braille correctness | Braille Viewer checks against known Nemeth examples; braille not pitched as primary |
| Scope creep | Cut order: P2 → voice commands → .tex/Nemeth export → step check on own work |
| API outage / Wi-Fi | Hotspot; backup video; cached demo inputs |
| Key leak | Server-only env vars; secret scanning; never on screen |

---

## 28. Definition of done

A ticket is done when:
- Acceptance criteria met and demoed to one teammate.
- Keyboard-operable with screen-reader announcements (UI tickets).
- Tests added/updated and passing; no new axe critical/serious issues.
- Merged to `main` via reviewed PR linked to the issue; deployed.
- Board card moved to **Done**.

The project is done when Flows A–D run end to end on the deployed link, evals and proof log are complete, and the pitch has been rehearsed three times.
