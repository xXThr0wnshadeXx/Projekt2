// First visit (issue #200): opening Glance must not need a sighted person.
//
// Browsers do not let a page speak before the visitor has pressed a key or
// tapped, so "it speaks first" is this screen: any key starts Glance and turns
// its own voice on, and that key press is what lets the browser speak. Escape
// keeps it quiet for someone whose screen reader is already talking (DESIGN.md
// 13: two voices at once is unusable). Both are also real buttons, for touch
// and for anyone who finds them by Tab.

import { useEffect, useRef } from 'react';
import { WELCOME_TEXT } from '../firstRun';

export interface WelcomeProps {
  /** Start with Glance's own voice on. Called inside the key or click. */
  onStartSpeaking: () => void;
  /** Start quietly, leaving the screen reader to speak. */
  onStartQuiet: () => void;
}

/** Keys that move around or are held for shortcuts, not "any key". */
const NOT_ANY_KEY = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

export function Welcome({ onStartSpeaking, onStartQuiet }: WelcomeProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const done = useRef(false);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (done.current || NOT_ANY_KEY.has(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
      // Enter or Space on a focused button is that button's job.
      if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      e.stopPropagation();
      done.current = true;
      if (e.key === 'Escape') onStartQuiet();
      else onStartSpeaking();
    }
    // Capture phase, so no shortcut behind this screen sees the key.
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onStartSpeaking, onStartQuiet]);

  function choose(start: () => void) {
    if (done.current) return;
    done.current = true;
    start();
  }

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-8">
      <h2
        ref={heading}
        tabIndex={-1}
        className="text-2xl font-semibold tracking-tight focus-visible:ring-4 focus-visible:ring-[--accent]"
      >
        Welcome to Glance
      </h2>
      <p data-testid="welcome-text" className="mt-3 text-lg">
        {WELCOME_TEXT}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className="btn-primary" onClick={() => choose(onStartSpeaking)}>
          Start, and read aloud to me
        </button>
        <button type="button" className="btn" onClick={() => choose(onStartQuiet)}>
          I use a screen reader
        </button>
      </div>
    </main>
  );
}
