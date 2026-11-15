// Shared helpers for the arrow-and-Space controls (issue #236). The page-wide
// traversal itself is in traverse.ts.

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
