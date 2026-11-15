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
import { capture, ApiFailure, CAPTURE_TYPES } from '../api';
import { downscale, sharpestFrame } from '../image';
import { useShortcuts } from '../shortcuts';
import type { Problem } from '../state';

type Busy = 'idle' | 'preparing' | 'reading';

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

  function acceptFile(file: File | null | undefined, source: Problem['source']) {
    if (!file) return;
    if (file.type === 'application/pdf') {
      const message =
        'PDF pages are not supported yet. Upload a screenshot or photo of the page instead.';
      setError(message);
      announce(message, 'assertive');
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
      if (busy !== 'idle') return;
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith('image/'),
      );
      if (!item) return;
      e.preventDefault();
      acceptFile(item.getAsFile(), 'paste');
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [busy]);

  async function startCamera() {
    setError('');
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
    !working,
  );

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
          accept={CAPTURE_TYPES.join(',')}
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
        <button type="button" className="btn" disabled={working} onClick={startCamera}>
          {cameraOn ? 'Restart camera' : 'Take a photo'}
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
