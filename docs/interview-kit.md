# Interview kit (issues #40, #41)

One page per session. Print it or keep it open beside the call. Acceptance for
#41: at least 5 student and at least 2 staff interviews, with **H1 to H4
recorded against their thresholds** (`BUSINESS.md` section 3).

Scripts live in `BUSINESS.md` section 4. The question lists are quoted below so
you can read them in the call; if the two ever differ, `BUSINESS.md` wins and
this file should be fixed.

A teammate with Screen Curtain on is QA, not user evidence. Do not log
teammates as interviewees (`DESIGN.md` section 23).

---

## 1. Before the session (5 minutes)

- [ ] Pick the script: **A** blind/low-vision student (15 min), **B**
  alternate-format coordinator (15 min), **C** instructor or TVI (10 min).
  Motor-impaired students: use A, and swap questions 1-3 to ask about how they
  write math work and who scribes for them.
- [ ] Open [proof-log.md](proof-log.md) so you can write straight after.
- [ ] Do not open the Glance demo. It is for the last two minutes only, and only
  if they are curious.

**Consent line (say it, then wait for a yes):**

> "Thanks for making time. I am a student on a hackathon team. This is not a
> sales call, and nothing you say obliges you to anything. I will take notes
> about what you tell me, and I will log your role, not your name. You can skip
> any question or stop whenever you like. Is that okay?"

**Recording permission (separate question; default is no recording):**

> "Is it all right if I record the audio so that I get your words right? I will
> delete it after I write up my notes, and I will not share it. If you would
> rather I did not, I will just take notes."

- If they say no, do not record. Handwritten or typed notes only.
- Quote permission is asked **at the end** (section 3), per quote.
- Do not ask about disability details. If they offer, ask whether you may note
  it; if unsure, leave it out.

## 2. During the session: Mom Test rules

1. Ask about **the last time** it happened, not what they would do.
2. Do not mention Glance until the last two minutes.
3. Ask "why?" and "what happened next?" Keep digging on specifics: dates, pages,
   hours, who helped.
4. Compliments and "I would use that" are noise. Do not write them as signal.
5. Stay quiet after a question. Let silence do the work.
6. Do not offer solutions or correct how they do things.
7. Finish with: **"Who else should I talk to?"** An introduction is signal.
8. Keep to time. Note the clock at the start and at the end.

### Script A: blind / low-vision student (15 min)

1. Tell me about the last math or science assignment you did. What format did it come in?
2. Walk me through how you read it. What happened when you got to the equations or diagrams?
3. How long did it take from getting the assignment to being able to actually work on it?
4. What do you do today when the material isn't accessible? Who helps? What does that cost you: time, grades, asking favors?
5. How do you write out your work and turn it in? What's the hardest part?
6. Have you tried any tools for this? What did you like or hate?
7. If you could change one thing about how math reaches you, what would it be?
8. (Last 2 minutes, optional) Show the 60-second demo. What would stop you from using this?
9. Who else should I talk to?

### Script B: alternate-format / accessibility coordinator (15 min)

1. How does a STEM course material request get handled today, from request to delivery?
2. Tell me about the last math-heavy request. How many pages? How long did it take? Who did the work?
3. Roughly what does that cost (staff hours, contractor fees) per worksheet, per course, per term?
4. Where does it break: handwriting, slides, last-minute handouts, exams?
5. What tools do you use now? What do they not do?
6. What would have to be true for you to trust a tool's output for a student?
7. How do you buy software like this: who approves it, what budget, how long does it take?
8. (Last 3 minutes) Demo. Would you be open to a free pilot next term with one course? What would success look like?
9. Who else should I talk to?

### Script C: instructor / TVI (10 min)

1. When a student needs accessible math in your course, what happens?
2. How do you receive work from students who can't hand-write it?
3. Would a typed export of the student's own steps work for grading? What would worry you?

## 3. After the session (log within the hour)

1. Write one row in [proof-log.md](proof-log.md) using the section 6 columns:
   `# | Date/time | Segment | Role (no names w/o consent) | Channel | Key story (their words) | Time/$ figure | Workaround | Signal type | Follow-up | Permission to quote`.
2. Use only their words and only numbers they gave. If they did not give a
   figure, write `none given`. Never fill in a plausible number.
3. Signal type is one of: `story`, `$/time figure`, `workaround`, `signup`,
   `follow-up booked`, `intro given`, `LOI`, `session completed`. A row can
   list more than one.
4. **Permission to quote:** ask before you hang up, "May I quote one line of
   this, with only your role?" Record `yes: <the line>` or `no`. No
   permission, no quote on a slide.
5. If a session was recorded, write notes, then delete the recording. Put
   nothing identifying in `docs/evidence/` (see
   [evidence/README.md](evidence/README.md)).
6. Update the send tracker in [outreach.md](outreach.md) if this came from a
   message.
7. Tell the team the same hour (`BUSINESS.md` section 13).

## 4. How answers map to H1 to H4

| Hypothesis | Asked in | Counts as a pass-supporting signal | Pass threshold (`BUSINESS.md` section 3) |
|---|---|---|---|
| **H1** Blind/low-vision STEM students lose days waiting for accessible math | Script A questions 1 to 3 | They describe a **specific recent** wait of 2 days or more, with when and what | At least 3 of 5 student interviews |
| **H2** Workarounds cost time or depend on other people | Script A questions 4 to 6 | They name a workaround they use **weekly** (a reader, a classmate, waiting on a coordinator, a tool) | At least 3 of 5 student interviews |
| **H3** Offices spend significant staff time or money on STEM conversion | Script B questions 2 to 4 | The coordinator gives a **concrete time or $ figure** per worksheet, course or term | At least 1 staff interview |
| **H4** A buyer would trial a tool that converts in minutes with student confirmation | Script B question 8 | A **written** "yes, we would pilot" (email or LOI), **or** a booked follow-up meeting | At least 1 |

Notes:

- "Specific" means a story with a time and a thing in it. "It takes a while"
  is not a pass for H1.
- Script C feeds the integrity answer for judges. It is not an H1 to H4 test, so
  log it but do not count it toward them.
- If a threshold is missed, record that in the scoreboard and say it in the
  pitch (`BUSINESS.md` section 3). Do not move the line.
- H5 and H6 are tested elsewhere (sign-ups and sessions; evals).

## 5. Scoring table (fill one row per interview)

Score each interview straight after, from your notes, before you discuss it
with the team. `Y` or `N` for each hypothesis; `n/a` where that script does not
test it. Put the row number from `proof-log.md` in the first column.

| Ledger # | Script / role | H1 | H2 | H3 | H4 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
|  |  |  |  |  |  |
|  |  |  |  |  |  |
|  |  |  |  |  |  |
|  |  |  |  |  |  |

**Running totals** (count only from filled rows):

- H1: ___ of 5 students (need 3)
- H2: ___ of 5 students (need 3)
- H3: ___ staff with a figure (need 1)
- H4: ___ written yes or booked meeting (need 1)
