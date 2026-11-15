# Demo script

Rehearsal target for [#193](https://github.com/xXThr0wnshadeXx/Projekt2/issues/193) and [#197](https://github.com/xXThr0wnshadeXx/Projekt2/issues/197). This is not a record of a successful live run. TODOs below are release gates, not optional polish.

## The presentation

**0:00–0:15, why.** Show the paper worksheet. “A paper equation shouldn't mean waiting for someone else to read it. Stanford asks for materials four to five business days before accessible-format conversion is needed. Here's the experience we're building: understanding the page by voice, on your own.” [Source and qualification](pitch.md): institutional submission lead time, not a measured delay for this worksheet.

Introduce the participant accurately: a consenting blind or low-vision tester if available, otherwise “This is our teammate demonstrating the workflow.” Do not describe a teammate as a user-study participant. Turn Screen Curtain on before the take starts. The screen stays black throughout; the room hears the app. No helper touches the participant, phone or app.

## The take: 0:15–1:45, unbroken

Use a clean printed worksheet containing one problem, `\frac{\sqrt{x + 1}}{2} = 5`. The times are rehearsal budgets, not measured performance. All app speech should use the natural voice from #182. The expected wording below is a rehearsal cue, not a transcript of observed output.

| Presentation time | Participant action | What the room should hear |
|---|---|---|
| 0:15–0:25 | Open Glance independently, with Screen Curtain already on. | Glance speaks first and offers a way to capture the page; no sighted setup during the take. |
| 0:25–0:45 | Point the phone at the paper and follow the app's spoken and sound cues. | Framing guidance and automatic capture when the page is ready; no helper positions the phone or presses the shutter. |
| 0:45–1:00 | Listen. | “One problem. An equation: on the left a fraction, the square root of x plus 1 over 2; on the right, 5.” |
| 1:00–1:15 | Ask “what's on top?”, “read the bottom slower”, and “what does square root mean?” | The numerator, the denominator read more slowly, and a definition of the symbol; no suggested operation or next step. |
| 1:15–1:35 | Say “write: square root of x plus 1 equals 10”, listen to the readback, then confirm using the supported voice control. | The student's own line is read back before saving; if grouping is ambiguous, the app asks and the student chooses. It must not silently repair the line. |
| 1:35–1:45 | Request hand-in using the supported voice control. | Confirmation that typed work is ready, with only the student's confirmed line. |

Do not insert another problem, a mode tour, a staged error or a keyboard shortcut demonstration. If natural use takes longer, record the real duration and adjust the presentation; never speed up or cut a recording to make it appear to meet the budget. After the take ends, the presenter may show the exported file to judges separately. Screen Curtain stays on for the whole take.

**1:45–1:50, one proof line.** TODO: use a consented, dated result from [proof-log.md](proof-log.md), with the task and outcome. With no recorded trial, say “We haven't recorded a real student trial yet.” Never turn this rehearsal into a user-testing claim.

**1:50–2:00, trust.** “Glance is built to describe the maths and write down your work, without telling you what to do next. The school decides whether the tested configuration meets its accommodation rules.” The intended no-solving boundary is not a claim of universal exam approval.

## Before calling the demo ready

Record the deployed commit, device, operating system, browser, assistive technology, network and voice setting for every run. TODO: confirm all of these on that exact build:

- Voice-first opening (#200), natural voice (#182), camera framing and automatic capture (#198), questions about the page (#199), dictation and ambiguity (#183), and voice controls including confirmation and hand-in (#184).
- Microphone/camera permission prompts are operable without sighted help. Record whether the device was previously authorized; a prepared permission state is not evidence of a first-use experience.
- The worksheet is read faithfully and the saved/exported line matches the student's confirmed words. The operator guard (#191) and integrity boundaries (#188) must be evaluated without claiming all gaps are closed.
- Screen Curtain stays on, the app speaks audibly without competing voices, and no helper intervenes. Obtain consent for any participant recording and label teammate runs.
- Three consecutive end-to-end takes on the venue network, plus an unbroken backup recording (#37). TODO: attach the run log and recording; none is certified by this document.

| Run | Deployed commit/device/network | Actual duration | Independent completion and failures | Recording |
|---|---|---|---|---|
| 1 | TODO | TODO | TODO | TODO |
| 2 | TODO | TODO | TODO | TODO |
| 3 | TODO | TODO | TODO | TODO |

Before the slot, check the backend health endpoint and perform a real capture and dictation on the deployed build. A healthy process alone does not prove model credentials or audio work. Prepare the consenting participant, paper, charged device, network and recorded backup. Do not expose keys or student material while checking configuration.

## If the take fails

Say what actually happened. Do not blame Wi-Fi without evidence, hide an intervention or call an interrupted run successful. End the live take and label the backup as a recording, including its device and date. If there is no validated backup, explain which part failed. A sample-problem demonstration can illustrate a component, but it does not satisfy the independent paper-to-hand-in take. Record the failure and repeat the three-run gate after the fix.
