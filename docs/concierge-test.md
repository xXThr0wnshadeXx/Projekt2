# Concierge conversion test (issue #42)

Run one real worksheet or slide deck for a real student or office through
Glance, have a teammate double-check it, and time it end to end against their
usual turnaround. This is market test 2 in `BUSINESS.md` section 5.

**Acceptance:** pages, minutes, and their reported usual days are logged.

Use only what is true on the day. Which Glance features exist today is on
`main` and in the [README](../README.md). Hand in by voice through the share
sheet (PR 222), reader-and-scribe as the default (PR 218) and the instructor
exam lock (PR 224) are in review, not shipped. Do not promise them.

## What to bring

- [ ] A **real** worksheet, slide deck or handout with math in it that the
  student or office actually needs, as a file or a photo. Ask for one they
  already have; do not use a made-up one.
- [ ] Their **usual turnaround in days** for this kind of material, asked
  before you start ("Last time one of these came back, how many days was it?").
- [ ] A stopwatch (phone is fine) and this table.
- [ ] A **teammate** who will double-check the output. They read the original
  and Glance's reading line by line.
- [ ] Glance open at https://glance-shreev2703.vercel.app, with the back end
  warm (check it a few minutes before; see `docs/demo-script.md` setup).

## Consent (say it, wait for yes)

> "I would like to run one of your real documents through a student project
> called Glance and time how long it takes. I will not keep the document, the
> photos, or any of the student's work: it is used for this one run and then
> deleted. I will log the number of pages, the minutes, and any errors we
> found, with no names. Is that okay?"

- If anyone says no, stop. Offer a sample document instead and do not count
  that run as a concierge test.
- Student work and photos are **not kept**: delete the file, any photo, and any
  Glance output on your device after the run, and do not copy any of them into
  `docs/evidence/`. Only the log row below is kept.
- Ask permission before quoting anything they say about the time it saved.

## Run sheet

Start the clock at step 3 and stop it at step 7. Write the time at each point.

| Step | Who | What | Clock |
|---|---|---|---|
| 1 | You | Ask their usual turnaround in days; write it down | not timed |
| 2 | You | Get the file or photo and count the pages | not timed |
| 3 | You | **START.** Upload or capture the document in Glance | start: ____ |
| 4 | You | Let Glance read it. Note the line count it announces | |
| 5 | Teammate | Double-check: compare each line Glance read with the original. List every error, and every line Glance flagged as uncertain | |
| 6 | You | Correct what the check found, or note what could not be fixed | |
| 7 | You | **STOP.** The material is ready for the student or office to use | stop: ____ |
| 8 | You | Ask the student or office to look at the result. Note what they say, in their words | not timed |
| 9 | You | Delete the file, photos and output. Log the row below | not timed |

Rules for the timing:

- The clock includes waiting for Glance and the teammate check. It does not
  include setting up or your explaining.
- If something fails and you must restart, **keep the clock running** and note
  the restart.
- Timing starts from a ready file. Say so in the notes if getting the file took
  long, because that part is not Glance's.

## Log (one row per run)

Pages and minutes are yours; usual days are **their** number, in their words.
Do not estimate any of them. Leave a cell as `none given` if it is missing.

| Date | Audience (role only) | Pages | Minutes (start to stop) | Their usual turnaround (days) | Errors found by teammate | Lines flagged uncertain | Notes (restarts, anything that broke) | Permission to quote |
|---|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |  |

"Errors found" means a line where Glance's reading did not match the original,
counted by the teammate. Count both lines and total lines checked, for example
"3 of 24", so the error rate can be stated honestly.

## Afterwards

1. Add a ledger row to [proof-log.md](proof-log.md) with signal type
   `session completed`, plus `$/time figure` if they gave a figure.
2. For the pitch scoreboard (`BUSINESS.md` section 6) the line reads: "Pages
   converted in concierge test: __ in __ min (vs. __ days reported)". Fill it
   from this table only.
3. Do not generalise from one run. One run is one data point, and the pitch
   should say so.
