# Demo video pipeline

Issue #52, for the under-2-minute video in #37. The goal is to record it
calmly on Saturday, not in one take at 11 AM Sunday.

## 1. Test capture on the demo laptop (before Sunday)

- [ ] macOS: **QuickTime → File → New Screen Recording**, Options → microphone on. (OBS works too.)
- [ ] Record 20 seconds with a screen reader speaking. Play it back: is the **screen-reader voice** audible as well as the narrator? (On macOS this needs system audio: use OBS with a system-audio source, or record VoiceOver's output with a loopback device.)
- [ ] 1920×1080, browser zoom 125% so the math is readable on a projector
- [ ] Do Not Disturb on; dock and other windows hidden

## 2. Shot list (≈ 1:50)

Follows the demo order in DESIGN.md §25. Use the **sample problem** or a prepared worksheet, never a real student's work.

| # | Time | Show | Narrator says (see `script.md`) |
|---|---|---|---|
| 1 | 0:00 | Title card: "Glance — math you can hear and speak" | Who it's for |
| 2 | 0:10 | Upload a worksheet; focus lands on line 1 | The problem |
| 3 | 0:25 | `G` (glance), then explore with arrows | Hear the shape first |
| 4 | 0:45 | Hold Space, say "two x equals eight", readback, Enter | Your own work, confirmed |
| 5 | 1:00 | "This step checks out." | Checked by algebra software, never solved |
| 6 | 1:10 | Say "x plus one over two": the which-did-you-mean question, press 1 | It asks instead of guessing |
| 7 | 1:25 | `L`: low-vision mode | Large print |
| 8 | 1:35 | `X`: hand in, download the accessible file | Typed work to hand in |
| 9 | 1:45 | End card: link, team | — |

## 3. Captions (it is an accessibility product)

- [ ] Edit `captions.vtt` so its timings and text match the final narration
- [ ] Upload it with the video (YouTube: Subtitles → Upload file → With timing), **or** burn it in
- [ ] Check them on a phone with sound off

## 4. Before publishing

- [ ] **Nothing private on screen:** no API keys, terminals with variables, Railway/OpenAI dashboards, email addresses, notifications, or participant names
- [ ] The name field on the hand-in screen is empty, or shows a made-up name
- [ ] Every number said in the video is in the proof log or evals (BUSINESS.md: no invented numbers)
- [ ] Any generated b-roll, title cards or music is credited in the README, with its licence recorded in `docs/tooling.md`
- [ ] Unlisted link, no login needed; link added to the submission
