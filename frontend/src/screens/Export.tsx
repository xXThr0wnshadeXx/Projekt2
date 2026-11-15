// Export — issue #22 (DESIGN.md 5 Flow A step 9, F15).
//
// The student's own confirmed work, ready to hand in: an accessible HTML file
// with MathML, or a printed / PDF copy through the browser's print dialog.
// Everything happens in the browser; nothing is uploaded or stored.

import { spokenMath } from '../math/sre';
import { useEffect, useMemo, useRef, useState } from 'react';
import { announce } from '../components/LiveRegion';
import { ExportPreview } from '../components/ExportPreview';
import { buildExportHtml, downloadFile } from '../export';
import { useShortcuts } from '../shortcuts';
import { feedback, ApiFailure, type FeedbackResponse } from '../api';
import { loadWork, spendFeedback, type FeedbackKind, type Mode, type Problem } from '../state';
import { stepChecksAllowed } from '../stepCheck';

const SAYS_REVIEW_USED = "I can't review this problem again.";
const SAYS_HINT_USED = "I can't give another hint on this problem.";

export interface ExportProps {
  problem: Problem;
  mode: Mode;
  onBack: () => void;
}

/** "math-work-2026-11-15.html", or with the student's name if they gave one. */
export function exportFilename(name: string, date: Date): string {
  // The student's own calendar date, matching the date printed in the file
  // (toISOString would be UTC, a day off in the evening in the Americas).
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return slug ? `math-work-${slug}-${day}.html` : `math-work-${day}.html`;
}

export function Export({ problem, mode, onBack }: ExportProps) {
  const work = useMemo(() => loadWork(), []);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<FeedbackResponse | null>(null);
  const date = useMemo(() => new Date(), []);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
    const count = `${work.length} ${work.length === 1 ? 'line' : 'lines'} of your work`;
    announce(`Hand in your work. ${count}. Download a file, or print it.`);
  }, [work.length]);

  /** The spoken form of each problem line, taken from the rendered preview. */
  function spokenFor(id: string, fallback: string): string {
    return spokenMath(document.getElementById(`exp-${id}`)) || fallback;
  }

  async function downloadHtml() {
    setBusy(true);
    try {
      const html = await buildExportHtml({
        name,
        instructions: problem.instructions,
        problem: problem.lines.map((l) => ({
          latex: l.latex,
          spoken: spokenFor(l.id, l.latex),
          valid: l.valid,
        })),
        work: work.map((l) => ({ latex: l.latex, spoken: l.readback, valid: l.valid })),
        date,
      });
      const filename = exportFilename(name, date);
      downloadFile(filename, html, 'text/html;charset=utf-8');
      announce(`Downloaded ${filename}.`);
    } catch {
      announce('The file could not be made. Try again, or print instead.', 'assertive');
    } finally {
      setBusy(false);
    }
  }

  function print() {
    announce('Opening the print dialog. Choose Save as PDF to get a PDF.');
    // Let the announcement start before the dialog takes over.
    window.setTimeout(() => window.print(), 150);
  }

  async function askAi(kind: FeedbackKind) {
    if (!work.length || !stepChecksAllowed(mode)) return;
    if (!spendFeedback(kind)) {
      const refusal = kind === 'review' ? SAYS_REVIEW_USED : SAYS_HINT_USED;
      setAiFeedback({ outcome: 'needs_review', message: refusal });
      announce(refusal);
      return;
    }
    setAiBusy(true);
    setAiFeedback(null);
    try {
      const result = await feedback(problem.lines.map((line) => line.latex), work.map((line) => line.latex), mode as 'study' | 'homework', kind);
      setAiFeedback(result);
      announce(result.message);
    } catch (error) {
      const message = error instanceof ApiFailure ? error.message : 'AI feedback is unavailable right now.';
      setAiFeedback({ outcome: 'needs_review', message });
      announce(message, 'assertive');
    } finally {
      setAiBusy(false);
    }
  }

  useShortcuts({ d: () => void downloadHtml() }, !busy);

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-8">
      <h2
        ref={heading}
        tabIndex={-1}
        className="no-print text-4xl font-medium tracking-tight focus-visible:ring-4 focus-visible:ring-[--accent]"
      >
        Hand in your work
      </h2>
      <p className="no-print mt-2 text-[--muted]">
        Your confirmed lines, numbered, with the problem. The file reads aloud
        in a screen reader and shows typeset math to your instructor. Nothing
        is uploaded.
      </p>

      <div className="no-print mt-6">
        <label htmlFor="export-name" className="block text-sm font-medium">
          Your name, to put at the top (optional)
        </label>
        <input
          id="export-name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-2 min-h-[48px] w-full max-w-md rounded-lg border border-[--line] bg-[--surface] px-4 text-[--fg]"
        />
      </div>

      <div className="no-print mt-6 flex flex-wrap gap-3">
        <button type="button" className="btn" disabled={busy} onClick={() => void downloadHtml()}>
          Download accessible HTML
        </button>
        <button type="button" className="btn" onClick={print}>
          Print or save as PDF
        </button>
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
      </div>

      {stepChecksAllowed(mode) && (
        <section aria-labelledby="ai-feedback-heading" className="no-print mt-8 rounded-lg border border-[--line] bg-[--surface] px-4 py-4">
          <h3 id="ai-feedback-heading" className="text-lg font-semibold">AI feedback</h3>
          <p className="mt-1 text-sm text-[--muted]">
            Only because your instructor allows it. One review and one hint per problem. Never put in your hand-in file and never sent to your teacher. It gives no answers and no next steps.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="btn" disabled={aiBusy || !work.length} onClick={() => void askAi('review')}>
              Check accuracy with AI
            </button>
            <button type="button" className="btn" disabled={aiBusy || !work.length} onClick={() => void askAi('hint')}>
              Get a feedback-only hint
            </button>
          </div>
          <p role="status" className="mt-3 min-h-[1.5rem] text-[--muted]">
            {aiBusy && 'Reviewing your submitted work�'}
          </p>
          {aiFeedback && (
            <p aria-label="AI feedback result" className="mt-2 rounded-lg border border-[--line] px-3 py-2">
              {aiFeedback.message}
            </p>
          )}
        </section>
      )}

      <p role="status" className="no-print mt-4 min-h-[1.5rem] text-[--muted]">
        {busy && 'Making the file…'}
      </p>

      <ExportPreview name={name} problem={problem} work={work} date={date} />
    </main>
  );
}
