// Problem screen — issue #10, with the structure summary of issue #11.
//
// This is where a student actually reads the math. Three ways to take it in,
// in increasing detail (DESIGN.md 1):
//   G      the glance — the shape of the line, before any of its contents
//   Enter  the explorer — arrow keys walk the expression tree
//   L      low-vision mode — one line, full screen, high contrast
//
// Nothing here solves, hints, or checks the student's answer, in any mode.

import { useEffect, useRef, useState } from 'react';
import { announce, focusFirst } from '../components/LiveRegion';
import { MathLine } from '../components/MathLine';
import { structureSummary } from '../math/sre';
import { useShortcuts } from '../shortcuts';
import { checkStep, stepChecksAllowed } from '../stepCheck';
import type { Mode, Problem as ProblemData } from '../state';

export interface ProblemProps {
  problem: ProblemData;
  onLowVision: (index: number) => void;
  onNewCapture: () => void;
  /** Called with the line the student was on, which their first step follows. */
  onStartWorking: (index: number) => void;
  mode: Mode;
  onExport: () => void;
}

export function Problem({
  problem,
  onLowVision,
  onNewCapture,
  onStartWorking,
  mode,
  onExport,
}: ProblemProps) {
  const [index, setIndex] = useState(0);
  const [summary, setSummary] = useState('');
  const announced = useRef(false);

  const lines = problem.lines;
  const current = lines[index];

  // Focus moves to line 1 as soon as the problem is on screen. A capture that
  // leaves focus on the old screen is the single most disorienting thing that
  // can happen to a screen-reader user here (DESIGN.md 13).
  useEffect(() => {
    if (announced.current || lines.length === 0) return;
    announced.current = true;
    window.setTimeout(() => focusFirst(`#${lines[0].id}`), 80);
  }, [lines]);

  function goTo(next: number, label: string) {
    if (lines.length === 0) return;
    const clamped = Math.max(0, Math.min(lines.length - 1, next));
    if (clamped === index && label !== 'same') {
      announce(next < 0 ? 'This is the first line.' : 'This is the last line.');
      return;
    }
    setIndex(clamped);
    setSummary('');
    focusFirst(`#${lines[clamped].id}`);
    announce(`Line ${clamped + 1} of ${lines.length}.`);
  }

  /** The glance. Structure only — never the contents, never a solution. */
  async function glance() {
    if (!current) return;
    announce('Working out the structure…');
    const text = await structureSummary(current.latex);
    setSummary(text);
    announce(text);
  }

  /** Read the current line the way the explorer would say it. */
  function readLine() {
    if (!current) return;
    const spoken = document
      .querySelector(`#${current.id} mjx-container`)
      ?.getAttribute('aria-label');
    announce(spoken || `Line ${index + 1}. ${current.latex}`);
  }

  function readAll() {
    if (lines.length === 0) return;
    const body = lines
      .map((l, i) => {
        const spoken = document
          .querySelector(`#${l.id} mjx-container`)
          ?.getAttribute('aria-label');
        return `Line ${i + 1}. ${spoken || l.latex}.`;
      })
      .join(' ');
    announce(`${problem.instructions} ${body}`.trim());
  }

  /** "What changed?" on the source (DESIGN.md 14): how this line follows from
   *  the one before. Study mode names the operation; homework only says
   *  whether it checks out. Off in exam mode. Never solves or hints. */
  async function whatChanged() {
    if (!stepChecksAllowed(mode)) {
      announce('What changed is off in exam mode.');
      return;
    }
    if (!current) return;
    if (index === 0) {
      announce('This is the first line, so there is nothing before it to compare.');
      return;
    }
    const before = lines[index - 1];
    if (!before.valid || !current.valid) {
      announce('I couldn\'t confirm this step. One of these lines could not be read as math.');
      return;
    }
    announce('Checking…');
    const message = await checkStep(before.latex, current.latex, mode);
    announce(message ?? 'I couldn\'t check that right now. Try again in a moment.');
  }

  useShortcuts({
    g: glance,
    r: readLine,
    'shift+r': readAll,
    n: () => goTo(index + 1, 'next'),
    p: () => goTo(index - 1, 'previous'),
    l: () => onLowVision(index),
    s: () => onStartWorking(index),
    w: () => void whatChanged(),
    x: onExport,
    u: onNewCapture,
  });

  const unsure = lines.filter((l) => !l.valid).length;

  return (
    <main id="main" className="mx-auto max-w-3xl px-6 py-8">
      <h2 className="text-2xl font-semibold tracking-tight">Your problem</h2>

      {problem.instructions && (
        <p className="mt-2 text-lg">
          <span className="sr-only">Instructions: </span>
          {problem.instructions}
        </p>
      )}

      <p className="mt-2 text-sm text-[--muted]">
        {lines.length} {lines.length === 1 ? 'line' : 'lines'}
        {unsure > 0 && `, ${unsure} unsure`}. Press{' '}
        <kbd className="kbd">G</kbd> for the structure of a line,{' '}
        <kbd className="kbd">Enter</kbd> to explore inside it,{' '}
        <kbd className="kbd">N</kbd> and <kbd className="kbd">P</kbd> to move
        between lines, <kbd className="kbd">L</kbd> for low-vision mode,{' '}
        <kbd className="kbd">S</kbd> to start working.
      </p>

      {problem.warnings.length > 0 && (
        <p className="mt-4 rounded-lg border border-[--warn] px-4 py-3 text-sm text-[--warn]">
          {problem.warnings[0]}
        </p>
      )}

      <ul className="mt-6 space-y-4" aria-label="Problem lines">
        {lines.map((l, i) => (
          <li key={l.id} onFocus={() => setIndex(i)}>
            <MathLine
              id={l.id}
              latex={l.latex}
              label={`Line ${i + 1}`}
              unsure={!l.valid}
            />
          </li>
        ))}
      </ul>

      {problem.diagrams.length > 0 && (
        <section aria-label="Diagrams" className="mt-8">
          <h3 className="text-lg font-semibold">Diagrams</h3>
          <ul className="mt-2 space-y-2 text-[--muted]">
            {problem.diagrams.map((d) => (
              <li key={d.id}>{d.description}</li>
            ))}
          </ul>
        </section>
      )}

      {/* The glance lands here as text as well as speech, so a low-vision user
          reading the screen gets it without turning on a screen reader. */}
      {summary && (
        <section aria-label="Structure summary" className="mt-8">
          <h3 className="text-lg font-semibold">Structure</h3>
          <p className="mt-2 text-[--muted]">{summary}</p>
        </section>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        <button type="button" className="btn" onClick={glance}>
          Glance
        </button>
        <button type="button" className="btn" onClick={readAll}>
          Read all
        </button>
        <button type="button" className="btn" onClick={() => onStartWorking(index)}>
          Start working
        </button>
        {stepChecksAllowed(mode) && lines.length > 1 && (
          <button type="button" className="btn" onClick={() => void whatChanged()}>
            What changed?
          </button>
        )}
        <button type="button" className="btn" onClick={() => onLowVision(index)}>
          Low-vision mode
        </button>
        <button type="button" className="btn" onClick={onNewCapture}>
          Capture another
        </button>
      </div>
    </main>
  );
}
