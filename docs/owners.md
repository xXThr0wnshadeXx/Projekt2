# Who owns what

`DESIGN.md` section 19 describes four roles. We are three people building, plus
one on the board for visibility. This file is the real split, and every open
issue carries exactly one `owner:*` label and one assignee that matches it.

## Owners

| Owner | GitHub | Owns | Issues |
|---|---|---|---|
| Back end and math | `nicolashlam` | FastAPI app and deploy, `mathcheck.py`, `/api/diff`, `/api/summary`, timeouts, mode enforcement in the API, latency, cost logging, CI, request guards | 10 |
| Capture and interpretation | `xXThr0wnshadeXx` | `/api/capture`, `/api/transcribe`, `/api/spoken-to-latex`, `/api/command`, prompts, strict JSON schemas, both eval sets | 7 |
| Front end, accessibility and product | `shreev2703` | Every screen, MathJax and the explorer, recorder, `LiveRegion`, keyboard map, low-vision mode, export, accessibility testing, user research, pitch, submission | 37 |

`tuffling` has writer access to the board for visibility and is not assigned
implementation work.

The front-end and product load is the heaviest by design: it is where the demo
lives, and the pitch cannot be handed to someone who has not watched the
sessions. If it slips behind on Saturday evening, the first things to hand over
are the `area:product` tickets — the interviews and the proof log — because they
are self-contained and do not touch the code.

## The nine blockers

These gate everything else. Nothing in M1 can start until the first four land.

| # | What | Owner |
|---|---|---|
| 2 | Back-end skeleton and deploy | `nicolashlam` |
| 3 | Front-end skeleton and deploy | `shreev2703` |
| 4 | Model and key config | `xXThr0wnshadeXx` |
| 7 | `/api/capture` with strict schema | `xXThr0wnshadeXx` |
| 8 | `mathcheck.parse`, timeouts, validation | `nicolashlam` |
| 9 | Capture screen | `shreev2703` |
| 13 | `LiveRegion` and focus management | `shreev2703` |
| 49 | CI on pull requests | `nicolashlam` |

Issue 5, the go/no-go transcription test, is not a blocker in the dependency
sense but it is the most important thing on Saturday: its result decides whether
handwritten input stays in the demo at all, and every M1 estimate assumes an
answer.

## Standups

Five minutes, board-driven, no status prose. Saturday at 10:00, 14:00, 18:00 and
22:00; Sunday at 08:30.

Each person answers three questions:

1. Which card did I move, and to which column?
2. What is blocking me, and who owns it?
3. Will my next card be done before the next standup? If not, say so now.

At each standup, one person reads the `Todo` column aloud. Anything in
`In Progress` that has not moved since the previous standup gets reassigned or
cut on the spot.

## Cut order

When time runs out, cut from the top of this list, not from accessibility:

1. Everything labelled `P2` (issues 26 and 27)
2. Voice commands (24) and the keyboard help text (25)
3. `.tex` and Nemeth export (23)
4. Step check on the student's own work (20)

Accessibility is never the thing that gets cut. A feature that is not keyboard
and screen-reader operable is not finished, and shipping it anyway would
contradict the entire pitch.

## Rules that are not negotiable

Everyone reads `CONTRIBUTING.md` before their first commit. The short version:
nothing solves, hints, or suggests a next step in any mode; deterministic code
verifies before the model explains; a step that cannot be verified is
"couldn't confirm", never "wrong"; no images, audio or student work are stored
server-side; keys live only in `backend/.env`.
