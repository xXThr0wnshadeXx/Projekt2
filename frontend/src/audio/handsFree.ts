// Hands-free dictation — issue #183.
//
// Holding Space works at a keyboard, but a student working by ear should be
// able to just talk, the way they would to a human scribe. While hands-free is
// on, Glance listens, notices when the student starts and stops speaking, and
// sends each utterance through the same path as a held-Space recording.
//
// Only the microphone level is watched continuously, in the browser. Audio is
// recorded only while the student is speaking, and nothing is sent until they
// stop. Echo cancellation is on, so Glance's own voice is not taken for the
// student's; and when the student starts talking, Glance stops talking.

import { MAX_SECONDS, pickMimeType, type Recording } from './recorder';

/** Decides from microphone levels when speech starts and ends. Pure, so it
 *  can be tested without a microphone. */
export class SpeechGate {
  private floor = 0.01;
  private aboveSince: number | null = null;
  private belowSince: number | null = null;
  speaking = false;

  constructor(
    /** Loud enough for this long counts as speech starting. */
    private readonly startMs = 150,
    /** Quiet for this long counts as the end of what they said. */
    private readonly endMs = 900,
  ) {}

  /** Feed one level reading (RMS, 0 to 1). Returns 'start', 'end' or null. */
  feed(level: number, now: number): 'start' | 'end' | null {
    // The room's background level is learned while nobody is speaking.
    if (!this.speaking) this.floor = this.floor * 0.95 + level * 0.05;
    const threshold = Math.max(0.02, this.floor * 3);
    const loud = level > threshold;

    if (!this.speaking) {
      if (!loud) {
        this.aboveSince = null;
        return null;
      }
      this.aboveSince ??= now;
      if (now - this.aboveSince >= this.startMs) {
        this.speaking = true;
        this.belowSince = null;
        return 'start';
      }
      return null;
    }
    if (loud) {
      this.belowSince = null;
      return null;
    }
    this.belowSince ??= now;
    if (now - this.belowSince >= this.endMs) {
      this.speaking = false;
      this.aboveSince = null;
      return 'end';
    }
    return null;
  }
}

export interface HandsFreeEvents {
  /** The student started speaking: stop talking over them. */
  onSpeechStart: () => void;
  /** One finished utterance, ready to transcribe. */
  onUtterance: (recording: Recording) => void;
  onError: (message: string) => void;
}

export class HandsFree {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private timer = 0;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private gate = new SpeechGate();
  /** While an utterance is being handled, new speech is not recorded. */
  paused = false;

  constructor(private readonly events: HandsFreeEvents) {}

  get listening(): boolean {
    return this.stream !== null;
  }

  async start(): Promise<void> {
    if (this.stream) return;
    const mime = pickMimeType();
    if (!mime || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser cannot listen hands-free. Hold Space to record, or type your line.');
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      throw new Error('I could not use the microphone. Check the permission, or type your line.');
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    this.context = new Ctx();
    // Some browsers start it suspended until the page is interacted with.
    await this.context.resume().catch(() => {});
    const source = this.context.createMediaStreamSource(this.stream);
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    this.gate = new SpeechGate();

    this.timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += s * s;
      const level = Math.sqrt(sum / samples.length);
      const event = this.gate.feed(level, performance.now());
      if (event === 'start' && !this.paused) this.begin(mime);
      if (event === 'end') this.finish();
      // Never longer than the server accepts.
      if (this.recorder && Date.now() - this.startedAt > MAX_SECONDS * 1000) this.finish();
    }, 50);
  }

  private begin(mime: string) {
    if (!this.stream || this.recorder) return;
    this.events.onSpeechStart();
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream, { mimeType: mime });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    const type = mime.split(';', 1)[0];
    this.recorder.onstop = () => {
      const seconds = (Date.now() - this.startedAt) / 1000;
      const blob = new Blob(this.chunks, { type });
      this.recorder = null;
      // A cough or a click is not a line.
      if (blob.size > 0 && seconds >= 0.4) this.events.onUtterance({ blob, contentType: type, seconds });
    };
    this.startedAt = Date.now();
    this.recorder.start();
  }

  private finish() {
    if (this.recorder?.state === 'recording') this.recorder.stop();
  }

  stop(): void {
    window.clearInterval(this.timer);
    if (this.recorder?.state === 'recording') {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.recorder = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.context?.close().catch(() => {});
    this.context = null;
  }
}
