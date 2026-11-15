// ExportPreview — issue #22.
//
// What the hand-in will contain, rendered on screen with the same math the
// student has been reading. It is also exactly what gets printed: the print
// stylesheet hides everything except this section.

import { MathLine } from './MathLine';
import type { Problem, WorkLine } from '../state';

export interface ExportPreviewProps {
  name: string;
  problem: Problem;
  work: WorkLine[];
  date: Date;
}

export function ExportPreview({ name, problem, work, date }: ExportPreviewProps) {
  const when = date.toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' });
  const title = name.trim() ? `Math work — ${name.trim()}` : 'Math work';

  return (
    <section
      id="export-preview"
      aria-labelledby="export-preview-title"
      className="mt-6 rounded-lg border border-[--line] px-6 py-5"
    >
      <h3 id="export-preview-title" className="text-xl font-semibold">
        {title}
      </h3>
      <p className="mt-1 text-sm text-[--muted]">{when}</p>

      <h4 className="mt-6 font-semibold">Problem</h4>
      {problem.instructions && <p className="mt-1">{problem.instructions}</p>}
      <ol className="mt-2 list-decimal space-y-3 pl-6">
        {problem.lines.map((l, i) => (
          <li key={l.id}>
            <MathLine id={`exp-${l.id}`} latex={l.latex} label={`Problem line ${i + 1}`} unsure={!l.valid} />
          </li>
        ))}
      </ol>

      <h4 className="mt-6 font-semibold">My work</h4>
      {work.length === 0 ? (
        <p className="mt-1 text-[--muted]">No lines written yet.</p>
      ) : (
        <ol className="mt-2 list-decimal space-y-3 pl-6">
          {work.map((l, i) => (
            <li key={l.id}>
              <MathLine id={`exp-${l.id}`} latex={l.latex} label={`My line ${i + 1}`} unsure={!l.valid} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
