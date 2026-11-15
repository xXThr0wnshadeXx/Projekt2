// The keyboard map in DESIGN.md 12. Issue #25 adds the full map and the spoken
// help; this is the shared plumbing every screen uses so the rules about when a
// shortcut must *not* fire live in exactly one place.

import { useEffect } from 'react';

/** True when a keystroke belongs to something else and must be left alone.
 *
 *  Three cases, each one a real bug if missed:
 *  - text fields, or typing "l" in a box jumps to low-vision mode;
 *  - the MathJax explorer, whose own arrow keys walk the expression tree;
 *  - any modifier combination, which belongs to the browser or screen reader.
 *    VoiceOver and NVDA lean on modifier chords heavily, and stealing one of
 *    those makes the app hostile to the people it is for.
 */
export function shouldIgnore(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  const target = e.target as HTMLElement | null;
  return Boolean(
    target?.closest('input, textarea, select, [contenteditable], mjx-container'),
  );
}

export type Handlers = Record<string, (e: KeyboardEvent) => void>;

/** Bind single-key shortcuts for as long as `enabled` holds.
 *
 *  Keys are matched case-insensitively, so `g` covers `G` with caps lock on.
 *  `Shift+R` is written as `shift+r`.
 */
export function useShortcuts(handlers: Handlers, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    function onKey(e: KeyboardEvent) {
      if (shouldIgnore(e)) return;
      const key = e.key.toLowerCase();
      const handler = handlers[e.shiftKey ? `shift+${key}` : key];
      if (!handler) return;
      e.preventDefault();
      handler(e);
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // Handlers are rebound each render; the map is small and this keeps the
    // closures current without asking every caller to memoise.
  });
}
