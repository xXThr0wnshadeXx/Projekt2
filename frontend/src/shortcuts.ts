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
  // Events aimed at the window or document have no `closest`; treat them as
  // ordinary page keystrokes rather than throwing inside every shortcut.
  const target = e.target instanceof Element ? e.target : null;
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
      // "?" needs Shift on most layouts but is one key to the person pressing
      // it, so it is matched as itself rather than as "shift+?". Some on-screen
      // and remapped keyboards report it as Shift + "/" instead, so take both.
      const isHelp = key === '?' || (key === '/' && e.shiftKey);
      const name = isHelp ? '?' : e.shiftKey ? `shift+${key}` : key;
      const handler = handlers[name];
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

// --- The keyboard map (DESIGN.md 12), per screen --------------------------------
//
// Only keys that actually do something on that screen are listed, so the
// spoken help never promises a shortcut the student then finds is dead.

export type ScreenName =
  | 'home'
  | 'capture'
  | 'problem'
  | 'scratchpad'
  | 'lowvision'
  | 'settings'
  | 'export';

export interface Shortcut {
  /** How the key is said and shown, e.g. "Shift R". */
  keys: string;
  does: string;
}

const HELP: Shortcut = { keys: 'Question mark', does: 'hear these shortcuts' };

export const KEYMAP: Record<ScreenName, Shortcut[]> = {
  home: [{ keys: 'U or C', does: 'capture a problem' }, HELP],
  capture: [
    { keys: 'U', does: 'upload a file' },
    { keys: 'C', does: 'take a photo' },
    { keys: 'Control or Command V', does: 'paste a screenshot' },
    HELP,
  ],
  problem: [
    { keys: 'G', does: 'hear the structure of the line' },
    { keys: 'R', does: 'read the line' },
    { keys: 'Shift R', does: 'read the whole problem' },
    { keys: 'N', does: 'next line' },
    { keys: 'P', does: 'previous line' },
    { keys: 'Enter', does: 'explore inside the line with the arrow keys; Escape to come out' },
    { keys: 'W', does: 'what changed from the line before (not in exam mode)' },
    { keys: 'L', does: 'low-vision mode' },
    { keys: 'S', does: 'start working' },
    { keys: 'U', does: 'capture another problem' },
    { keys: 'X', does: 'hand in your work' },
    HELP,
  ],
  scratchpad: [
    { keys: 'Space, held down', does: 'record a line while you speak' },
    { keys: 'H', does: 'hands-free: just talk, and say stop listening to stop' },
    { keys: 'Enter', does: 'save the line you just heard' },
    { keys: 'E', does: 'edit it before saving' },
    { keys: 'Escape', does: 'discard it' },
    { keys: '1, 2 or 3', does: 'answer a which-did-you-mean question' },
    { keys: 'Shift R', does: 'read all your work' },
    { keys: 'U', does: 'undo a delete' },
    { keys: 'P', does: 'show or hide the problem' },
    { keys: 'X', does: 'hand in your work' },
    {
      keys: 'Say or type a command',
      does: 'for example next line, read line two, delete line two, undo, check this step, change the three to a four, hand in, help',
    },
    HELP,
  ],
  settings: [
    { keys: 'Arrow keys', does: 'choose a mode once you are on the mode list' },
    HELP,
  ],
  export: [{ keys: 'D', does: 'download the accessible HTML file' }, HELP],
  lowvision: [
    { keys: 'Right or Down arrow', does: 'next line' },
    { keys: 'Left or Up arrow', does: 'previous line' },
    { keys: 'Plus', does: 'larger' },
    { keys: 'Minus', does: 'smaller' },
    { keys: 'T', does: 'change colours' },
    { keys: 'Escape', does: 'leave low-vision mode' },
    HELP,
  ],
};

/** The help as one sentence-per-key string, for a screen reader to read out. */
export function helpText(screen: ScreenName): string {
  const keys = KEYMAP[screen].map((k) => `${k.keys}: ${k.does}.`).join(' ');
  return `Keyboard shortcuts. ${keys}`;
}
