# Submission answers

Paste-ready answers for the hackathon submission form (#38). Keep them in step with the README. If the app changes before the form is sent, change both.

**Submit before 12:00.**

## Project name

Glance

## One line

Math for students who are blind or have low vision: it reads a problem aloud, writes down the student's own working as they say it or type it, and never solves it for them.

## Live link

https://glance-shreev2703.vercel.app

Try it in one minute, keyboard only: press **Try a sample problem**, then **S**, type `two x equals eight`, and press Enter twice.

## Repository

https://github.com/xXThr0wnshadeXx/Projekt2

## The problem

Math assumes you can see it and write it. A screen reader reads an equation one token at a time, so a blind student has to hold the whole expression in memory, where a sighted student just glances at its shape. Most course math arrives as pictures: slide screenshots, scanned PDFs, whiteboard photos. The open-source tools that make math accessible need structured math, and converted materials take days to weeks. Doing the work is a second barrier: no pencil, no scratch paper, and braille working that most instructors can't read.

## Who it's for

- Blind students who use a screen reader.
- Low-vision students who need large, high-contrast math one line at a time.
- Students who can't write math by hand.

## What we built

- **Capture:** a photo, screenshot, worksheet or PDF page becomes structured math.
- **Glance:** hear an expression's structure before its contents ("a fraction with a square root on top"), then explore inside it by keyboard, in speech, large print or Nemeth braille.
- **Scratchpad:** say or type each line. Every line is read back and confirmed before it's saved, and when speech is ambiguous Glance asks instead of guessing.
- **Checked steps:** a computer algebra system (SymPy) checks that each step follows from the last. A step it can't verify is "couldn't confirm", never "wrong".
- **Hand-in:** numbered typed work as PDF, accessible HTML with MathML, LaTeX or Nemeth.
- **It never solves the problem.** No answers, hints or next steps in any mode, enforced in the interface and in the API. An exam lock set by an instructor's link is in review (#224), so a school can decide whether it fits its exam rules; we don't claim exam approval.

Built with React, MathJax and the Speech Rule Engine in the browser, and FastAPI, SymPy and the OpenAI API on the server. It runs on Vercel and Railway.

## What is not proven yet

Say this plainly if the form asks about limitations. Testing with real screen readers and braille displays is still in progress (#32, #133), and accuracy evaluations are being run now (#29, #30).

## Team

Roles follow `docs/owners.md`, and match the README's team table.

- Shreevatson Babu Sreegeetha (lead): front end, accessibility, product, export, user research, pitch, submission
- Nicolas Lam: back end and math: FastAPI app and deploy, step checking (SymPy), timeouts, mode enforcement, latency, CI, request guards
- Shaswath: capture and interpretation: photo and speech reading, prompts, schemas, both evaluation sets
- tuffling: testing, rehearsal and the hardest open technical work (see #162)

## Credits and licences

Glance is GPL-3.0. It builds on MathJax and the Speech Rule Engine (Apache-2.0), SymPy (BSD-3-Clause), FastAPI and React (MIT), and others. The full list with licences is under "Credits and licences" in the README. MathCAT (DAISY Consortium) was a reference for math speech and braille behaviour.
