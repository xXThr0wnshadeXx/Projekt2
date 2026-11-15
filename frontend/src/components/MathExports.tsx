import { useEffect, useRef, useState } from 'react';
import { announce } from './LiveRegion';
import { nemeth } from '../math/sre';
import { texDocument } from '../math/texExport';
import type { WorkLine } from '../state';

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function MathExports({ lines }: { lines: readonly WorkLine[] }) {
  const [result, setResult] = useState<{ lines: readonly WorkLine[]; cells: (string | null)[] }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const cells = result?.lines === lines ? result.cells : null;
  const canDownload = Boolean(cells?.length && cells.every(Boolean));

  useEffect(() => {
    if (cells) resultHeading.current?.focus();
  }, [cells]);

  function downloadTex() {
    try {
      download('glance-work.tex', texDocument(lines.map((line) => line.latex)), 'application/x-tex');
      setError('');
      announce('LaTeX download started.');
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'LaTeX export failed.';
      setError(message);
      announce(message, 'assertive');
    }
  }

  async function showNemeth() {
    setPending(true);
    setError('');
    announce('Preparing Nemeth braille.');
    try {
      const output: (string | null)[] = [];
      for (const line of lines) output.push(await nemeth(line.latex));
      setResult({ lines, cells: output });
      const missing = output.filter((line) => !line).length;
      announce(missing ? 'Nemeth braille unavailable for ' + missing + ' lines.' : 'Nemeth braille is ready.');
    } finally {
      setPending(false);
    }
  }

  if (!lines.length) return null;

  return (
    <section className="mt-8" aria-labelledby="math-export-heading">
      <h2 className="text-lg font-semibold" id="math-export-heading">Export your work</h2>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" className="btn" onClick={downloadTex}>Download LaTeX (.tex)</button>
        <button type="button" className="btn" disabled={pending} onClick={showNemeth}>
          {pending ? 'Preparing Nemeth…' : 'Show Nemeth braille'}
        </button>
      </div>
      {error && <p className="mt-2 text-[--warn]">{error}</p>}
      {cells && (
        <div className="mt-4">
          <h3 ref={resultHeading} tabIndex={-1} className="font-semibold focus-visible:outline">
            Nemeth braille
          </h3>
          <ol className="mt-2 list-decimal pl-6">
            {cells.map((cell, index) => (
              <li key={lines[index].id} className="break-words">{cell ?? 'Nemeth unavailable for this line.'}</li>
            ))}
          </ol>
          <button
            type="button"
            className="btn mt-3"
            disabled={!canDownload}
            onClick={() => {
              download('glance-nemeth.txt', cells.join('\n') + '\n', 'text/plain;charset=utf-8');
              announce('Nemeth download started.');
            }}
          >
            Download Nemeth (.txt)
          </button>
        </div>
      )}
    </section>
  );
}
