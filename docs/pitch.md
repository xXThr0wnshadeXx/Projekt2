# Pitch

Four-minute structure from `BUSINESS.md` §11. Issue #36.

**Every number on a slide is either sourced or from our own ledger.** Blanks
below are blanks on purpose — fill them from `proof-log.md` and the eval
reports, and if a blank is still empty on Sunday morning, **cut the line**. Do
not round up, do not estimate, do not say "about a dozen" when the ledger says
four. `BUSINESS.md` §0 rule 6 is the one that matters most here: judges forgive
small numbers and remember invented ones.

---

## The one-liner

> Bring in any math problem — a photo, a screenshot, a scan. Hear its shape,
> work it out loud, hand in typed work. Glance never solves it for you.

## Opening (0:00–0:25)

Lead with the person, not the technology.

> "Math assumes you can see it and write it. A screen reader reads an equation
> one symbol at a time, left to right — so a blind student has to hold the whole
> thing in working memory while a sighted classmate just glances and knows its
> shape. That is a barrier of access, not ability."

If you have a quote with permission, use it here instead of the second
sentence. One real sentence from a real student beats any framing we write.

## The cost of the status quo (0:25–0:45)

| Fact | Say it as |
|---|---|
| Up to **$12,000** for one braille math textbook | sourced, older article — say "historically" |
| Up to **$15,000** for five chapters of a science book | Marketplace, 2017 — say the year |
| **4–5 business days** at Stanford, a well-resourced programme | "even a top programme targets" |
| **75%** of K–12 blind/low-vision students a grade behind in math | **always say "K–12"** |

> "Converting one STEM worksheet has cost thousands and taken weeks. The
> student falls behind while they wait."

## Demo (0:45–2:30)

Runs from `demo-script.md`. One user, one flow, one wow moment.

The wow is the clarifying question. Do not rush it, and do not explain it
before it happens — let the app ask, pause, then explain why asking matters.

## What we learned (2:30–3:10)

The scoreboard. Fill from the ledger; leave out any line you cannot evidence.

| | |
|---|---|
| Interviews completed | ___ (students ___, staff ___, instructors/TVIs ___) |
| Real usage sessions | ___ |
| Sign-ups by role | ___ |
| Follow-ups booked / intros given | ___ |
| Pilot interest in writing | ___ |
| Concierge test | ___ pages in ___ minutes, against ___ days reported |
| Capture accuracy | ___% equivalent-match on slides/typed |
| Ambiguity asked rather than guessed | ___% |
| Cost per page | $___ |

**Say what failed.** If H1–H6 in `BUSINESS.md` §3 did not all pass, name the one
that did not and what we changed because of it. A team that reports a failed
hypothesis is more credible than one that reports six wins.

## Who pays (3:10–3:45)

- Students: **free**, always.
- Buyer: university disability services and alternate-format offices, who
  already pay for conversion in staff time and contractor fees and already miss
  turnaround targets.
- Beachhead: Cal Poly → CSU's 22 campuses → other public universities → K–12
  districts.
- Pricing: **under validation.** Show the formula and the interview data so far.
  Do not quote a number no buyer has reacted to.
- Tailwind: ADA Title II digital accessibility, large institutions' deadline
  April 2027.

## Close (3:45–4:00)

> "Same-day math access, without anyone solving it for them."

---

## Equatio comparison

Texthelp documents that Equatio’s Screenshot Reader can capture inaccessible
math, read it aloud, and copy LaTeX or MathML. Its toolbar also supports spoken
math input and preview. These are overlapping capabilities. [Screenshot Reader demo](https://academy.texthelp.com/equatio/howtos/using-the-screenshot-reader-on-a-website/) · [Equatio tool guide](https://mautic.texthelp.com/asset/603%3Adsa-eq-chrome-ref-guide)

In Glance, the keyboard workflow under test is whole-page capture, focus on
the first recognized line, and numbered confirmation of the student’s own
work. The scratchpad asks which grouping the student intended before saving
ambiguous input. Local browser tests verify focus and confirmation with
mocked model responses. [Capture tests](../tests/e2e/flow.spec.ts) · [Scratchpad tests](../tests/e2e/scratchpad.spec.ts)

### Shared worksheet test

Create one image-only worksheet with the lines `2x + 3 = 11` and
`\frac{\sqrt{x + 1}}{2} = 5`. Use the same image, browser, Mac, and VoiceOver
settings in each trial. Start from a fresh page each time.

1. Capture the worksheet with the keyboard. Record the actions required, the
   first announcement, and whether focus goes to the recognized math.
2. Read and navigate the nested fraction. Record what VoiceOver announces and
   which keys can move between parts.
3. Dictate “x plus one over two”. Record whether the app asks, offers an edit,
   or inserts a specific grouping, and when the line becomes saved work.
4. Save or export the confirmed work in each available format. Record the
   format, any pointer-only step, and elapsed time for the same end point.

The hands-on VoiceOver comparison is pending. Use the documented overlap in
the pitch and reserve comparative claims about speed, keyboard access,
and ambiguity handling until the shared worksheet test is recorded.

## Answers we should have ready

| Question | Answer |
|---|---|
| "Isn't this Equatio?" | See the comparison section above. Lead with the overlap we can source, then the workflow difference. **Until the shared worksheet test is recorded, do not claim an advantage in speed, keyboard access or ambiguity handling** — say we have not tested it yet. A judge who uses Equatio will know if we are guessing. |
| "Why not just use a chatbot?" | They solve the problem, which is not allowed in coursework, and their output is prose — not navigable, verifiable math. We never solve, in any mode. |
| "Isn't this cheating?" | No solve, no hints, no next step, in any mode. Exam mode is transcription only. The student does every line and confirms it. |
| "What if the AI is wrong?" | Low-confidence lines are flagged, every line is read back and confirmed by the student, and a computer algebra system checks what it can. When it cannot, it says so — it never says "wrong", it says it could not confirm. Accuracy numbers from the evals. |
| "How big is this?" | Bottom-up only: named campuses × a price under validation. Never a percentage of a large market. |
| "What does it cost to run?" | Measured per page and per spoken line in the evals. |
| "Braille?" | Nemeth via MathJax and the Speech Rule Engine, through the student's own display. Verified against NVDA's Braille Viewer. Speech and large print are the primary story. |
| "Privacy?" | No accounts, no database, nothing stored server-side. Images and audio are processed and discarded. |
| "What changed your plan this weekend?" | Have a real answer from the ledger. |

## Rules for the room

1. One user story, one wow moment.
2. Personas are "for example" — never implied to be a real person we met.
3. If asked something we did not test, say we did not test it. Then say what we
   would measure in a pilot.
4. Do not oversell the braille. It works, it is verified, it is not the pitch.
