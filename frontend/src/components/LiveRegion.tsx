// LiveRegion — issue #13.
//
// Screen readers are how this app talks. Two regions, because they behave
// differently: `polite` waits for a pause (progress, confirmations), `assertive`
// interrupts (errors, anything the student must hear now).
//
// The app's own text-to-speech stays off by default. A screen reader already
// reads these regions, and two voices at once is unusable (DESIGN.md 13).

import { useEffect, useRef, useState } from 'react';
import { cancel, say } from '../audio/tts';

type Urgency = 'polite' | 'assertive';

let announceImpl: (message: string, urgency?: Urgency) => void = () => {};

let last = '';

/** Announce a message to screen readers. Safe to call before mount. */
/** Announce where the student has just moved to. Whatever was still being
 *  read about the line they left is cut off first: pressing the arrows
 *  quickly must never stack up a queue of old lines. */
export function announceMove(message: string): void {
  cancel();
  announce(message);
}

export function announce(message: string, urgency: Urgency = 'polite'): void {
  last = message;
  announceImpl(message, urgency);
}

/** The most recent thing said, for "say that again". */
export function lastAnnouncement(): string {
  return last;
}

/** Move focus to the first match, so the student lands on the new result. */
export function focusFirst(selector: string): boolean {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return false;
  if (!el.hasAttribute('tabindex') && !isNativelyFocusable(el)) {
    el.setAttribute('tabindex', '-1');
  }
  el.focus();
  return true;
}

function isNativelyFocusable(el: HTMLElement): boolean {
  return ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
}

export function LiveRegion() {
  const [polite, setPolite] = useState('');
  const [assertive, setAssertive] = useState('');
  const timers = useRef<number[]>([]);

  useEffect(() => {
    announceImpl = (message, urgency = 'polite') => {
      const set = urgency === 'assertive' ? setAssertive : setPolite;
      // The app's own voice, for a student with no screen reader. Silent
      // unless they have switched it on.
      say(message, urgency === 'assertive');
      // Clearing first guarantees the same message announces twice if repeated;
      // without this, an identical string is silently ignored.
      set('');
      // An error stays in the assertive region until something replaces it,
      // and nothing ever did: it was still sitting at the top of the page two
      // screens later, where a screen-reader user reading from the top met a
      // complaint about a line they had long since fixed. Whatever is said
      // next is the news, so the old error goes.
      if (urgency === 'polite') setAssertive('');
      const t = window.setTimeout(() => set(message), 50);
      timers.current.push(t);
    };
    return () => {
      announceImpl = () => {};
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  return (
    <>
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="live-polite"
      >
        {polite}
      </div>
      <div
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
        data-testid="live-assertive"
      >
        {assertive}
      </div>
    </>
  );
}
