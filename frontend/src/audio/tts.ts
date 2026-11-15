// The app's own voice — issue #13 / Flow C.
//
// Off by default. A screen reader already reads the live regions, and two
// voices at once is unusable (DESIGN.md 13). But most people with low vision
// run no screen reader at all, and for them an app that only writes to live
// regions is silent: "math you can hear" was true only for someone who had
// brought their own speech. When this is on, everything the app announces is
// also spoken — the announcement and the voice are one channel, fed from one
// place (LiveRegion), so nothing can be said to one audience and not the other.

let enabled = false;
let lastStarted = 0;

/** A follow-up arriving this soon after the last message is part of the same
 *  event ("Saved as line 1." then "This step checks out.") and is queued
 *  behind it. Anything later is news, and replaces what is being said. */
const FOLLOW_UP_MS = 1500;

export function isSelfVoicingEnabled(): boolean {
  return enabled;
}

export function setSelfVoicing(on: boolean): void {
  enabled = on;
  if (!on) cancel();
}

export function isSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function cancel(): void {
  if (isSupported()) window.speechSynthesis.cancel();
}

function utter(text: string, rate: number): void {
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate;
  u.lang = 'en';
  window.speechSynthesis.speak(u);
}

/** Speak `text`, replacing anything in progress. No-op unless switched on. */
export function speak(text: string, rate = 1): void {
  if (!enabled || !isSupported() || !text.trim()) return;
  cancel();
  lastStarted = Date.now();
  utter(text, rate);
}

/** Speak once, even with the app's voice switched off — issue #200.
 *
 *  Only for the very first gesture on a first visit, so a student with no
 *  screen reader hears how to turn the voice on. Browsers allow speech only
 *  after a gesture, which is why it waits for one. */
export function speakOnce(text: string): void {
  if (!isSupported() || !text.trim()) return;
  cancel();
  lastStarted = Date.now();
  utter(text, 1);
}

/** Speak an announcement. An urgent one interrupts; a quick follow-up waits
 *  its turn; anything else replaces what was being said. */
export function say(text: string, urgent = false): void {
  if (!enabled || !isSupported() || !text.trim()) return;
  const now = Date.now();
  if (urgent || now - lastStarted > FOLLOW_UP_MS) cancel();
  lastStarted = now;
  utter(text, 1);
}
