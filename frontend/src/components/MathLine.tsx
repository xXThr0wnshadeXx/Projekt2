// MathLine — issue #10 builds this out; this is the focusable, explorable line.
//
// Each line is a real focusable element so it appears in the tab order and a
// screen reader can land on it. Pressing Enter hands control to the MathJax
// explorer, where arrow keys walk the expression tree.

import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { typeset } from '../math/mathjax';

export interface MathLineProps {
  id: string;
  latex: string;
  label: string;
  /** Lines the parser could not read are announced as unsure, never hidden. */
  unsure?: boolean;
}

export function MathLine({ id, latex, label, unsure = false }: MathLineProps) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    // String.raw so the display delimiters survive as a literal backslash.
    el.textContent = String.raw`\[` + latex + String.raw`\]`;
    let cancelled = false;
    typeset(el)
      .then(() => {
        if (cancelled) return;
        // MathJax attaches the explorer after typesetPromise resolves and sets
        // the container's tabindex then, so the config alone can lose the race
        // and leave every line as two tab stops. Enforce it per line.
        const container = el.querySelector<HTMLElement>('mjx-container');
        if (container) container.tabIndex = -1;
      })
      .catch(() => {
        if (!cancelled) {
          el.textContent = latex;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [latex]);

  /** Enter hands control to the MathJax explorer; Esc comes back out. */
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' && e.target === e.currentTarget) {
      const container = host.current?.querySelector<HTMLElement>('mjx-container');
      if (!container) return;
      e.preventDefault();
      if (container.tabIndex < 0) container.tabIndex = 0;
      container.focus();
      return;
    }
    // MathJax handles Escape internally but leaves focus on the container,
    // which is not a tab stop — so the next Tab would jump from nowhere.
    // Put focus back on the line the student started from.
    if (e.key === 'Escape' && e.target !== e.currentTarget) {
      e.currentTarget.focus();
    }
  }

  return (
    <div
      id={id}
      tabIndex={0}
      role="group"
      onKeyDown={onKeyDown}
      aria-label={unsure ? `${label}, unsure` : label}
      data-testid={`math-line-${id}`}
      className="rounded-lg border border-[--line] bg-[--surface] px-4 py-3
                 focus-visible:ring-4 focus-visible:ring-[--accent]"
    >
      <span className="sr-only">{label}. Press Enter to explore.</span>
      <div ref={host} aria-hidden="false" />
      {unsure && (
        <p className="mt-2 text-sm text-[--warn]">
          Could not fully read this line. Check it before using it.
        </p>
      )}
    </div>
  );
}
