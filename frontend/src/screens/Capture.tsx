// Capture screen — issue #9, with the retake guidance of issue #14.
//
// Three ways in, because a student's math arrives in three different ways: a
// file they were sent, a screenshot of a slide, a photo of a page or a board
// (DESIGN.md 5). All three are reachable by keyboard alone — no region drawing,
// no crosshair, which is the whole blind-first wedge in DESIGN.md 3.
//
// The rule that shapes this screen: a blind student must never be left
// wondering whether anything happened. Every state change is announced, work
// in progress is announced after a beat, and the result moves focus.

import { useEffect, useRef, useState } from 'react';
import { announce } from '../components/LiveRegion';
import { LiveBoard } from './LiveBoard';
import { capture, pdfPageCount, pdfPage, ApiFailure, CAPTURE_TYPES } from '../api';
import { downscale, sharpestFrame } from '../image';
import { useShortcuts } from '../shortcuts';
import type { Problem } from '../state';
import { analyseFrame } from '../camera/framing';
import { FramingGuide, tick } from '../camera/guide';

type Busy = 'idle' | 'preparing' | 'reading';

/** A PDF waiting for the student to say which page they want. */
interface PendingPdf {
  file: File;
  pages: number;
}

export interface CaptureProps {
  onCaptured: (problem: Problem) => void;
  /** Opens the built-in sample problem. */
  onSample: () => void;
  /** Only while a problem is already loaded: keep it instead. */
  onCancel?: () => void;
}

/** Turn capture warnings into one spoken, actionable instruction (issue #14).
 *
 *  The model is prompted to return short, already-actionable warnings
 *  (DESIGN.md 10.1). Several at once would be a paragraph, so only the first is
 *  spoken; the rest stay on screen.
 */
export function retakeGuidance(warnings: string[]): string | null {
  const first = warnings.map((w) => w.trim()).find(Boolean);
  if (!first) return null;
  const ends = /[.!?]$/.test(first) ? '' : '.';
  return `${first}${ends} Try again when you are ready.`;
}

export function Capture({ onCaptured, onSample, onCancel }: CaptureProps) {
  const [busy, setBusy] = useState<Busy>('idle');
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const guideTimer = useRef<number | null>(null);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [liveBoard, setLiveBoard] = useState(false);
  const [pdf, setPdf] = useState<PendingPdf | null>(null);
  const [pageWanted, setPageWanted] = useState('1');

  const fileInput = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const section = useRef<HTMLElement>(null);
  // The three ways in stay behind one clear button until it is pressed, so
  // the first thing on the page is a single obvious action. Replacing a
  // worksheet opens them straight away.
  const [choosing, setChoosing] = useState(Boolean(onCancel));

  function openChoices() {
    setChoosing(true);
    announce(
      'Three ways to bring in a problem. Upload a file you already have, take a photo, or follow a live board. Use the Down arrow to hear each one, and Space to choose.',
    );
    window.setTimeout(() => document.querySelector<HTMLElement>('#capture-choices .choice')?.focus(), 60);
  }

  function stopCamera() {
    if (guideTimer.current) window.clearInterval(guideTimer.current);
    guideTimer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCameraOn(false);
  }

  /** Watch the preview and steer the phone onto the page (#198). Nothing is
   *  uploaded while guiding; only the photo it finally takes is sent. */
  function startGuiding() {
    const frame = document.createElement('canvas');
    const guide = new FramingGuide({
      say: (text) => announce(text),
      tone: tick,
      onReady: () => {
        if (guideTimer.current) window.clearInterval(guideTimer.current);
        guideTimer.current = null;
        announce('Got it. Taking the photo.');
        void takePhoto();
      },
    });
    guideTimer.current = window.setInterval(() => {
      const v = video.current;
      if (!v || v.readyState < 2 || !v.videoWidth) return;
      const w = 160;
      const h = Math.max(1, Math.round((v.videoHeight / v.videoWidth) * w));
      frame.width = w;
      frame.height = h;
      const ctx = frame.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, w, h);
      guide.frame(analyseFrame(ctx.getImageData(0, 0, w, h).data, w, h));
    }, 300);
  }

  useEffect(() => stopCamera, []);

  async function send(image: Blob, source: Problem['source']) {
    setError('');
    setWarnings([]);
    setBusy('preparing');

    // Announced only if the wait is long enough to be worth interrupting for.
    // DESIGN.md 16 asks for "Working…" after a second.
    const slow = window.setTimeout(
      () => announce('Still reading your problem…'),
      1000,
    );

    try {
      const prepared = await downscale(image);
      setBusy('reading');
      announce('Reading your problem…');

      const result = await capture(prepared);

      if (result.lines.length === 0) {
        const guidance = retakeGuidance(result.warnings);
        setWarnings(result.warnings);
        const message = guidance
          ? `I did not find any math in that. ${guidance}`
          : 'I did not find any math in that. Try another photo or file.';
        setError(message);
        announce(message, 'assertive');
        return;
      }

      const problem: Problem = { ...result, source };
      const unsure = result.lines.filter((l) => !l.valid).length;
      const guidance = retakeGuidance(result.warnings);

      // One sentence that tells the student everything they need before focus
      // moves: how much was found, what is uncertain, and what to do about it.
      const found = `Found ${result.lines.length} ${
        result.lines.length === 1 ? 'line' : 'lines'
      }.`;
      const instructions = result.instructions ? ` ${result.instructions}` : '';
      const unsureNote = unsure
        ? ` ${unsure} ${unsure === 1 ? 'line is' : 'lines are'} unsure.`
        : '';
      const retake = guidance ? ` ${guidance}` : '';
      announce(`${found}${instructions}${unsureNote}${retake}`);

      setWarnings(result.warnings);
      onCaptured(problem);
    } catch (e: unknown) {
      const message =
        e instanceof ApiFailure
          ? e.message
          : e instanceof Error && e.message
            ? e.message
            : 'Something went wrong reading that image.';
      setError(message);
      announce(message, 'assertive');
    } finally {
      window.clearTimeout(slow);
      setBusy('idle');
    }
  }

  /** Ask the back end how many pages, then ask the student which one.
   *
   *  A scanned worksheet is usually several pages and only one of them is the
   *  problem, so DESIGN.md F1 asks for the page number rather than guessing.
   *  A one-page PDF is not worth a question, so it goes straight through.
   */
  async function openPdf(file: File) {
    setError('');
    setPdf(null);
    setBusy('preparing');
    announce('Reading the PDF…');
    try {
      const { pages } = await pdfPageCount(file);
      if (pages <= 1) {
        await sendPdfPage(file, 1);
        return;
      }
      setPdf({ file, pages });
      setPageWanted('1');
      announce(`This PDF has ${pages} pages. Which page is your problem on?`);
      window.setTimeout(() => {
        document.getElementById('pdf-page')?.focus();
      }, 60);
    } catch (e: unknown) {
      const message = e instanceof ApiFailure ? e.message : 'I could not read that PDF.';
      setError(message);
      announce(message, 'assertive');
    } finally {
      setBusy('idle');
    }
  }

  /** Render one page to an image and capture it like any other photo. */
  async function sendPdfPage(file: File, page: number) {
    setBusy('preparing');
    announce(`Opening page ${page}…`);
    try {
      const png = await pdfPage(file, page);
      setPdf(null);
      await send(png, 'upload');
    } catch (e: unknown) {
      const message = e instanceof ApiFailure ? e.message : 'I could not open that page.';
      setError(message);
      announce(message, 'assertive');
      setBusy('idle');
    }
  }

  function acceptFile(file: File | null | undefined, source: Problem['source']) {
    if (!file) return;
    if (file.type === 'application/pdf') {
      void openPdf(file);
      return;
    }
    if (!CAPTURE_TYPES.includes(file.type)) {
      const message = 'Upload a JPEG, PNG, WebP or GIF image.';
      setError(message);
      announce(message, 'assertive');
      return;
    }
    void send(file, source);
  }

  // Paste works anywhere on this screen (DESIGN.md 6, F2): a student takes a
  // full-screen screenshot and presses Ctrl or Cmd+V without hunting for a
  // drop zone first.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (busy !== 'idle' || liveBoard) return;
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith('image/'),
      );
      if (!item) return;
      e.preventDefault();
      acceptFile(item.getAsFile(), 'paste');
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [busy, liveBoard]);

  async function startCamera() {
    setError('');
    setCameraStarting(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        // The back camera is the one pointed at a page or a board.
        video: { facingMode: { ideal: 'environment' } },
      });
      stream.current = media;
      setCameraOn(true);
      announce(
        'Camera on. Point it down at your worksheet. I will tell you how to move the phone, and take the photo when the whole page is in view.',
      );
      // The element only exists once `cameraOn` has rendered it.
      window.setTimeout(() => {
        if (video.current) {
          video.current.srcObject = media;
          void video.current.play().catch(() => {});
          startGuiding();
        }
      }, 0);
    } catch {
      const message = 'I could not open the camera. Check the permission, or upload a photo instead.';
      setError(message);
      announce(message, 'assertive');
    } finally {
      setCameraStarting(false);
    }
  }

  async function takePhoto() {
    if (!video.current) return;
    if (guideTimer.current) window.clearInterval(guideTimer.current);
    guideTimer.current = null;
    try {
      announce('Taking the photo. Hold still.');
      // Three frames, sharpest kept (DESIGN.md 5, Flow D) — a handheld shot of
      // a worksheet is very often blurred by the shutter.
      const frame = await sharpestFrame(video.current);
      stopCamera();
      await send(frame, 'camera');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Could not take a photo.';
      setError(message);
      announce(message, 'assertive');
    }
  }

  const working = busy !== 'idle';

  // DESIGN.md 12: U uploads, C opens the camera. Paste is handled above.
  useShortcuts(
    {
      u: () => {
        setChoosing(true);
        fileInput.current?.click();
      },
      c: () => {
        setChoosing(true);
        void startCamera();
      },
    },
    !working && !liveBoard && !cameraStarting,
    section,
  );

  if (liveBoard) {
    return <LiveBoard onBack={() => {
      setLiveBoard(false);
      announce('Back to capture.');
      window.setTimeout(() => heading.current?.focus(), 0);
    }} />;
  }

  return (
    <section ref={section} id="step-worksheet" aria-labelledby="capture-heading" className="step">
      <h2
        ref={heading}
        id="capture-heading"
        tabIndex={-1}
        className="step-title text-center focus-visible:ring-4 focus-visible:ring-[--accent]"
      >
        Get started
      </h2>
      <p className="get-started-lead">
        Glance reads your maths worksheet aloud, lets you explore each line
        piece by piece, and writes down your own working as you say it.{' '}
        <strong>It never solves anything for you</strong>, so the work stays
        yours, in class and in exams.
      </p>

      {/* The file input the "Upload a file" choice opens. It stays mounted so
          U and paste work before the choices are shown, and out of the tab
          order so keyboard users don't meet a second, unexplained stop (#31). */}
      <input
        ref={fileInput}
        type="file"
        accept={[...CAPTURE_TYPES, 'application/pdf'].join(',')}
        aria-label="Choose an image or PDF file"
        tabIndex={-1}
        className="sr-only"
        onChange={(e) => {
          acceptFile(e.target.files?.[0], 'upload');
          // Clear, so choosing the same file twice fires change again.
          e.target.value = '';
        }}
      />

      {!choosing ? (
        <div className="hero-action">
          <button
            type="button"
            className="btn-hero"
            aria-expanded="false"
            aria-controls="capture-choices"
            disabled={working}
            onClick={openChoices}
          >
            Capture a problem
          </button>
        </div>
      ) : (
        <div
          id="capture-choices"
          role="group"
          aria-label="How to bring in your problem"
          className="capture-choices"
        >
          {/* Upload leads: it works on every machine, needs no permission
              prompt, and is how students actually receive course material. A
              camera asks a blind user to aim it, the hardest thing here. */}
          <button
            type="button"
            className="choice"
            disabled={working}
            aria-describedby="choice-upload-desc"
            onClick={() => fileInput.current?.click()}
          >
            <span className="choice-title">Upload a file</span>
            <span id="choice-upload-desc" className="choice-desc">
              A photo, screenshot or PDF you already have.
            </span>
          </button>
          <button
            type="button"
            className="choice"
            disabled={working || cameraStarting}
            aria-describedby="choice-photo-desc"
            onClick={startCamera}
          >
            <span className="choice-title">{cameraOn ? 'Restart camera' : 'Take a photo'}</span>
            <span id="choice-photo-desc" className="choice-desc">
              Point your camera at the page. Glance tells you how to move it.
            </span>
          </button>
          <button
            type="button"
            className="choice"
            disabled={working || cameraOn || cameraStarting || Boolean(pdf)}
            aria-describedby="choice-board-desc"
            onClick={() => setLiveBoard(true)}
          >
            <span className="choice-title">Live board</span>
            <span id="choice-board-desc" className="choice-desc">
              Follow what a teacher writes on the board, as they write it.
            </span>
          </button>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-[--muted]">
        You can also paste a screenshot with <kbd className="kbd">Ctrl</kbd> or{' '}
        <kbd className="kbd">Cmd</kbd> + <kbd className="kbd">V</kbd>. Nothing is stored on the server.
      </p>
      <div className="mt-2 text-center">
        <button type="button" className="btn-quiet" disabled={working} onClick={onSample}>
          Try a sample problem
        </button>
      </div>

      {onCancel && (
        <div className="mt-6">
          <button type="button" className="btn-quiet" disabled={working} onClick={onCancel}>
            Keep my current problem
          </button>
        </div>
      )}

      {/* Status is a live region in its own right so the visible text and the
          spoken text can never drift apart. */}
      <p role="status" className="mt-6 min-h-[1.5rem] text-[--muted]">
        {busy === 'preparing' && 'Preparing the image…'}
        {busy === 'reading' && 'Reading your problem…'}
      </p>

      {pdf && (
        <section aria-label="Choose a page" className="mt-4">
          <form
            // The browser's own number validation silently refuses to submit
            // and shows a bubble that screen readers do not reliably announce,
            // which would leave a blind student pressing Enter with no idea
            // why nothing happened. We validate and announce it ourselves.
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const page = Number(pageWanted);
              if (!Number.isInteger(page) || page < 1 || page > pdf.pages) {
                const message = `Enter a page number between 1 and ${pdf.pages}.`;
                setError(message);
                announce(message, 'assertive');
                return;
              }
              void sendPdfPage(pdf.file, page);
            }}
          >
            <label htmlFor="pdf-page" className="block font-medium">
              Which page is your problem on?
            </label>
            <p id="pdf-page-help" className="mt-1 text-sm text-[--muted]">
              This PDF has {pdf.pages} pages.
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              <input
                id="pdf-page"
                type="number"
                min={1}
                max={pdf.pages}
                value={pageWanted}
                aria-describedby="pdf-page-help"
                onChange={(e) => setPageWanted(e.target.value)}
                className="min-h-[48px] w-32 rounded-lg border border-[--line] bg-[--surface] px-4 text-[--fg]"
              />
              <button type="submit" className="btn" disabled={working}>
                Open this page
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setPdf(null);
                  announce('Cancelled.');
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {cameraOn && (
        <section aria-label="Camera" className="mt-4">
          <video
            ref={video}
            playsInline
            muted
            aria-label="Camera preview"
            className="w-full rounded-lg border border-[--line]"
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className="btn" disabled={working} onClick={takePhoto}>
              Take photo
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                stopCamera();
                announce('Camera off.');
              }}
            >
              Cancel camera
            </button>
          </div>
        </section>
      )}

      {error && (
        <p className="mt-6 rounded-lg border border-[--warn] px-4 py-3 text-[--warn]">
          {error}
        </p>
      )}

      {warnings.length > 0 && (
        <section aria-label="Photo quality notes" className="mt-4">
          <h3 className="text-sm font-semibold text-[--muted]">Photo quality</h3>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-[--warn]">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
