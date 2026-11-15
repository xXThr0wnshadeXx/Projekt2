// The app's own voice — issue #13 / Flow C, and the natural voice of #182.
//
// Off by default. A screen reader already reads the live regions, and two
// voices at once is unusable (DESIGN.md 13). But most people with low vision
// run no screen reader at all, and for them an app that only writes to live
// regions is silent: "math you can hear" was true only for someone who had
// brought their own speech. When this is on, everything the app announces is
// also spoken — the announcement and the voice are one channel, fed from one
// place (LiveRegion), so nothing can be said to one audience and not the other.
//
// #182: for many students this voice *is* Glance, and the browser's built-in
// voice is flat and robotic. When the server offers a natural voice
// (`/api/health` says `voice: true`), announcements are spoken with it. Any
// problem — no server, a slow answer, an error, playback blocked — falls back
// to the browser's voice for that sentence, so the student is never left in
// silence. The queueing rules are the same for both voices.

import { speakAudio } from '../api';
import type { VoiceName } from '../state';

let enabled = false;
let lastStarted = 0;

/** A follow-up arriving this soon after the last message is part of the same
 *  event ("Saved as line 1." then "This step checks out.") and is queued
 *  behind it. Anything later is news, and replaces what is being said. */
const FOLLOW_UP_MS = 1500;

// --- natural voice state ---------------------------------------------------------

let naturalAvailable = false;
let voice: VoiceName = 'coral';
let rate = 1;
/** After a failure, use the browser's voice for a while instead of retrying. */
let naturalPausedUntil = 0;
const PAUSE_AFTER_FAILURE_MS = 60_000;

const queue: string[] = [];
let playing: HTMLAudioElement | null = null;
let busy = false;
let inFlight: AbortController | null = null;
/** Bumped on cancel, so audio that arrives after it is dropped. */
let generation = 0;

// Common phrases come back often ("Saved as line 1."); keep their audio.
const cache = new Map<string, string>();
const CACHE_SIZE = 60;

export function isSelfVoicingEnabled(): boolean {
  return enabled;
}

export function setSelfVoicing(on: boolean): void {
  enabled = on;
  if (!on) cancel();
}

/** Called with the server's answer to `/api/health`. */
export function setNaturalVoiceAvailable(on: boolean): void {
  naturalAvailable = on;
}

export function isNaturalVoiceAvailable(): boolean {
  return naturalAvailable;
}

/** The student's chosen voice and speed (Settings). */
export function setVoicePrefs(prefs: { voice: VoiceName; rate: number }): void {
  if (prefs.voice !== voice || prefs.rate !== rate) {
    cache.forEach((url) => URL.revokeObjectURL?.(url));
    cache.clear();
  }
  voice = prefs.voice;
  rate = prefs.rate;
}

export function isSupported(): boolean {
  return typeof window !== 'undefined' && ('speechSynthesis' in window || naturalAvailable);
}

function useNatural(): boolean {
  return (
    naturalAvailable &&
    voice !== 'browser' &&
    Date.now() >= naturalPausedUntil &&
    typeof window !== 'undefined' &&
    typeof window.Audio === 'function'
  );
}

export function cancel(): void {
  generation += 1;
  queue.length = 0;
  inFlight?.abort();
  inFlight = null;
  if (playing) {
    playing.onended = null;
    playing.pause();
  }
  playing = null;
  busy = false;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}

function browserUtter(text: string, speed: number): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = speed;
  u.lang = 'en';
  window.speechSynthesis.speak(u);
}

async function audioFor(text: string, signal: AbortSignal): Promise<string> {
  const key = `${voice}|${rate}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const blob = await speakAudio(text, voice, rate, signal);
  const url = URL.createObjectURL(blob);
  cache.set(key, url);
  if (cache.size > CACHE_SIZE) {
    const oldest = cache.keys().next().value as string;
    URL.revokeObjectURL?.(cache.get(oldest) ?? '');
    cache.delete(oldest);
  }
  return url;
}

/** Fall back to the browser's voice for this sentence and anything queued. */
function fallBack(text: string, mine: number): void {
  if (mine !== generation) return;
  naturalPausedUntil = Date.now() + PAUSE_AFTER_FAILURE_MS;
  busy = false;
  playing = null;
  browserUtter(text, rate);
  while (queue.length) browserUtter(queue.shift() as string, rate);
}

async function playNext(): Promise<void> {
  if (busy) return;
  const text = queue.shift();
  if (!text) return;
  busy = true;
  const mine = generation;
  const controller = new AbortController();
  inFlight = controller;
  let url: string;
  try {
    url = await audioFor(text, controller.signal);
  } catch {
    fallBack(text, mine);
    return;
  }
  if (mine !== generation) return;
  inFlight = null;
  const audio = new window.Audio(url);
  playing = audio;
  audio.onended = () => {
    if (mine !== generation) return;
    playing = null;
    busy = false;
    void playNext();
  };
  try {
    await audio.play();
  } catch {
    // Autoplay blocked, or the audio would not decode.
    fallBack(text, mine);
  }
}

function utter(text: string, speed: number): void {
  if (useNatural()) {
    queue.push(text);
    void playNext();
    return;
  }
  browserUtter(text, speed * rate);
}

/** Speak `text`, replacing anything in progress. No-op unless switched on. */
export function speak(text: string, speed = 1): void {
  if (!enabled || !isSupported() || !text.trim()) return;
  cancel();
  lastStarted = Date.now();
  utter(text, speed);
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

/** "Test voice" in Settings: speak a sample even with reading aloud off. */
export function testVoice(): void {
  if (!isSupported()) return;
  cancel();
  lastStarted = Date.now();
  utter('This is how Glance sounds. On top, the square root of x plus 1. On the bottom, 2.', 1);
}
