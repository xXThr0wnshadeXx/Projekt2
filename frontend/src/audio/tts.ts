// Optional self-voicing — issue #13 / Flow C.
//
// Off everywhere by default. A screen reader already reads the live regions,
// and two voices at once is unusable (DESIGN.md 13). Low-vision mode is the one
// place a student may want the app to read aloud, because many low-vision users
// run no screen reader at all — and there it is still opt-in.

let enabled = false;

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

/** Speak `text`, replacing anything in progress. No-op unless switched on. */
export function speak(text: string, rate = 1): void {
  if (!enabled || !isSupported() || !text.trim()) return;
  cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate;
  u.lang = 'en';
  window.speechSynthesis.speak(u);
}
