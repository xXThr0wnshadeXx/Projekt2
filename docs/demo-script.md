# Demo script

The exact run for the live demo. Issue #36.

Written against what is actually built and merged, not against the plan. Where
a step in `DESIGN.md` §25 does not exist yet, it says so rather than being
rehearsed into the script and discovered live.

**Before you start, read [Known gaps](#known-gaps).** Two of them change what
you can show.

---

## Setup, ten minutes before the slot

| | |
|---|---|
| Back end warm | `curl -s https://<domain>/api/health` → `{"ok":true}`. Do this 5 minutes before, and again right before walking up. |
| Model key set | Capture and voice need `OPENAI_API_KEY` in the Railway dashboard (#4). **Without it those routes are not registered at all** — the app still loads and the sample problem still works. |
| Backup video | Open in a second tab, already loaded, muted, ready to play. |
| Hotspot | On and tested. Do not trust venue Wi-Fi. |
| Browser | One window, no other tabs visible, bookmarks bar off. Zoom at 100%. |
| Screen reader | VoiceOver on, Screen Curtain **off** for judges (they need to see), speech audible to the room. |
| Fresh state | Open the deployed link in a private window, or the last run's problem is still cached and "Back to your problem" appears on Home. |

Have the worksheet image on the desktop, ready to drag. Do not hunt for a file
in front of judges.

---

## The run — four minutes

### 0:00–0:25 · Who and what

> "Math assumes you can see it and write it. For a blind student that is the
> barrier — not ability. This is Glance: bring in any math problem, hear its
> shape, work it out loud, hand in typed work."

Nothing on screen but the app's Home. Let VoiceOver read it: *"Glance. Capture
a problem, or try the sample."*

### 0:25–0:45 · The cost of today

> "Converting one STEM worksheet has historically cost thousands of dollars and
> taken weeks. Even a top programme targets four to five business days. The
> student falls behind while they wait."

Sources are in `BUSINESS.md` §2. **Say the K–12 qualifier** on the 75% figure if
you use it.

### 0:45–2:30 · The demo

Upload the worksheet. Press nothing while it reads — let the announcement do
the work:

> *"Reading your problem…"* → *"Found 2 lines. Solve for x. Line 1: 2 x plus 3
> equals 11."*

Focus lands on Line 1 by itself. Say that out loud — it is the part sighted
people do not notice:

> "Notice it moved me to the first line. I did not have to go looking."

Then, in order:

| Key | What to say |
|---|---|
| `G` | "This is the glance. Before reading a single symbol, I know its shape." |
| `N` | Move to line 2, the fraction with a root on top. |
| `G` | *"This is an equation, with a left side and a right side. It contains 1 fraction and 1 square root, nested."* — "That is the sentence a sighted reader gets for free." |
| `Enter` | Explore. Arrow keys walk inside the expression. Subtitles are on, so judges see speech and braille. |
| `Esc` | Back out to the line. |
| `S` | Start working. |

Now the student's own work. Hold `Space`, say **"two x equals eight"**, release.

> *"I heard: 2 x equals 8. Enter to save, E to edit."* → press `Enter` →
> *"Saved as line 1."*

> "Nothing is saved until I confirm it. The model does not get the last word —
> I do."

**Then the moment.** Hold `Space`, say **"x plus one over two"**.

> *"Did you mean x plus one, all over two, or x plus one half?"*

Stop talking. Let it sit for a beat.

> "That is two different expressions, and speech cannot tell them apart. A tool
> that guesses is worse than useless for homework, because I cannot see what it
> chose. So it asks."

Press `2`. It goes to the readback, you confirm.

It then confirms the step:

> *"This step checks out."*

> "A computer algebra system checked that. It did not solve anything — it
> checked that what I wrote follows from the line above. And if it cannot tell,
> it says it could not confirm. It never tells me I am wrong."

`L` for low-vision mode. `+` a few times, `T` once to flip the pairing.

> "Same problem, no screen reader, for the much larger group who have some
> sight."

`Escape` back. Then, **only if export is on the deployed build** (see
[Known gaps](#known-gaps)), open it from the scratchpad:

> "And this is the part that closes the loop — my own work, typed, as
> accessible HTML with real MathML in it. My instructor opens it like any other
> file, and a blind student can still read and navigate it. That is a hand-in,
> not a screenshot."

### 2:30–3:10 · Proof

Scoreboard from `proof-log.md` and the eval reports. **Real numbers only.** If a
number is not in the ledger, do not say it. If a hypothesis failed, say it
failed and what changed — `BUSINESS.md` §3 is explicit that judges reward that.

### 3:10–3:45 · Who pays

Disability services and alternate-format offices. Free for students. Cal Poly →
CSU's 22 campuses → other public universities. Pilot plan in `docs/pilot.md`.

### 3:45–4:00 · Close

> "Same-day math access, without anyone solving it for them."

---

## Known gaps

Read these before rehearsing, because two of them change the script.

1. **Export is written but check it is on `main` before you rehearse it.**
   #96 built it — accessible HTML with real MathML, print-to-PDF, `.tex` and
   Nemeth — but that pull request merged into a branch that had already been
   merged, so the work was stranded. #107 brings it onto `main` and is waiting
   on a review. **Open the deployed link and look for the export control.** If
   it is there, close the demo on the hand-in as `DESIGN.md` §25 step 6
   intends, and show the HTML rather than only the PDF — the point is that an
   instructor opens it and a blind student can still read and navigate the
   math. If it is not there, close on the ambiguity moment instead.
2. **Capture and voice need the API key** (#4). Without it those routes are not
   registered. The sample problem, glance, explore and low-vision mode all work
   regardless, so a key failure is survivable: switch to "Try a sample problem"
   and keep going. Know this path cold.
3. **The step check works now** (#92). After you save a line in homework mode
   you get "This step checks out." In study mode it names the operation. In
   exam mode it is off — in the interface *and* at the server, which is the
   thing an instructor is actually relying on. Say that out loud if a judge
   asks about cheating; it is a stronger answer than a promise.
4. **Handwriting is out of demo scope** unless the go/no-go test (#5) says
   otherwise. Use typed or clean printed material.

## If something breaks

| | |
|---|---|
| Capture hangs | It cannot hang for long — model calls are bounded at 10 s for capture, 4 s for a spoken line. You will get an error, not a freeze. Say "that is the venue Wi-Fi", switch to the sample, carry on. |
| A line comes back "unsure" | **Do not apologise.** Say "it flagged that it could not check that line — it does not pretend." That is the product working. |
| Nothing is announced | VoiceOver lost focus. Click once on the page body, press `Tab`. |
| Total failure | Backup video tab. Keep talking over it; do not restart the app in front of judges. |

## Rehearse

Three full runs on the demo laptop, one of them on the hotspot, one of them with
the back end deliberately unreachable so the fallback is muscle memory (#55).
