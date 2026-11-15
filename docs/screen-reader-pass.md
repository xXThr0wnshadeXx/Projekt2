# Manual screen-reader pass

Issue #32. axe (#31) catches broken markup; it can't tell whether the app
makes sense **by ear**. This is the script for a person to run it.

**Who should run it:** ideally a screen-reader user; otherwise a teammate with
Screen Curtain on, so they can't cheat by looking. Label teammate runs as QA in
the proof log, not as user evidence (DESIGN.md 23).

Run against the deployed link. Log every surprise in the table at the end and
file anything that blocks a flow as an issue right away.

## Setup

| Platform | Turn on | Screen Curtain / no peeking |
|---|---|---|
| macOS + VoiceOver | `Cmd + F5` (or Touch ID ×3) | `VO + Shift + Fn + _` toggles Screen Curtain |
| iPhone + VoiceOver | Settings → Accessibility → VoiceOver | Three-finger triple-tap toggles Screen Curtain |
| Windows + NVDA | Start NVDA | Turn the monitor off; Tools → **Braille Viewer** for the Nemeth check |

Browsers: Safari with VoiceOver, Chrome or Firefox with NVDA. App speech
("Read aloud with the app's own voice" in Settings) stays **off**, or you'll
hear two voices.

## What you should hear

Each step lists what the app announces. Extra screen-reader chatter around it
is fine; **missing, wrong, doubled or confusing** speech is a finding.

### Flow A: blind student, laptop (the main demo)

| # | Do | Should hear (roughly) |
|---|---|---|
| A1 | Open the link | "Glance. Capture a problem, or try the sample." and focus on **Start** |
| A2 | Press `?` | The list of shortcuts for this screen |
| A3 | Activate **Capture a problem**, then `U` and pick the worksheet | "Capture. Upload a file, paste a screenshot, or take a photo." → "Reading your problem…" → the instructions and line count; focus on **Line 1** |
| A4 | `G` | "Working out the structure…" then a sentence about the line's shape, never its answer |
| A5 | `Enter`, arrow keys, `Esc` | Pieces of the equation as you move; `Esc` returns to the line |
| A6 | `N`, `P` | "Line 2 of 2." / "This is the first line." |
| A7 | `S` | "Your work. Record a line, or type one." |
| A8 | Hold `Space`, say "two x equals eight", release | "Recording. Speak your line." → "Working out what you said…" → "I heard: 2 x equals 8. Enter to save, E to edit." |
| A9 | `Enter` | "Saved as line 1." then "This step checks out." (homework mode) |
| A10 | Type "x plus one over two" in the box, press **Add line** | A which-did-you-mean question; `1` or `2` chooses, `Esc` cancels |
| A11 | Type "delete line two" | "Deleted line 2. Press U to undo." |
| A12 | `X`, then **Download accessible HTML** | "Hand in your work…" → "Downloaded math-work-….html." |
| A13 | Open the downloaded file in the browser | Headings, numbered lines, and the math read as math (not "image" or raw LaTeX) |

### Flow B: blind student, iPhone + VoiceOver

Same as A by swipe and double-tap. Check especially:

- The record button is **tap to start, tap to stop** (no hold gesture) and says so
- Nothing needs a gesture VoiceOver already uses
- Every button is reachable by swiping, in a sensible order

### Flow C: low-vision student (no screen reader)

Screen reader off. Settings → turn **on** "Read aloud with the app's own voice".

| # | Do | Should see / hear |
|---|---|---|
| C1 | Open a problem, press `L` | One line, full screen, very large |
| C2 | Arrow keys, `+` / `-`, `T` | Next/previous line, size changes, colour pairing changes; all readable |
| C3 | Zoom the browser to 400% on the problem and scratchpad screens | No content cut off, no sideways scrolling needed to read a line |

### Flow D: paper worksheet by camera (phone)

| # | Do | Should hear |
|---|---|---|
| D1 | Capture → **Take a photo** | "Camera on. Hold the phone about 30 centimetres above the page, then press Take photo." |
| D2 | Take a photo with the bottom of the page cut off | A single spoken instruction to move the phone, and "Try again when you are ready." |

### Braille (NVDA + Braille Viewer)

Explore line 1 of the sample problem and compare the Braille Viewer output with
a Nemeth reference (a TVI, or a Nemeth code reference). Record what you see; we
don't claim Nemeth works until someone qualified has checked it (DESIGN.md 26).

## Findings

| # | Flow / step | Platform | What happened | Expected | Severity (blocks / annoying / minor) | Issue |
|---|---|---|---|---|---|---|
| 1 | | | | | | |

File blockers straight away:

```bash
gh issue create --title "Screen reader: <what broke>" --label "type:bug,area:a11y" --body "Flow/step: …  Platform: …  Heard: …  Expected: …"
```
