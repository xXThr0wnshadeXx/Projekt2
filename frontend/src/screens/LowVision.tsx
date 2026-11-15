// Low-vision mode — issue #12. DESIGN.md Flow C and F9.
//
// One line at a time, as large as the student wants, in a pairing they choose.
// This is not a smaller version of the problem screen; it is a different way of
// reading, for someone who can see but for whom a full page of algebra is
// unusable. Everything else on screen is deliberately out of the way.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { MathLine } from '../components/MathLine';
import { announce } from '../components/LiveRegion';
import { LOW_VISION_THEMES } from '../lowVisionThemes';
import { isSupported, setSelfVoicing, speak, cancel } from '../audio/tts';
import { isPressable, readAloud } from '../lineKeys';

export interface LowVisionProps {
  lines: { id: string; latex: string }[];
  spokenLines: Record<string, string>;
  /** Where to start, so entering the mode keeps the student's place. */
  startIndex?: number;
  onExit: (index: number) => void;
}

const SIZES = [4, 6, 8, 11, 15, 20];
const DEFAULT_SIZE = 2;

export function LowVision({ lines, spokenLines, startIndex = 0, onExit }: LowVisionProps) {
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(startIndex, 0), Math.max(lines.length - 1, 0)),
  );
  const [sizeStep, setSizeStep] = useState(DEFAULT_SIZE);
  const [themeIndex, setThemeIndex] = useState(0);
  const [voicing, setVoicing] = useState(false);
  const stage = useRef<HTMLDivElement>(null);

  const theme = LOW_VISION_THEMES[themeIndex];
  const line = lines[index];
  const atStart = index === 0;
  const atEnd = index >= lines.length - 1;

  const go = useCallback(
    (next: number) => {
      if (next < 0 || next >= lines.length) {
        announce(next < 0 ? 'This is the first line.' : 'This is the last line.');
        return;
      }
      setIndex(next);
      const l = lines[next];
      announce(`Line ${next + 1} of ${lines.length}.`);
      if (voicing) speak(spokenLines[l.id] ?? `Line ${next + 1}`);
    },
    [lines, spokenLines, voicing],
  );

  // Keyboard is the primary interface here, not a convenience.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Never swallow typing, and never fight the equation explorer.
      const target = e.target as HTMLElement | null;
      if (target && typeof target.closest === 'function') {
        if (target.closest('input, textarea, [contenteditable], mjx-container')) {
          return;
        }
      }
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          go(index + 1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          go(index - 1);
          break;
        case '+':
        case '=':
          e.preventDefault();
          setSizeStep((s) => Math.min(s + 1, SIZES.length - 1));
          break;
        case '-':
          e.preventDefault();
          setSizeStep((s) => Math.max(s - 1, 0));
          break;
        case 't':
        case 'T':
          e.preventDefault();
          setThemeIndex((t) => (t + 1) % LOW_VISION_THEMES.length);
          break;
        case ' ': {
          // A tap of Space reads the current line aloud (#236). Space still
          // presses a focused button.
          if (e.repeat || isPressable(e.target)) break;
          e.preventDefault();
          const line = lines[index];
          if (line) readAloud(`Line ${index + 1}. ${spokenLines[line.id] ?? line.latex}`);
          break;
        }
        case 'Escape':
          e.preventDefault();
          onExit(index);
          break;
        default:
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index, onExit, lines, spokenLines]);

  useEffect(() => {
    stage.current?.focus();
    announce(
      `Low-vision mode. ${lines.length} line${lines.length === 1 ? '' : 's'}. ` +
        'Arrow keys move, plus and minus change size, T changes theme, Escape leaves.',
    );
    return cancel;
  }, [lines.length]);

  useEffect(() => {
    const t = LOW_VISION_THEMES[themeIndex];
    announce(`${t.name}.`);
  }, [themeIndex]);

  function toggleVoicing() {
    const next = !voicing;
    setVoicing(next);
    setSelfVoicing(next);
    announce(next ? 'Reading aloud on.' : 'Reading aloud off.');
    if (next && line) speak(spokenLines[line.id] ?? `Line ${index + 1}`);
  }

  if (!line) {
    return (
      <section
        className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8"
        style={{ background: theme.bg, color: theme.fg }}
      >
        <p className="text-3xl">Nothing to show yet.</p>
        <button type="button" className="lv-btn" onClick={() => onExit(0)}>
          Back
        </button>
      </section>
    );
  }

  return (
    <section
      aria-label="Low-vision mode"
      className="flex min-h-dvh flex-col"
      style={
        {
          background: theme.bg,
          color: theme.fg,
          '--surface': theme.bg,
          '--line': theme.muted,
          '--accent': theme.accent,
          '--lv-fg': theme.fg,
          '--lv-bg': theme.bg,
          '--lv-muted': theme.muted,
          '--lv-accent': theme.accent,
        } as CSSProperties
      }
    >
      {/* The line itself gets the room. Controls are small and at the bottom,
          where they do not compete with it. */}
      <div
        ref={stage}
        tabIndex={-1}
        className="flex flex-1 flex-col items-center justify-center overflow-auto px-6 py-10"
      >
        <p className="mb-6 text-center" style={{ color: theme.muted, fontSize: '1.5rem' }}>
          Line {index + 1} of {lines.length}
        </p>
        <div
          className="w-full max-w-full text-center leading-tight"
          style={{ fontSize: `${SIZES[sizeStep]}rem` }}
        >
          <MathLine id={`lv-${line.id}`} latex={line.latex} label={`Line ${index + 1}`} />
        </div>
      </div>

      <div
        className="flex flex-wrap items-center justify-center gap-3 border-t px-4 py-4"
        style={{ borderColor: theme.muted }}
      >
        <button type="button" className="lv-btn" onClick={() => go(index - 1)} disabled={atStart}>
          Previous
        </button>
        <button type="button" className="lv-btn" onClick={() => go(index + 1)} disabled={atEnd}>
          Next
        </button>
        <button
          type="button"
          className="lv-btn"
          onClick={() => setSizeStep((s) => Math.max(s - 1, 0))}
          disabled={sizeStep === 0}
          aria-label="Smaller text"
        >
          Smaller
        </button>
        <button
          type="button"
          className="lv-btn"
          onClick={() => setSizeStep((s) => Math.min(s + 1, SIZES.length - 1))}
          disabled={sizeStep === SIZES.length - 1}
          aria-label="Larger text"
        >
          Larger
        </button>
        <button
          type="button"
          className="lv-btn"
          onClick={() => setThemeIndex((t) => (t + 1) % LOW_VISION_THEMES.length)}
        >
          Theme: {theme.name}
        </button>
        {isSupported() && (
          <button
            type="button"
            className="lv-btn"
            aria-pressed={voicing}
            onClick={toggleVoicing}
          >
            Read aloud: {voicing ? 'on' : 'off'}
          </button>
        )}
        <button type="button" className="lv-btn" onClick={() => onExit(index)}>
          Leave
        </button>
      </div>
    </section>
  );
}
