// App shell — issue #3.
//
// Deliberately small. It proves the three things #3 has to prove: the app
// renders, MathJax 4 typesets an equation whose explorer works by keyboard, and
// announcements reach a screen reader. The real screens arrive with their own
// issues (#9 capture, #10 problem, #12 low-vision, #18 scratchpad).

import { useEffect, useState } from 'react';
import { LiveRegion, announce, focusFirst } from './components/LiveRegion';
import { MathLine } from './components/MathLine';
import { loadMathJax, isReady } from './math/mathjax';
import { health, apiBase, ApiFailure } from './api';
import { LowVision } from './screens/LowVision';

// String.raw keeps every backslash — a plain quoted string turns \f and \s into
// escape sequences and silently mangles the LaTeX.
const SAMPLE = [
  { id: 'L1', latex: String.raw`2x + 3 = 11`, label: 'Line 1' },
  { id: 'L2', latex: String.raw`\frac{\sqrt{x + 1}}{2} = 5`, label: 'Line 2' },
];

type BackEnd = 'checking' | 'up' | 'down';

// Spoken readings are produced by the summary endpoint (#11); until then the
// self-voicing in low-vision mode falls back to the line label.
const SPOKEN: Record<string, string> = {
  L1: '2 x plus 3 equals 11',
  L2: 'the fraction with numerator the square root of x plus 1, and denominator 2, equals 5',
};

export function App() {
  const [lowVision, setLowVision] = useState(false);
  const [lineIndex, setLineIndex] = useState(0);
  const [mathReady, setMathReady] = useState(false);
  const [backEnd, setBackEnd] = useState<BackEnd>('checking');
  const [backEndNote, setBackEndNote] = useState('');

  useEffect(() => {
    loadMathJax()
      .then(() => {
        setMathReady(true);
        announce('Math is ready. Two example lines. Press Enter on a line to explore it.');
      })
      .catch(() => {
        announce('Math could not load. Reload the page.', 'assertive');
      });
  }, []);

  // `L` enters low-vision mode (DESIGN.md 12). Shortcuts stay out of the way of
  // text fields and of the equation explorer.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (lowVision) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, [contenteditable], mjx-container')) return;
      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        setLowVision(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lowVision]);

  useEffect(() => {
    health()
      .then(() => {
        setBackEnd('up');
        setBackEndNote('');
      })
      .catch((e: unknown) => {
        setBackEnd('down');
        setBackEndNote(e instanceof ApiFailure ? e.message : 'Unavailable.');
      });
  }, []);

  if (lowVision) {
    return (
      <>
        <LiveRegion />
        <LowVision
          lines={SAMPLE.map((l) => ({ ...l, spoken: SPOKEN[l.id] }))}
          startIndex={lineIndex}
          onExit={(i) => {
            setLineIndex(i);
            setLowVision(false);
            announce('Left low-vision mode.');
            window.setTimeout(() => focusFirst(`#${SAMPLE[i]?.id ?? 'L1'}`), 60);
          }}
        />
      </>
    );
  }

  return (
    <div className="min-h-dvh bg-[--bg] text-[--fg]">
      <LiveRegion />

      {/* A skip link is the first thing a keyboard user needs. */}
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <header className="border-b border-[--line] px-6 py-5">
        <h1 className="text-2xl font-semibold tracking-tight">Glance</h1>
        <p className="mt-1 text-[--muted]">Math you can hear and speak.</p>
      </header>

      <main id="main" className="mx-auto max-w-3xl px-6 py-8">
        <h2 className="text-lg font-semibold">Skeleton check</h2>
        <p className="mt-2 text-[--muted]">
          Tab to a line and press <kbd className="kbd">Enter</kbd>, then use the arrow
          keys to move inside the equation. <kbd className="kbd">Esc</kbd> leaves it.
          Press <kbd className="kbd">L</kbd> for low-vision mode.
        </p>

        <ul className="mt-6 space-y-4" aria-label="Example problem lines">
          {SAMPLE.map((l) => (
            <li key={l.id}>
              <MathLine id={l.id} latex={l.latex} label={l.label} />
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn"
            onClick={() => {
              const moved = focusFirst('#L1');
              announce(moved ? 'Moved to line 1.' : 'Line 1 is not on the page.');
            }}
          >
            Focus line 1
          </button>
          <button type="button" className="btn" onClick={() => setLowVision(true)}>
            Low-vision mode
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              announce(
                isReady()
                  ? 'Math engine is loaded and the explorer is available.'
                  : 'Math engine is still loading.',
              )
            }
          >
            Announce status
          </button>
        </div>

        <dl className="mt-10 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-[--muted]">Math engine</dt>
          <dd>{mathReady ? 'loaded, explorer on' : 'loading'}</dd>
          <dt className="text-[--muted]">Back end</dt>
          <dd>
            {backEnd === 'checking' && 'checking'}
            {backEnd === 'up' && 'reachable'}
            {backEnd === 'down' && `not reachable — ${backEndNote}`}
          </dd>
          <dt className="text-[--muted]">API base</dt>
          <dd>
            <code>{apiBase}</code>
          </dd>
        </dl>

        {backEnd === 'down' && (
          <p className="mt-4 text-sm text-[--muted]">
            Expected until issue #2 is deployed. Set <code>VITE_API_BASE</code> once it is.
          </p>
        )}
      </main>
    </div>
  );
}
