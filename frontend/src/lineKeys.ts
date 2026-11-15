// Arrow keys and the space bar drive Glance (issue #236).
//
// A student who can't see the screen needs controls they can find without
// looking, and the arrows and the space bar are the easiest keys to find on
// any keyboard. Up or Left goes to the previous line, Down or Right to the
// next, and a tap of Space reads the current line aloud.
//
// The same rules as every other shortcut decide when a key is not ours
// (shouldIgnore): text boxes, the equation explorer, and modifier chords
// belong to someone else. A focused button or link keeps Space and Enter too,
// because Space is how a keyboard user presses a button.

import { useEffect } from 'react';
import { shouldIgnore } from './shortcuts';
import { speakNow } from './audio/tts';
import { announce } from './components/LiveRegion';

/** Space presses these; it must never be taken from them. */
export function isPressable(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('button, a[href], summary, [role="button"]'));
}

/**
 * Say `text` out loud because the student asked to hear it.
 *
 * Glance's own voice, whatever the Read aloud setting: a tap of Space has to
 * be audible without a screen reader. It is not also put in the live region,
 * so a screen reader user hears it once, not twice. If the browser cannot
 * speak, the live region is the fallback.
 */
export function readAloud(text: string): void {
  if (!speakNow(text)) announce(text);
}

export interface LineKeys {
  previous: () => void;
  next: () => void;
  /** Tap of Space. Leave out where something else owns Space (the recorder). */
  read?: () => void;
}

export function useLineKeys(keys: LineKeys, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      // Something else already took this key (the recorder owns Space while
      // it is on screen): leave it alone.
      if (e.defaultPrevented || shouldIgnore(e)) return;
      switch (e.key) {
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault();
          keys.previous();
          return;
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault();
          keys.next();
          return;
        case ' ':
          if (!keys.read || e.repeat || isPressable(e.target)) return;
          e.preventDefault();
          keys.read();
          return;
        default:
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
}
