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
  if (isSupported() && isBusy()) window.speechSynthesis.cancel();
}

function isBusy(): boolean {
  const s = window.speechSynthesis;
  // Stand-in engines in tests may not report state; treat unknown as busy.
  return s.speaking !== false || s.pending !== false;
}

// The browser's default voice is often its oldest, most robotic one. Pick the
// most natural English voice the device has: the neural "Natural" and
// "Online" voices on Windows and Edge, Google's voices in Chrome, and the
// Enhanced and Premium voices on Apple devices.
const PREFERRED = [
  /natural/i,
  /online/i,
  /premium/i,
  /enhanced/i,
  /^Google (UK|US) English/i,
  /^(Samantha|Ava|Allison|Serena|Daniel|Karen|Moira)/i,
];

let chosen: SpeechSynthesisVoice | null | undefined;

function bestVoice(): SpeechSynthesisVoice | null {
  if (chosen !== undefined) return chosen;
  const voices = window.speechSynthesis.getVoices?.() ?? [];
  if (!voices.length) return null; // not loaded yet; try again next time
  const english = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
  const pool = english.length ? english : voices;
  chosen =
    PREFERRED.map((re) => pool.find((v) => re.test(v.name))).find(Boolean) ??
    pool.find((v) => v.localService === false) ??
    pool.find((v) => v.default) ??
    pool[0] ??
    null;
  return chosen;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  // Chrome loads its voice list late; choose again once it arrives.
  window.speechSynthesis.addEventListener?.('voiceschanged', () => {
    chosen = undefined;
  });
}

function utter(text: string, rate: number): void {
  const u = new SpeechSynthesisUtterance(text);
  const voice = bestVoice();
  if (voice) {
    u.voice = voice;
    u.lang = voice.lang;
  } else {
    u.lang = 'en';
  }
  u.rate = rate;
  window.speechSynthesis.speak(u);
}

/** Speak `text` now, whatever the Read aloud setting (#236). For the one
 *  thing a student explicitly asked to hear by tapping Space. */
export function speakNow(text: string, rate = 1): boolean {
  if (!isSupported() || !text.trim()) return false;
  cancel();
  lastStarted = Date.now();
  utter(text, rate);
  return true;
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
  // Only cancel when something is actually being said: a cancel that is
  // immediately followed by speak() can drop or restart the new line in
  // Chrome, which sounds like the voice stuttering.
  if ((urgent || now - lastStarted > FOLLOW_UP_MS) && isBusy()) cancel();
  lastStarted = now;
  utter(text, 1);
}
