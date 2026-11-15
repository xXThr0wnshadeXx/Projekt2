// Push-to-talk recording — issue #16.
//
// The back end accepts exactly two containers, `audio/webm` and `audio/mp4`
// (see `routes/transcribe.py`). That split is not arbitrary: Chromium records
// WebM and will not produce MP4, Safari records MP4 and will not produce WebM.
// Picking the wrong one fails at the server with a message about upload
// formats, which tells a student nothing, so the format is negotiated here
// against what the browser actually reports it can do.
//
// Recording is capped slightly under the server's limit. Hitting the cap stops
// cleanly and keeps the audio, rather than uploading something that will be
// rejected for length.

/** Server limit is 30 s; stop just under it so a long line is never lost. */
export const MAX_SECONDS = 28;

/** Containers the back end accepts, in the order we would rather have them. */
const CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
];

export interface Recording {
  blob: Blob;
  /** `audio/webm` or `audio/mp4` — the bare type, which is what the API wants. */
  contentType: string;
  seconds: number;
}

export function isSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/** The first candidate this browser can actually record, or null. */
export function pickMimeType(): string | null {
  if (typeof window.MediaRecorder === 'undefined') return null;
  for (const type of CANDIDATES) {
    if (window.MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return null;
}

/** Strip codec parameters: the server matches on the bare media type. */
function bareType(mime: string): string {
  return mime.split(';', 1)[0].trim().toLowerCase();
}

export class Recorder {
  private media: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private capTimer = 0;
  private done: ((r: Recording) => void) | null = null;
  private fail: ((e: Error) => void) | null = null;

  /** Fired when the cap stops a recording, so the UI can say why. */
  onCapped: (() => void) | null = null;

  get recording(): boolean {
    return this.media?.state === 'recording';
  }

  /** Ask for the microphone and start. Rejects if permission is refused. */
  async start(): Promise<void> {
    if (this.recording) return;
    if (!isSupported()) {
      throw new Error('This browser cannot record audio. Type your line instead.');
    }
    const mime = pickMimeType();
    if (!mime) {
      throw new Error('This browser cannot record a supported audio format. Type your line instead.');
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      throw new Error(
        'I could not use the microphone. To allow it, open this site\'s settings in your browser, turn the microphone on, and try again. Or type your line instead.',
      );
    }

    this.stream = stream;
    this.chunks = [];
    this.media = new MediaRecorder(stream, { mimeType: mime });
    this.media.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.media.onstop = () => {
      const type = bareType(this.media?.mimeType || mime);
      const blob = new Blob(this.chunks, { type });
      const seconds = (Date.now() - this.startedAt) / 1000;
      this.release();
      this.done?.({ blob, contentType: type, seconds });
      this.done = null;
      this.fail = null;
    };
    this.media.onerror = () => {
      this.release();
      this.fail?.(new Error('The recording failed. Try again, or type your line.'));
      this.done = null;
      this.fail = null;
    };

    this.startedAt = Date.now();
    this.media.start();

    this.capTimer = window.setTimeout(() => {
      if (this.recording) {
        this.onCapped?.();
        this.media?.stop();
      }
    }, MAX_SECONDS * 1000);
  }

  /** Stop and resolve with the audio. Rejects if nothing was captured. */
  stop(): Promise<Recording> {
    return new Promise<Recording>((resolve, reject) => {
      if (!this.media || this.media.state === 'inactive') {
        reject(new Error('Nothing was recorded.'));
        return;
      }
      this.done = (r) =>
        // A tap so short it produced no audio is a mis-press, not a line.
        r.blob.size > 0 && r.seconds >= 0.25
          ? resolve(r)
          : reject(new Error('That was too short to hear. Hold while you speak.'));
      this.fail = reject;
      this.media.stop();
    });
  }

  /** Drop the recording and let go of the microphone. */
  cancel(): void {
    this.done = null;
    this.fail = null;
    if (this.media && this.media.state !== 'inactive') {
      this.media.onstop = null;
      this.media.stop();
    }
    this.release();
  }

  private release(): void {
    window.clearTimeout(this.capTimer);
    this.capTimer = 0;
    // Releasing every track is what turns the browser's recording indicator
    // off. Leaving it on makes the app look like it is always listening.
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.media = null;
  }
}
