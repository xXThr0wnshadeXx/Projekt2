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
    // MathJax is fetched from a CDN, so on a slow connection there is a window
    // where this shows the student raw TeX — which reads as a broken page to a
    // sighted user and is meaningless read aloud. Keep it out of sight and out
    // of the accessibility tree until it is real math; the line's own
    // aria-label still names it, so nothing is lost to a screen reader.
    el.setAttribute('aria-hidden', 'true');
    el.style.visibility = 'hidden';
    let cancelled = false;
    const reveal = () => {
      el.style.visibility = '';
      el.removeAttribute('aria-hidden');
    };
    typeset(el)
      .then(() => {
        if (cancelled) return;
        reveal();
        // MathJax attaches the explorer after typesetPromise resolves and sets
        // the container's tabindex then, so the config alone can lose the race
        // and leave every line as two tab stops. Enforce it per line.
        const container = el.querySelector<HTMLElement>('mjx-container');
        if (container) container.tabIndex = -1;
      })
      .catch(() => {
        if (cancelled) return;
        // If MathJax never arrives, the LaTeX itself is still better than an
        // empty box — a student can read it, and it is what we would export.
        el.textContent = latex;
        reveal();
      });
    return () => {
      cancelled = true;
    };
  }, [latex]);

  // Escape comes back out of the explorer, to the line the student started on.
  //
  // This cannot be a React handler. MathJax handles Escape on its own
  // container and then focuses that container, after any handler of ours that
  // ran on the way; React's run at the document root, so by the time focus was
  // "put back" MathJax moved it again. Focus was left inside <mjx-container>,
  // where every single-key shortcut is deliberately ignored — so after
  // exploring a line, N, P, G, S and the rest all went silent until the
  // student found their way out with Tab. Listening in the capture phase sees
  // the key before MathJax can swallow it, and moving focus on the next tick
  // lets MathJax finish closing the explorer first.
  const line = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = line.current;
    if (!el) return;
    function onEscape(e: globalThis.KeyboardEvent) {
      if (e.key !== 'Escape' || e.target === el) return;
      window.setTimeout(() => {
        if (el!.contains(document.activeElement)) el!.focus();
      }, 0);
    }
    el.addEventListener('keydown', onEscape, true);
    return () => el.removeEventListener('keydown', onEscape, true);
  }, []);

  /** Enter hands control to the MathJax explorer. */
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' && e.target === e.currentTarget) {
      const container = host.current?.querySelector<HTMLElement>('mjx-container');
      if (!container) return;
      e.preventDefault();
      if (container.tabIndex < 0) container.tabIndex = 0;
      container.focus();
    }
  }

  return (
    <div
      id={id}
      ref={line}
      tabIndex={0}
      role="group"
      onKeyDown={onKeyDown}
      aria-label={unsure ? `${label}, unsure` : label}
      aria-describedby={`${id}-hint`}
      data-testid={`math-line-${id}`}
      className="rounded-lg border border-[--line] bg-[--surface] px-4 py-3
                 focus-visible:ring-4 focus-visible:ring-[--accent]"
    >
      {/* #133: the group's label already says "Line 1". Repeating it in
          hidden text made screen readers say the number twice. The
          instruction is a description instead, read after a pause; `hidden`
          keeps it from also being read as content, and aria-describedby
          still reads hidden elements. */}
      <span id={`${id}-hint`} hidden>
        Press Enter to explore.
      </span>
      <div ref={host} aria-hidden="false" />
      {unsure && (
        <p className="mt-2 text-sm text-[--warn]">
          Could not fully read this line. Check it before using it.
        </p>
      )}
    </div>
  );
}
