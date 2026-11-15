# Glance

Glance lets blind and low-vision students understand any page of maths by voice, on their own. It reads the page, helps them grasp its shape and parts, and writes down their work. It never does the work for them.

**Who it's for.** Blind and low-vision students doing algebra-level maths, supported by disability-services offices and teachers of students with visual impairments.

**Why this matters.** Printed maths can require advance conversion: Stanford asks for materials at least **4–5 business days** before they are needed for accessible-format remediation. That is one institution's submission lead time, not a measured delay for every student or a cost per worksheet. [Stanford guidance](https://oae.stanford.edu/faculty-staff/accessible-format-remediation-alternate-format/accessible-format-remediation).

**The experience we're building.** Point a phone at a worksheet, follow spoken framing cues, hear the equation's shape, ask about its parts, dictate your own working, confirm the readback and hand in typed maths. Our demonstration target keeps Screen Curtain on throughout, with no sighted help. TODO: complete the [deployment and rehearsal gates](demo-script.md#before-calling-the-demo-ready) before claiming this full flow is validated.

**The boundary.** Describe the page, define its symbols and transcribe the student's work; do not supply answers, hints or next steps. The [integrity work](https://github.com/xXThr0wnshadeXx/Projekt2/pull/228) records unresolved output gaps. Instructor-lock validation and institutional exam permission remain TODO; permission for a human reader does not automatically approve this software.

**Evidence today.** The repository contains automated tests; [the evidence ledger](proof-log.md) does not yet record a real-student trial. TODO: record independent completion, observed failures, actual elapsed time and cost, with consent. We make no measured speed or cost comparison with other products. [Documented alternatives and open comparisons](pitch.md#what-we-can-compare-today).

**Data and funding.** Images and audio are sent to OpenAI for processing; session work lives in the browser. TODO: review provider retention and deployed logs with the evaluating institution. Disability-services offices and schools are prospective buyers; pricing and pilot commitments are unverified.

**The ask.** Help us evaluate the flow with consenting blind and low-vision students and the staff who support them, and tell us where it fails. Try the [prototype](https://glance-shreev2703.vercel.app), read the [project and open issues](https://github.com/xXThr0wnshadeXx/Projekt2), and bring the [Q&A sheet](qa-sheet.md) to an evaluation discussion. TODO: add a verified team contact before printing this page.
