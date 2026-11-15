# Hero-flow demo run-sheet

About two minutes including an unbroken 90-second take. Use the [hero flow in #197](https://github.com/xXThr0wnshadeXx/Projekt2/issues/197) and the [demo brief in #193](https://github.com/xXThr0wnshadeXx/Projekt2/issues/193).

## Setup

- [ ] Use a low-vision tester who agrees to present, or introduce the driver as a teammate doing a rehearsal. The driver handles the phone and worksheet throughout.
- [ ] Turn on VoiceOver and Screen Curtain before opening Glance. On iPhone, triple-tap with three fingers, or tap four times with three fingers if Zoom is also on. On Mac, press VO–Shift–Fn–F11 (VO is the VoiceOver modifier). Repeat the gesture or shortcut to turn Screen Curtain off after the take. [iPhone instructions](https://support.apple.com/en-sg/111797) · [Mac instructions](https://support.apple.com/guide/voiceover/use-the-screen-curtain-vo2726/mac)
- [ ] Check room volume, microphone and camera permissions, natural voice availability, and whether the room audio feeds back into the microphone. Check that app speech and VoiceOver cues are intelligible. Use the student-selected Exam setting for the take so the scribe reads work back without step checks.
- [ ] Print a clean worksheet with one equation, `\frac{\sqrt{x + 1}}{2} = 5`, and put it on a dark matte surface under even light. Keep a saved photo of the same sheet ready for fallback.
- [ ] Confirm the deployed revision and run preflight on venue Wi-Fi and the tested hotspot. Start keep-warm and confirm the service is still up just before going on. Stage the backup recording and a rehearsal HTML hand-in with no student data. [Commands and roles](demo-day.md)
- [ ] Rehearse the complete take three times in a row on the venue network and record the backup. Verify the exact navigation inputs and announcements on the actual phone, including the camera permission prompt and any share-sheet tap. [Rehearsal #36](https://github.com/xXThr0wnshadeXx/Projekt2/issues/36) · [Backup #37](https://github.com/xXThr0wnshadeXx/Projekt2/issues/37)

## Opening and close

**Opening, 15 seconds.** Hold up the sheet and say, “When a worksheet arrives as a picture, a blind student can be left waiting for a version they can read. Stanford's in-house alternate-format team targets four to five business days. Here's what it looks like to start on your own.” [Stanford Office of Accessible Education](https://oae.stanford.edu/faculty-staff/alternate-format-production)

**After the take.** Show the rehearsal hand-in on a separate audience display. Give one result from the [evidence ledger](proof-log.md) only if a real session is recorded. Close with “It describes the maths and never does it. Schools decide when a reader or scribe is allowed.”

## The 90-second take

These cues are for the combined rehearsal build. Timing is a stage target. Keep the phone screen black for all six steps and leave the presenter audio open.

| Time and step | Presenter does | Glance says or plays | Audience sees | Live fallback |
|---|---|---|---|---|
| 0:00–0:12 · 1. Open Glance | Open the deployed link with Screen Curtain already on and follow the welcome cue to reach Capture and the camera. | The welcome asks whether Glance should speak and offers the camera or sample. | Presenter operates the black-screen phone independently. | Use VoiceOver to find **Capture a problem** or **Try a sample problem**. |
| 0:12–0:32 · 2. Photograph the worksheet | Point down at the printed sheet, follow the directional cues, then hold still. | Directional speech and panned ticks, then “Got it. Taking the photo.” | Presenter aligns the phone over the sheet without assistance. | Follow retake guidance once, then use the saved photo or sample and name the switch. |
| 0:32–0:43 · 3. Hear its shape | Let capture finish, open **Start working** on the captured line, turn on **Hands-free**, and say “Describe line one.” | Target cue: “An equation. On the left, a fraction: the square root of x plus one, over two. On the right, five.” | Phone stays dark while the audience hears the layout. | Use **Glance** or `G` on the Problem screen to hear the existing structure summary for the captured line or sample fraction. |
| 0:43–0:58 · 4. Explore by ear | Stay on that scratchpad line and ask “What's on top?” | “On top: the square root of x plus one,” with the problem-line identifier. | Presenter asks about the printed expression with the screen dark. | Use the existing equation explorer to read the numerator, or cue the backup for the voice exchange. |
| 0:58–1:18 · 5. Dictate and confirm | Say “Square root of x plus one equals ten.” Listen to the readback and say “Save it” only if it matches. If asked, clarify what is under the root. | Glance reads the student's line back, asks about ambiguous grouping when needed, and announces the save. | Presenter speaks their line and confirms it without sighted assistance. | Use the recording button and confirm the readback with the existing control. If recognition fails, switch to typing and name the switch. |
| 1:18–1:30 · 6. Hand in | Say “Hand in my work.” Complete the share to the prepared rehearsal destination, or follow the audible download location. | A work summary, then the share sheet or download cue. If the browser needs a tap, Glance prompts for one. | Presenter completes the hand-in with the screen curtain still on. | Open **Hand in my work** and download accessible HTML. If delivery fails, cut to the recorded hand-in and label it as backup. |

## Merge status

Checked November 15, 2026. Confirm these again before rehearsing the deployed build. Voice navigation into Capture and the scratchpad also needs a device check under [#184](https://github.com/xXThr0wnshadeXx/Projekt2/issues/184). The welcome PR itself documents keys and taps.

| Step | PR | Merged? |
|---|---|---|
| 1. Welcome | [#211](https://github.com/xXThr0wnshadeXx/Projekt2/pull/211) | not on main yet: rehearse after merge |
| 2. Camera guidance and auto-capture | [#212](https://github.com/xXThr0wnshadeXx/Projekt2/pull/212) | not on main yet: rehearse after merge |
| 3. Hear the shape | Existing Glance action in [the demo script](demo-script.md); richer description in [#206](https://github.com/xXThr0wnshadeXx/Projekt2/pull/206) and hands-free input in [#219](https://github.com/xXThr0wnshadeXx/Projekt2/pull/219) | Existing action on main; voice path not on main yet: rehearse after merge |
| 4. Ask about parts | [#206](https://github.com/xXThr0wnshadeXx/Projekt2/pull/206) | not on main yet: rehearse after merge |
| 5. Hands-free dictation and confirmation | [#219](https://github.com/xXThr0wnshadeXx/Projekt2/pull/219), with operator and sign guard in [#225](https://github.com/xXThr0wnshadeXx/Projekt2/pull/225) | not on main yet: rehearse after merge |
| 6. Voice hand-in | [#222](https://github.com/xXThr0wnshadeXx/Projekt2/pull/222) | not on main yet: rehearse after merge |
| All steps: natural app voice | [#217](https://github.com/xXThr0wnshadeXx/Projekt2/pull/217) | not on main yet: rehearse after merge |
| Q&A: instructor exam lock | [#224](https://github.com/xXThr0wnshadeXx/Projekt2/pull/224) | not on main yet: rehearse after merge |
