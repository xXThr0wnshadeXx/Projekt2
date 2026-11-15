# Pitch

Four-minute structure in `BUSINESS.md` section 11. Every number here must be
traceable to `proof-log.md` or to an eval report. Issue #36.

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
