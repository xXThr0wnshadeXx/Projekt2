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

type Busy = 'idle' | 'preparing' | 'reading';

/** A PDF waiting for the student to say which page they want. */
interface PendingPdf {
  file: File;
  pages: number;
}

export interface CaptureProps {
  onCaptured: (problem: Problem) => void;
  onBack: () => void;
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

export function Capture({ onCaptured, onBack }: CaptureProps) {
  const [busy, setBusy] = useState<Busy>('idle');
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [liveBoard, setLiveBoard] = useState(false);
  const [pdf, setPdf] = useState<PendingPdf | null>(null);
  const [pageWanted, setPageWanted] = useState('1');

  const fileInput = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // Land on the heading so a screen reader reads where it is, not mid-page.
  useEffect(() => {
    heading.current?.focus();
    announce('Capture. Upload a file, paste a screenshot, or take a photo.');
  }, []);

  function stopCamera() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCameraOn(false);
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
      announce('Camera on. Hold the phone about 30 centimetres above the page, then press Take photo.');
      // The element only exists once `cameraOn` has rendered it.
      window.setTimeout(() => {
        if (video.current) {
          video.current.srcObject = media;
          void video.current.play().catch(() => {});
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
      u: () => fileInput.current?.click(),
      c: () => void startCamera(),
    },
    !working && !liveBoard && !cameraStarting,
  );

  if (liveBoard) {
    return <LiveBoard onBack={() => {
      setLiveBoard(false);
      announce('Back to capture.');
      window.setTimeout(() => heading.current?.focus(), 0);
    }} />;
  }

  return (
    <main id="main" className="mx-auto max-w-3xl px-6 py-8">
      <h2
        ref={heading}
        tabIndex={-1}
        className="text-2xl font-semibold tracking-tight focus-visible:ring-4 focus-visible:ring-[--accent]"
      >
        Capture a problem
      </h2>
      <p className="mt-2 text-[--muted]">
        Upload a file, press <kbd className="kbd">Ctrl</kbd> or{' '}
        <kbd className="kbd">Cmd</kbd> + <kbd className="kbd">V</kbd> to paste a
        screenshot, or take a photo. Nothing is stored on the server.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <input
          ref={fileInput}
          type="file"
          accept={[...CAPTURE_TYPES, 'application/pdf'].join(',')}
          className="sr-only"
          onChange={(e) => {
            acceptFile(e.target.files?.[0], 'upload');
            // Clear, so choosing the same file twice fires change again.
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="btn"
          disabled={working}
          onClick={() => fileInput.current?.click()}
        >
          Upload a file
        </button>
        <button type="button" className="btn" disabled={working || cameraStarting} onClick={startCamera}>
          {cameraOn ? 'Restart camera' : 'Take a photo'}
        </button>
        <button type="button" className="btn" disabled={working || cameraOn || cameraStarting || Boolean(pdf)} onClick={() => setLiveBoard(true)}>
          Live board
        </button>
        <button type="button" className="btn" disabled={working} onClick={onBack}>
          Back
        </button>
      </div>

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
    </main>
  );
}
