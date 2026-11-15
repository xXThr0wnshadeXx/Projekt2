# Glance

**Math you can hear and speak.** Bring in any math problem — a file, a screenshot, a photo of a whiteboard — hear its structure, navigate it piece by piece, work it out loud, confirm every line, and hand in clean typed work.

---

## The problem

Math assumes you can see it and write it.

A screen reader reads an equation one token at a time, left to right. A sighted reader glances at it and immediately knows its shape — "a fraction with a root on top." A blind reader has to hold the whole expression in working memory. The barrier is access and cognitive load, not ability.

Most real course math is a picture: slide screenshots, scanned PDFs, whiteboard photos, photographed worksheets. The excellent open-source engines that make math accessible — MathJax, Speech Rule Engine, MathCAT — all need *structured* math (MathML or LaTeX) to work. Converted and braille materials take days to weeks to produce, and historically cost thousands of dollars per textbook.

Doing the work is its own barrier: no pencil, no scratch paper, and work written in braille isn't readable by most instructors.

## Who it's for

| User | Barrier | What Glance provides |
|---|---|---|
| Blind students using a screen reader | Can't read print math or write by hand | Structure summary, keyboard navigation inside equations, voice scratchpad, typed export |
| Low-vision students | Small or blurry math, long derivations | One line at a time, giant high-contrast type, step-through, optional speech |
| Students with motor or handwriting disabilities | Can't write math by hand | Voice or typed scratchpad, typed export |

## What it does

Picture → structured math → navigable audio, large print and braille → the student's own spoken or typed work, each line confirmed → typed hand-in.

- **Capture** — upload a file, paste a screenshot, or photograph the page. No region-drawing with a mouse; the whole page goes in. Poor framing comes back as spoken guidance.
- **Glance** — hear the *structure* of an expression before its contents, then explore inside it with arrow keys, with speech, Nemeth braille and a keyboard magnifier.
- **Low-vision mode** — one line full-screen, adjustable size, high-contrast themes.
- **Scratchpad** — speak or type each step. Every line is read back and confirmed before it's saved. When speech is genuinely ambiguous, Glance asks ("did you mean *x + 1, all over 2*, or *x plus one half*?") instead of guessing.
- **Verified steps** — a computer algebra system checks that your step follows from the last one before anything is said about it. A step that can't be verified is reported as "couldn't confirm," never as "wrong."
- **Export** — numbered typed work as PDF, accessible HTML (with MathML), `.tex`, or Nemeth.

### It never solves anything

No answers, no hints, no next steps, in any mode. Study, homework and exam modes change what's available, and exam mode is transcription only. This is enforced in the interface *and* in the API, so an instructor can rely on it.

## How it's built

Deterministic code measures and verifies; the model interprets and explains; the student confirms every line.

| Layer | Choice |
|---|---|
| Front end | React + Vite + TypeScript, Tailwind CSS |
| Math and accessibility | MathJax 4 (includes Speech Rule Engine) |
| Audio | MediaRecorder, Web Speech API for optional self-voicing |
| Back end | Python 3.11, FastAPI, Uvicorn, Pydantic |
| Computer algebra | SymPy |
| Transcription and interpretation | OpenAI API, structured outputs with strict schemas |
| Tests | pytest, Playwright, axe-core |

There is no database and no server-side storage of images, audio or student work. API keys live only in back-end environment variables.

See [`DESIGN.md`](DESIGN.md) for the full system design, [`CONTRIBUTING.md`](CONTRIBUTING.md) for the rules every change follows, and [`docs/BUSINESS.md`](docs/BUSINESS.md) for the validation plan.

## Accessibility

Accessibility is the product, not a feature of it.

- Full keyboard operation, visible focus, focus moved to new results
- Every state change announced through an `aria-live` region
- App text-to-speech off by default, so it doesn't talk over a screen reader
- Touch targets at least 48 px, no gestures that conflict with VoiceOver or TalkBack
- WCAG AA contrast throughout, AAA in low-vision mode, usable at 400% zoom
- Exported HTML is accessible: MathML, headings, language attributes
- Verified with VoiceOver (macOS and iOS, Screen Curtain on), NVDA with its Braille Viewer, and axe-core

## Running it locally

Works on macOS and Windows. The app itself is a web app, so once it is running
you can open it from either, and from a phone on the same network.

### Before anything else: Python 3.11

The back end pins **Python 3.11** (`backend/.python-version`). This is not a
preference — `pydantic==2.10.4` has no wheels for 3.13 or newer, so on a newer
interpreter `pip install` fails and the app will not even import. macOS with a
Homebrew Python and a fresh Windows install are both commonly on 3.13+.

Check first:

```bash
python --version
```

If it is not 3.11, the quickest way to get one without touching your system
Python is [`uv`](https://docs.astral.sh/uv/):

```bash
uv python install 3.11
uv venv --python 3.11 .venv
```

### macOS

```bash
bash scripts/setup.sh
```

```bash
cd backend
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then add the API key and model IDs
uvicorn app.main:app --reload
```

```bash
cd frontend && npm install && npm run dev
```

### Windows

The shell scripts in `scripts/` are bash and need **Git Bash** — they will not
run in PowerShell or cmd. Git Bash ships with [Git for Windows](https://git-scm.com/download/win).

In Git Bash:

```bash
bash scripts/setup.sh
```

Back end, in PowerShell or Git Bash:

```bash
cd backend
py -3.11 -m venv .venv
.venv/Scripts/activate      # PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env        # then add the API key and model IDs
uvicorn app.main:app --reload
```

```bash
cd frontend && npm install && npm run dev
```

### Without an API key

The back end starts fine without model credentials — it just does not register
the capture, transcribe and spoken-to-latex routes. `/api/health` and
`/api/diff` still work, and in the app **Try a sample problem** gives you the
glance, the explorer and low-vision mode. Useful for front-end work, and it is
the demo fallback if the key is not set in time.

### Demoing from an iPhone

Flow B is iPhone plus VoiceOver, so it is worth opening on a real phone at
least once before the demo.

1. Start the front end so it listens beyond localhost:

   ```bash
   cd frontend && npm run dev -- --host
   ```

2. Vite prints a **Network:** address — open that on the phone, on the same
   Wi-Fi.
3. The phone must also be able to reach the back end, so set
   `VITE_API_BASE` to the machine's network address, not `localhost`, and add
   that front-end origin to the back end's `ALLOWED_ORIGIN`.

Camera and microphone need a secure context: Safari allows them on
`localhost`, but over the network it wants HTTPS. The simplest way around that
for a demo is to point the phone at the **deployed** front end instead of a
laptop dev server.

Required back-end environment variables are listed in `backend/.env.example`.
Never commit a real `.env`.

## Project board

Labels, milestones, tickets and the project board are created by:

```bash
gh auth login
gh auth refresh -s project
bash scripts/setup_board.sh
```

Workflow, branch naming and review rules are in [`DESIGN.md`](DESIGN.md) §18.

## Privacy

No accounts and no database. Images and audio are sent to the OpenAI API for processing and are not stored by Glance. Session state lives in the browser. In user research we record roles, not names, and no disability details without explicit consent.

## Credits and licences

Glance is built on open-source work by people who have been making math accessible for far longer than this project has existed.

| Project | Licence |
|---|---|
| [MathJax](https://www.mathjax.org/) | Apache-2.0 |
| [Speech Rule Engine](https://github.com/zorkow/speech-rule-engine) | Apache-2.0 |
| [SymPy](https://www.sympy.org/) | BSD-3-Clause |
| [antlr4-python3-runtime](https://www.antlr.org/) | BSD-3-Clause |
| [FastAPI](https://fastapi.tiangolo.com/) | MIT |
| [Uvicorn](https://www.uvicorn.org/) | BSD-3-Clause |
| [Pydantic](https://docs.pydantic.dev/) | MIT |
| [openai-python](https://github.com/openai/openai-python) | Apache-2.0 |
| [PyAV](https://github.com/PyAV-Org/PyAV) | BSD-3-Clause |
| [FFmpeg](https://ffmpeg.org/legal.html) (bundled by PyAV) | LGPL/GPL, depending on build |
| [pypdfium2](https://github.com/pypdfium2-team/pypdfium2) | BSD-3-Clause / Apache-2.0 |
| [PDFium](https://pdfium.googlesource.com/pdfium/) (bundled by pypdfium2) | BSD-3-Clause |
| [Pillow](https://python-pillow.github.io/) | MIT-CMU |
| [React](https://react.dev/) | MIT |
| [Vite](https://vite.dev/) | MIT |
| [Tailwind CSS](https://tailwindcss.com/) | MIT |
| [axe-core](https://github.com/dequelabs/axe-core) | MPL-2.0 |
| [Playwright](https://playwright.dev/) | Apache-2.0 |
| [pytest](https://pytest.org/) | MIT |

[MathCAT](https://nsoiffer.github.io/MathCAT/) (DAISY Consortium) was a reference for math speech and braille behaviour.

Statistics quoted in the pitch and in `docs/BUSINESS.md` are sourced there individually.

## Licence

GNU General Public License v3.0 — see [`LICENSE`](LICENSE).
