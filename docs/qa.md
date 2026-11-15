# Q&A sheet

Issue #193. Every answer is one sentence, followed by the evidence behind it.

**Honesty rule.** An answer states only what is true on `main`, or marks the claim "in review" with the pull request number. No answer here contains a number that is not in a file we can point to. Where we have no evidence, the answer says so.

Status of things not yet on `main` (open on 2026-11-15):

| Claim | Status |
|---|---|
| Reader and scribe is the default, step checks only if an instructor allows them | In review, PR 218 |
| Exam mode locked from an instructor's link, enforced by the server | In review, PR 224 |
| Integrity contract and red-team suite | In progress, #188 (PR 228 open) |
| Demo cannot be taken down by one visitor, and a model spend cap | In review, PR 221 and PR 227 |
| Hand in by voice through the share sheet | In review, PR 222 |
| Natural voice | In review, PR 217 |
| Voice-guided camera | In review, PR 212 |

---

## The questions the issue lists

**Isn't this just ChatGPT?**
No: a general chatbot reads an image and solves it, while Glance only reads the page, describes its structure and writes down the student's own work, and declines to answer.
Evidence: DESIGN.md section 3 (the "General AI chat" row); `tests/e2e/talk.spec.ts` (a "what is x" request is declined).

**Can students use it to cheat?**
It never gives answers, hints or next steps, so it does no work the student is supposed to do, and the instructor-controlled lock that keeps exam mode on is in review.
Evidence: DESIGN.md section 14; README "It never solves anything"; `/api/diff` returns 403 in exam mode (`tests/test_diff.py`); exam lock from an instructor's link is in review, PR 224; the integrity contract and red-team suite are in progress, #188.

**What if the photo is bad?**
Glance tells the student by voice what is wrong with the framing so they can retake it, and a line it cannot read confidently is flagged instead of presented as certain.
Evidence: README "Capture"; `tests/test_capture.py`; `tests/e2e/flow.spec.ts`. Guiding the camera onto the page by voice and sound is in review, PR 212. We have not yet measured this on real camera photos: the only capture numbers are from synthetic rendered pages (`eval/notes.md`, 2026-11-15 section), and `eval/notes.md` says real photos are still required.

**How is it different from Equatio or a screen reader?**
A screen reader reads math one token at a time and cannot read a photo, and Equatio documents overlapping features (screenshot reading, speech input), so our claimed difference is the workflow (whole page, spoken structure first, confirmed line-by-line work), not a proven speed or access advantage.
Evidence: DESIGN.md sections 1 and 3; `docs/pitch.md` "Equatio comparison" (the hands-on shared worksheet test is pending, so we make no comparative claim).

**Have blind students used it?**
We have no recorded sessions with blind or low-vision students yet; the evidence ledger is empty and teammate testing is QA, not user proof.
Evidence: `docs/proof-log.md` (no entries); there is no `docs/evidence/` folder. Planned: user sessions and a real result in #186 (proof with real users) and #41; every session will be logged in `docs/proof-log.md` with permission.

**What does it cost to run?**
We do not have a measured cost per page yet because there was no funded API key; the server logs tokens and cost on every request, so the number comes from the first live run.
Evidence: `docs/ops.md` (per-request `cost_usd` log); `tests/test_cost_logging.py`; `docs/pitch.md` ("Not measured yet"). A model spend cap for the public demo is in review, PR 221 and PR 227.

**Where does student data go?**
Photos and audio are sent to the OpenAI API to be read and are not stored by Glance, there are no accounts and no database, and the student's work stays in their browser.
Evidence: DESIGN.md section 15; README "Privacy"; the notice at the bottom of `frontend/src/screens/Home.tsx`.

**Braille?**
Glance can show Nemeth braille for each line (generated in the browser by MathJax and the Speech Rule Engine), but no braille reader has checked it yet and it is not the main story.
Evidence: `frontend/src/components/MathExports.tsx` ("Show Nemeth braille"); `frontend/src/math/mathjax.ts` (`braille: 'nemeth'`); `docs/pitch.md` ("We have not had it checked by a braille reader yet"). There is no braille-display output code in `frontend/src`.

**Who pays?**
Students pay nothing; the intended buyer is a university disability-services or alternate-format office, with a free pilot first and a price that is still a hypothesis.
Evidence: DESIGN.md section 2 and section 24; `docs/BUSINESS.md`; `docs/market.md` (prices are interview prompts, not agreed numbers).

**What's next?**
First, record real sessions with blind and low-vision students (#186, #41); second, ship the in-review work listed above (exam lock, integrity contract, natural voice, voice-guided camera, hand in by voice).
Evidence: the pull requests in the status table above; issue #197 (the hackathon focus and its frozen list).

---

## More a judge would ask

**What if the AI mishears?**
Every line is read back and the student confirms it before it is saved, and when dictation is genuinely ambiguous Glance asks which was meant instead of guessing.
Evidence: README "Scratchpad"; `tests/test_spoken_fraction_ambiguity.py`; `tests/e2e/scratchpad.spec.ts`. Measured on 50 spoken phrases against the live server: 28 of 35 clear phrases accepted (3 request failures) and 9 of 15 ambiguous phrases correctly clarified, which `eval/notes.md` records as a failing result with fixes still needed.

**Does it work offline?**
Only the page itself is cached for offline loading; reading a photo and transcribing speech need the network, and the sample problem and most of the page work without the model.
Evidence: `frontend/public/sw.js` (the cache is limited to the static shell, and model responses are never cached); `docs/demo-script.md` (the sample problem works without a model key).

**Why would a school trust it in exams?**
Because it describes and transcribes but never solves, hints or checks in the default mode, and the exam lock is meant to be set by the instructor, not the student.
Evidence: DESIGN.md section 14. Default with step checks off is in review, PR 218; instructor exam lock is in review, PR 224; the integrity contract is in progress, #188.

**How accurate is the reading of a page?**
On 60 lines from 30 synthetic rendered pages, 53 were exactly right (88.3%) and 57 were equivalent in meaning (95%), with no request failures, and this is not evidence about real camera photos.
Evidence: `eval/notes.md`, "2026-11-15 Railway synthetic smoke evaluation"; `eval/run_synthetic_eval.mjs`.

**Does it sound human?**
It is not yet: the app uses the browser's own voice today, and a natural voice is in review.
Evidence: PR 217. Text-to-speech is off by default so it does not talk over a screen reader (README "Accessibility").

**Can it be used on a phone, with no sighted help?**
It runs in a phone browser, but starting by voice and guiding the camera by voice are in review, so a fully unaided start is not yet on `main`.
Evidence: voice-first start PR 211; voice-guided camera PR 212; hero flow in issue #197.
