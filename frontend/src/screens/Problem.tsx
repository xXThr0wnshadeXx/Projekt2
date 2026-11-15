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
import { spokenMath, structureSummary } from '../math/sre';
import { useShortcuts } from '../shortcuts';
import { checkStep, stepChecksAllowed, withBasis } from '../stepCheck';
import type { Mode, Problem as ProblemData } from '../state';

export interface ProblemProps {
  problem: ProblemData;
  onLowVision: (index: number) => void;
  onNewCapture: () => void;
  /** Removes a line the capture got wrong; capture output is never immutable. */
  onDiscardLine: (id: string) => void;
  /** Where the last discarded line was, while it can still be put back. */
  discardedIndex?: number | null;
  /** Puts the last discarded line back; returns where it went. */
  onRestoreLine?: () => number | null;
  /** Called with the line the student was on, which their first step follows. */
  onStartWorking: (index: number) => void;
  mode: Mode;
  onExport: () => void;
  /** The line to land on. Coming back from low-vision mode or from the
   *  scratchpad, that is the line the student left from — not line 1 again,
   *  which silently lost their place every time. */
  startIndex?: number;
}

export function Problem({
  problem,
  onLowVision,
  onNewCapture,
  onDiscardLine,
  discardedIndex = null,
  onRestoreLine,
  onStartWorking,
  mode,
  onExport,
  startIndex = 0,
}: ProblemProps) {
  const [index, setIndex] = useState(() =>
    Math.max(0, Math.min(problem.lines.length - 1, startIndex)),
  );
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
    window.setTimeout(() => focusFirst(`#${(lines[index] ?? lines[0]).id}`), 80);
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
    const spoken = spokenMath(document.getElementById(current.id));
    announce(spoken ? `Line ${index + 1}. ${spoken}` : `Line ${index + 1} is not ready to read yet. Try again in a moment.`);
  }

  function readAll() {
    if (lines.length === 0) return;
    const body = lines
      .map((l, i) => {
        const spoken = spokenMath(document.getElementById(l.id));
        return `Line ${i + 1}. ${spoken || l.latex}.`;
      })
      .join(' ');
    announce(`${problem.instructions} ${body}`.trim());
  }

  function discardLine(lineIndex: number) {
    const line = lines[lineIndex];
    if (!line) return;
    const remaining = lines.length - 1;
    // Work out the focus target before removing the line from the DOM.
    const next = lines[lineIndex + 1] ?? lines[lineIndex - 1];
    setIndex(Math.max(0, Math.min(lineIndex, remaining - 1)));
    setSummary('');
    onDiscardLine(line.id);
    announce(
      remaining
        ? `Discarded line ${lineIndex + 1}. ${remaining} ${remaining === 1 ? 'line remains.' : 'lines remain.'} To undo, use Put line ${lineIndex + 1} back, before the lines.`
        : `Discarded the only line. To undo, use Put line 1 back. Or capture another problem.`,
    );
    window.setTimeout(() => focusFirst(next ? `#${next.id}` : '#no-problem-lines'), 80);
  }

  function restoreLine() {
    const at = onRestoreLine?.();
    if (at == null) return;
    setIndex(at);
    setSummary('');
    announce(`Line ${at + 1} is back.`);
    // Found on the page after the restored line has rendered; `lines` here is
    // still the list from before it came back.
    window.setTimeout(
      () => focusFirst(`[aria-label="Problem lines"] > li:nth-child(${at + 1}) [role="group"]`),
      80,
    );
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
    announce(
      message
        ? withBasis(message, `line ${index}`)
        : 'I couldn\'t check that right now. Try again in a moment.',
    );
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
    <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-8">
      <h2 className="text-2xl font-semibold tracking-tight">Your problem</h2>

      {problem.instructions && (
        <p className="mt-2 text-lg">
          <span className="sr-only">Instructions: </span>
          {problem.instructions}
        </p>
      )}

      {/* Five shortcuts spelled out here were read aloud in full on every
          visit, before the student reached the maths. The two that matter on
          arrival are how to look inside a line and how to begin; the rest live
          behind "?" where they can be asked for. The full list stays on screen
          for a sighted keyboard user, but is hidden from screen readers so it
          is not recited — "?" announces it properly. */}
      <p className="mt-2 text-sm text-[--muted]">
        {lines.length} {lines.length === 1 ? 'line' : 'lines'}
        {unsure > 0 && `, ${unsure} unsure`}. Press{' '}
        <kbd className="kbd">Enter</kbd> on a line to explore it,{' '}
        <kbd className="kbd">S</kbd> to start working.
        <span aria-hidden="true">
          {' '}
          <kbd className="kbd">G</kbd> structure, <kbd className="kbd">N</kbd>{' '}
          and <kbd className="kbd">P</kbd> to move, <kbd className="kbd">L</kbd>{' '}
          large print, <kbd className="kbd">?</kbd> for all shortcuts.
        </span>
      </p>

      {problem.warnings.length > 0 && (
        <p className="mt-4 rounded-lg border border-[--warn] px-4 py-3 text-sm text-[--warn]">
          {problem.warnings[0]}
        </p>
      )}

      {discardedIndex !== null && (
        <button type="button" className="btn mt-6" onClick={restoreLine}>
          Put line {discardedIndex + 1} back
        </button>
      )}

      {lines.length ? (
        <ul className="mt-6 space-y-4" aria-label="Problem lines">
          {lines.map((l, i) => (
            // Beside the line, not on top of it: an overlaid button covered
            // the end of long equations and large-print maths.
            <li key={l.id} className="flex items-start gap-3" onFocus={() => setIndex(i)}>
              <div className="min-w-0 flex-1">
                <MathLine
                  id={l.id}
                  latex={l.latex}
                  label={`Line ${i + 1}`}
                  unsure={!l.valid}
                />
              </div>
              <button
                type="button"
                className="btn mt-1 min-h-[48px] min-w-[48px] shrink-0 justify-center px-0 text-2xl leading-none"
                onClick={() => discardLine(i)}
                aria-label={`Discard problem line ${i + 1}`}
                title="Discard this line"
              >
                <span aria-hidden="true">×</span>
                <span className="sr-only">Discard</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <section id="no-problem-lines" tabIndex={-1} className="mt-6 rounded-lg border border-[--warn] px-4 py-3">
          No problem lines remain. Capture another photo, scan or file.
        </section>
      )}

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

      {/* Six equal buttons in a row is six decisions before doing anything,
          and nothing says which one matters. There is one thing a student
          came here to do — start working — so that is the only primary
          control. Everything else is a way of reading this problem, grouped
          and named so a screen reader announces the group before its
          contents, and "Capture another" is left out of that group because it
          leaves the problem rather than reading it. */}
      <div className="mt-8">
        {lines.length > 0 && <>
        <button
          type="button"
          className="btn-primary"
          onClick={() => onStartWorking(index)}
        >
          Start working
        </button>

        <section aria-label="Ways to read this problem" className="mt-6">
          <h3 className="text-sm font-medium uppercase tracking-wide text-[--muted]">
            Ways to read this
          </h3>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className="btn" onClick={glance}>
              Glance
            </button>
            <button type="button" className="btn" onClick={readAll}>
              Read all
            </button>
            <button type="button" className="btn" onClick={() => onLowVision(index)}>
              Low-vision mode
            </button>
            {stepChecksAllowed(mode) && lines.length > 1 && (
              <button type="button" className="btn" onClick={() => void whatChanged()}>
                What changed?
              </button>
            )}
          </div>
        </section>
        </>}

        <div className="mt-6 border-t border-[--line] pt-4">
          <button type="button" className="btn-quiet" onClick={onNewCapture}>
            Capture another problem
          </button>
        </div>
      </div>
    </main>
  );
}
