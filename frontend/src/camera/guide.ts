// Steering the phone onto the page by voice and sound — issue #198.
//
// Each camera frame gets a FrameReport (framing.ts). This turns a stream of
// them into something a person can follow without seeing anything:
// - words, but only when the advice changes, and never more often than every
//   couple of seconds, so it doesn't chatter;
// - a soft tick, panned toward the way to move, that speeds up as the page
//   gets centred, like a parking sensor;
// - and once the page has been well framed for about a second, the photo.

import { SAY, type FrameReport, type Guidance } from './framing';

export interface GuideOptions {
  say: (text: string) => void;
  /** Called once, when the page has been steady and well framed long enough. */
  onReady: () => void;
  /** Good frames in a row before taking the photo. */
  steadyFrames?: number;
  /** Shortest gap between spoken instructions, in milliseconds. */
  speakEveryMs?: number;
  now?: () => number;
  tone?: (pan: number, centred: number) => void;
}

export class FramingGuide {
  private lastSaid: Guidance | null = null;
  private lastSpokeAt = -Infinity;
  private goodRun = 0;
  private done = false;

  constructor(private readonly options: GuideOptions) {}

  /** Feed one frame's report. */
  frame(report: FrameReport): void {
    if (this.done) return;
    const { say, onReady, steadyFrames = 4, speakEveryMs = 2000, now = () => Date.now(), tone } = this.options;

    if (report.page) tone?.(report.pan, report.centred);

    if (report.guidance === 'good') {
      this.goodRun += 1;
      if (this.goodRun === 1) this.speak('good', say, now, 0);
      if (this.goodRun >= steadyFrames) {
        this.done = true;
        onReady();
      }
      return;
    }
    this.goodRun = 0;
    this.speak(report.guidance, say, now, speakEveryMs);
  }

  private speak(g: Guidance, say: (t: string) => void, now: () => number, gap: number) {
    const t = now();
    // Same advice as last time: only repeat it after a longer pause.
    const wait = g === this.lastSaid ? gap * 2 : gap;
    if (t - this.lastSpokeAt < wait) return;
    this.lastSaid = g;
    this.lastSpokeAt = t;
    say(SAY[g]);
  }
}

let audio: AudioContext | null = null;
let lastTick = 0;

/** A short tick, panned left or right; ticks come faster as `centred` nears 1. */
export function tick(pan: number, centred: number): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    const nowMs = performance.now();
    const interval = 650 - 500 * Math.max(0, Math.min(1, centred));
    if (nowMs - lastTick < interval) return;
    lastTick = nowMs;
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 520 + 380 * centred;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    let out: AudioNode = gain;
    if (typeof audio.createStereoPanner === 'function') {
      const panner = audio.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner);
      out = panner;
    }
    osc.connect(gain);
    out.connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  } catch {
    // Sound is a help, not a requirement: the spoken guidance still works.
  }
}
