import { useEffect, useRef, useState } from 'react';
import { ApiFailure, capture, type CaptureLine } from '../api';
import { announce } from '../components/LiveRegion';
import { MathLine } from '../components/MathLine';
import { sharpestFrame } from '../image';
import { loadMathJax } from '../math/mathjax';

const INTERVAL_MS = 10_000;

// A vision transcription can vary only in display formatting between frames.
// Those differences must not make an unchanged board sound like a new line.
function boardKey(latex: string) {
  return latex
    .replace(/\\tfrac/g, '\\frac')
    .replace(/\\left|\\right|\\,/g, '')
    .replace(/\s+/g, '')
    .trim();
}

interface Reading {
  controller: AbortController;
  stream?: MediaStream;
  timer?: number;
  seen: Set<string>;
}

function endReading(reading: Reading) {
  reading.controller.abort();
  window.clearTimeout(reading.timer);
  reading.stream?.getTracks().forEach((track) => track.stop());
}

async function spokenLabel(latex: string): Promise<string | null> {
  try {
    await loadMathJax();
    const node = await window.MathJax.tex2chtmlPromise(latex, { display: true });
    return node.getAttribute('aria-label');
  } catch {
    return null;
  }
}

async function boardLabels(lines: CaptureLine[]): Promise<(string | null)[]> {
  let timer: number | undefined;
  try {
    return await Promise.race([
      Promise.all(lines.map(async (line) => {
        const spoken = await spokenLabel(line.latex);
        return spoken ? spoken + (line.valid ? '' : ', unsure') : null;
      })),
      new Promise<null[]>((resolve) => { timer = window.setTimeout(() => resolve([]), 800); }),
    ]);
  } finally {
    window.clearTimeout(timer);
  }
}

export function LiveBoard({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<'idle' | 'starting' | 'reading'>('idle');
  const [lines, setLines] = useState<CaptureLine[]>([]);
  const [error, setError] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const active = useRef<Reading | null>(null);

  useEffect(() => {
    heading.current?.focus();
    announce('Live board. Start reading when the camera is aimed at the board.');
    return () => {
      if (active.current) endReading(active.current);
      active.current = null;
    };
  }, []);

  function stop(message = 'Live board stopped.', urgency: 'polite' | 'assertive' = 'polite') {
    const current = active.current;
    if (!current) return;
    active.current = null;
    endReading(current);
    if (video.current) video.current.srcObject = null;
    setState('idle');
    announce(message, urgency);
    window.requestAnimationFrame(() => startButton.current?.focus());
  }

  function fail(current: Reading, message: string) {
    if (active.current !== current) return;
    stop(message, 'assertive');
    setError(message);
  }

  async function readBoard(current: Reading) {
    const preview = video.current;
    if (!preview || active.current !== current) return;
    const start = performance.now();
    try {
      if (!document.hidden) {
        const frame = await sharpestFrame(preview, 1);
        if (active.current !== current) return;
        const result = await capture(frame, '', current.controller.signal);
        if (active.current !== current) return;

        const added: CaptureLine[] = [];
        for (const line of result.lines) {
          const key = boardKey(line.latex);
          if (!key || current.seen.has(key)) continue;
          current.seen.add(key);
          added.push({ ...line, id: 'board-line-' + current.seen.size });
        }

        if (added.length) {
          setLines((previous) => [...previous, ...added]);
          const labels = await boardLabels(added);
          if (active.current !== current) return;
          const count = added.length === 1 ? '1 new line.' : added.length + ' new lines.';
          announce([count, ...labels.filter(Boolean)].join(' '));
        }
      }
      current.timer = window.setTimeout(
        () => void readBoard(current), Math.max(1000, INTERVAL_MS - (performance.now() - start)),
      );
    } catch (failure) {
      const message = failure instanceof ApiFailure ? failure.message : 'Could not read the board.';
      fail(current, message + ' Live board paused. Start reading to try again.');
    }
  }

  async function start() {
    if (active.current) return;
    const current: Reading = { controller: new AbortController(), seen: new Set() };
    active.current = current;
    setState('starting');
    setError('');
    announce('Opening the camera.');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      current.stream = stream;
      if (active.current !== current || !video.current) {
        endReading(current);
        return;
      }
      const preview = video.current;
      preview.srcObject = stream;
      await preview.play();
      if (active.current !== current) return;
      stream.getVideoTracks().forEach((track) => track.addEventListener('ended', () => {
        fail(current, 'The camera stopped. Start reading to reconnect.');
      }, { once: true }));
      setLines([]);
      setState('reading');
      announce('Reading the board about every ten seconds.');
      void readBoard(current);
    } catch {
      fail(current, 'Could not open the camera. Check the camera permission and try again.');
    }
  }

  function discardLine(line: CaptureLine, index: number) {
    // Deliberately do not remove this key from `seen`: if the camera keeps
    // seeing the same bad transcription, discarding it must not make it speak
    // again on the next ten-second pass.
    const next = lines[index + 1] ?? lines[index - 1];
    setLines((previous) => previous.filter((item) => item.id !== line.id));
    announce(`Discarded board line ${index + 1}. It will not be read again.`);
    window.setTimeout(() => {
      if (next) document.getElementById(next.id)?.focus();
      else heading.current?.focus();
    }, 80);
  }

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-8">
      <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold focus-visible:outline">
        Live board
      </h2>
      <p className="mt-2 text-[--muted]">
        Aim your camera at a board. Glance sends a photo about every ten seconds and reads new lines.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button ref={startButton} type="button" className="btn" aria-disabled={state !== 'idle'} onClick={start}>
          Start reading
        </button>
        <button type="button" className="btn" disabled={state === 'idle'} onClick={() => stop()}>
          Stop reading
        </button>
        <button type="button" className="btn" onClick={onBack}>
          Back to capture
        </button>
      </div>
      <video ref={video} playsInline muted hidden={state === 'idle'} aria-label="Board camera preview"
        className="mt-4 w-full rounded-lg border border-[--line]" />
      {error && <p className="mt-4 text-[--warn]">{error}</p>}
      <section aria-label="Board lines" className="mt-6">
        <h3 className="font-semibold">Board lines</h3>
        <ol className="mt-3 space-y-3">
          {lines.map((line, i) => (
            <li key={line.id} className="relative">
              <MathLine id={line.id} latex={line.latex} label={'Board line ' + (i + 1)}
                unsure={!line.valid} />
              <button
                type="button"
                className="btn absolute right-3 top-3 min-w-[48px] justify-center px-0 text-2xl leading-none"
                onClick={() => discardLine(line, i)}
                aria-label={'Discard board line ' + (i + 1)}
                title="Discard this line"
              >
                <span aria-hidden="true">×</span>
                <span className="sr-only">Discard</span>
              </button>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
