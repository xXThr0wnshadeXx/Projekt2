# iPhone check: 15 minutes (issue #154)

Needs a **real iPhone** with Safari on iOS 17 or later. The simulator in CI
cannot answer these: Playwright's WebKit stub hears nothing when "Read aloud" is
on, and MathJax speech for typed lines hangs under the test harness's request
stubs. This page updates the six steps in #154 for the app as it is now.

Run it on the live site, https://glance-shreev2703.vercel.app, or on a preview
deploy of the branch you want to test.

## What depends on an unmerged PR

At the time of writing these are **open, not on `main`**:

| PR | What it changes | Steps affected |
|---|---|---|
| 218 | Reader-and-scribe becomes the default; step checks only if an instructor allows them | 8 |
| 222 | Hand in by voice through the share sheet | 9 |

Steps marked **(needs PR 218)** or **(needs PR 222)** can only pass on a
deploy that contains that PR. On the live site, before it is merged, write
`not on this build` in the result column. That is not a failure. Check which
build you are on by asking the team, or by whether the setting or share button
exists.

Wording below is what the app says per #154 and `docs/screen-reader-pass.md`.
The app's wording may have moved on: "Reading aloud is on. Glance will speak
everything it tells you." is the text on `main` for the Read aloud switch, for
example. If the meaning is right but the words differ, mark `pass` and write
what you heard. A line that is missing, doubled or confusing is a finding.

## Setup (2 minutes)

- Safari, not Chrome. Note the iPhone model and iOS version for the comment.
- Silent switch off; volume up. Headphones are fine.
- Steps 1 to 7 first **without** VoiceOver. Then step 10 repeats them with
  VoiceOver on (Settings, Accessibility, VoiceOver).
- With VoiceOver on, the app's own Read aloud stays **off** (otherwise you hear
  two voices). Step 1 is the exception and is done with VoiceOver off.
- Screen recording (Control Centre) is ideal; start it now.

## Checklist

| # | Do | You should hear or see | Result (pass / fail / not on this build) and what you heard |
|---|---|---|---|
| 1 | Open the site. Turn **Read aloud** on (VoiceOver off) | Spoken: that reading aloud is on | |
| 2 | Open the sample problem | Spoken: "Sample problem", then the instructions and the line count (for example "Solve for x. 2 lines."). The equations are visible | |
| 3 | Go to line 2 and press **Glance** | You hear the **structure** of the line. It must **never solve** or give an answer or hint | |
| 4 | Open the scratchpad. Type `(x+1)/2 = 5` and add the line | You hear a read-back like: "I read: the fraction with numerator x plus 1 and denominator 2 equals 5". Confirm it and hear "Saved as line 1." | |
| 5 | Turn Read aloud **off**. Go to Settings and set text to the **largest** size. Look at each screen | The page does **not scroll sideways** on Home, Problem and Scratchpad | |
| 6 | Make a line ambiguous: type `x plus one over two` and add it | You are asked which you meant. Choosing one saves it | |
| 7 | Use the record button on the scratchpad (VoiceOver off, Read aloud on) | **Tap to start, tap to stop**; no hold gesture. Speech says so. Speak "two x equals eight". It reads back what it heard and asks you to confirm | |
| 8 | **(needs PR 218)** Save a line, then another, in the default mode. Listen for the words "checks out" after every save, in all modes you can reach | The words **"checks out" are never said** in the default mode. You only hear "Saved as line N". If you can switch step checks on, it must be an instructor's setting, not yours. If it is not instructor-allowed, no check is offered | |
| 9 | **(needs PR 222)** Finish a few lines, open **Hand in**, and choose the share sheet | You can hand in **by voice** and send it through the iOS share sheet; the file or message carries **no marks** (no answer-checking text, no extra labels) | |
| 10 | Turn **VoiceOver on** (Read aloud off). Repeat steps 2, 3, 4 and 7 by swipe and double-tap. For step 8 and 9, only if the build has them | Note anything announced **twice**, **not at all**, or in an odd order. Every button reachable by swiping. Nothing needs a gesture VoiceOver already uses | |
| 11 | **First open with VoiceOver on.** Quit Safari, turn VoiceOver on, then open the site fresh | **Does Glance announce itself?** You should hear the app name and what it is, and where focus is, without having to find it. Write down exactly what VoiceOver said first, and how long you waited | |

Order note: do step 11 first if you want a true first-open experience, since
later steps leave the app warm. Run it with a freshly opened tab.

## Comment to post on #154

Copy this, fill it in, post it. Attach the screen recording if you made one.

```
iPhone model: [e.g. iPhone 13]
iOS version: [e.g. 17.5]
Build tested: [live site / preview URL / PR number]

1 Read aloud on: [pass / fail] [what you heard]
2 Sample problem: [pass / fail] [what you heard]
3 Glance on line 2 (structure, never solves): [pass / fail] [what you heard]
4 Typed line (x+1)/2 = 5 read back and saved: [pass / fail] [what you heard]
5 No sideways scroll at largest text: [pass / fail]
6 Ambiguous line question: [pass / fail]
7 Record button tap to start / stop: [pass / fail]
8 No "checks out" by default (needs PR 218): [pass / fail / not on this build]
9 Hand in by voice, share sheet, no marks (needs PR 222): [pass / fail / not on this build]
10 VoiceOver repeat of 2, 3, 4, 7: [pass / fail] [doubled / missing announcements]
11 First open with VoiceOver announces itself: [pass / fail] [first thing said]

Anything else: [text]
Recording: [attached / none]
```

## After you post

- File every fail as its own ticket and link it on #154:

```bash
gh issue create --title "iPhone: <what broke>" --label "type:bug,area:a11y" --body "Step: ...  Model/iOS: ...  Heard: ...  Expected: ..."
```

- Log this as QA (a teammate run) or as user evidence only if a real
  screen-reader user did it themselves with their consent
  (`DESIGN.md` section 23). Do not put it in the ledger as a user session if it
  was a teammate.
