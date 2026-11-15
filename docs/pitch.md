# Pitch

Glance lets blind and low-vision students understand any page of maths by voice, on their own. It reads the page, helps them grasp its shape and parts, and writes down their work. It never does the work for them.

Four-minute structure from `BUSINESS.md` §11. Issue #36.

**Every number on a slide is either sourced or from our own ledger.** Blanks
below are blanks on purpose — fill them from `proof-log.md` and the eval
reports, and if a blank is still empty on Sunday morning, **cut the line**. Do
not round up, do not estimate, do not say "about a dozen" when the ledger says
four. `BUSINESS.md` §0 rule 6 is the one that matters most here: judges forgive
small numbers and remember invented ones.

---

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
| Up to **$12,000** for one braille math textbook | Historical estimate from [The Chronicle of Higher Education](https://www.chronicle.com/article/purdue-makes-math-and-science-materials-for-the-blind-available-on-line/) |
| Up to **$15,000** for five chapters of a science book | [Marketplace, 2017](https://marketplace.org/2017/10/12/braille-versions-textbooks-help-blind-college-students-succeed) |
| **4–5 business days** at Stanford | In-house target from [Stanford's Office of Accessible Education](https://oae.stanford.edu/faculty-staff/alternate-format-production) |
| **75%** of K–12 blind/low-vision students at least a grade behind in math | [Microsoft / NWEA](https://blogs.microsoft.com/accessibility/making-mathematics-accessible/), K–12 only |

> "When maths arrives as a photo or a scan, the student may have to wait for
> a converted copy before they can start."

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

> "Hear the shape of the worksheet, explore it, and hand in your own work."

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
| "What does it cost to run?" | **Not measured yet** — there is no API credit (#88). We log tokens and cost per request (#44, #76), so `/api/stats` gives cost per page and per spoken line the moment a key is live. Say "we log it per request; numbers once the pilot key is live." |
| "Braille?" | Nemeth output comes from MathJax's Speech Rule Engine. **We have not had it checked by a braille reader yet** — the screen-reader pass is #32. Say that. Speech and large print are the primary story. |
| "Privacy?" | No accounts, no database, nothing stored on our server. Images and audio are **sent to OpenAI to be read**, never stored by us — the Home screen says so. Do not imply they go nowhere. |
| "What changed your plan this weekend?" | Have a real answer from the ledger. |

## Rules for the room

1. One user story, one wow moment.
2. Personas are "for example" — never implied to be a real person we met.
3. If asked something we did not test, say we did not test it. Then say what we
   would measure in a pilot.
4. Do not oversell the braille. It works, it is verified, it is not the pitch.
