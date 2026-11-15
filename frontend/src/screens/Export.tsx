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
import { loadWork, type Problem } from '../state';

export interface ExportProps {
  problem: Problem;
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

export function Export({ problem, onBack }: ExportProps) {
  const work = useMemo(() => loadWork(), []);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
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

  useShortcuts({ d: () => void downloadHtml() }, !busy);

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-8">
      <h2
        ref={heading}
        tabIndex={-1}
        className="no-print text-2xl font-semibold tracking-tight focus-visible:ring-4 focus-visible:ring-[--accent]"
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

      <p role="status" className="no-print mt-4 min-h-[1.5rem] text-[--muted]">
        {busy && 'Making the file…'}
      </p>

      <ExportPreview name={name} problem={problem} work={work} date={date} />
    </main>
  );
}
