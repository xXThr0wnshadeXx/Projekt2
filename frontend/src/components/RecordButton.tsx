// RecordButton — issue #16.
//
// Two interactions, because the two platforms genuinely differ:
//
//   Desktop: hold Space, speak, release. Push-to-talk is the right shape when
//   you can hold a key — the student controls exactly what is captured.
//
//   Touch: tap to start, tap to stop. A *hold* gesture is wrong here. With
//   VoiceOver or TalkBack on, a press-and-hold is intercepted by the screen
//   reader and never reaches the page, so a hold-to-talk button is simply
//   unusable for the people this app is for (DESIGN.md 13).
//
// The button is a real <button> with an accessible name that changes with its
// state, so a screen reader announces "Stop recording" once recording starts
// without needing a live region for it.

import { useEffect, useRef, useState } from 'react';
import { Recorder, isSupported, type Recording } from '../audio/recorder';
import { announce } from './LiveRegion';
import { shouldIgnore } from '../shortcuts';

export interface RecordButtonProps {
  onResult: (recording: Recording) => void;
  onError: (message: string) => void;
  /** Blocked while a previous line is still being transcribed. */
  disabled?: boolean;
}

/** True when this is a touch device, where hold-to-talk must not be used. */
export function prefersTapToggle(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(pointer: coarse)').matches === true ||
    navigator.maxTouchPoints > 1
  );
}

export function RecordButton({ onResult, onError, disabled = false }: RecordButtonProps) {
  const [recording, setRecording] = useState(false);
  const recorder = useRef<Recorder | null>(null);
  const busy = useRef(false);
  const tapToggle = useRef(prefersTapToggle());

  useEffect(() => {
    const r = new Recorder();
    r.onCapped = () => announce('That is the longest line I can take. Stopping there.');
    recorder.current = r;
    return () => r.cancel();
  }, []);

  async function start() {
    if (busy.current || disabled || recording) return;
    busy.current = true;
    try {
      await recorder.current?.start();
      setRecording(true);
      announce('Recording. Speak your line.', 'assertive');
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Could not start recording.');
    } finally {
      busy.current = false;
    }
  }

  async function stop() {
    if (!recorder.current?.recording) return;
    setRecording(false);
    try {
      const result = await recorder.current.stop();
      onResult(result);
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Nothing was recorded.');
    }
  }

  // Hold Space, anywhere on the screen. Repeat events fire while a key is held
  // down, so the first one starts and the rest are ignored.
  useEffect(() => {
    if (tapToggle.current) return;

    function onDown(e: KeyboardEvent) {
      if (e.code !== 'Space' || e.repeat || shouldIgnore(e)) return;
      // Space on a focused button would otherwise also click it, which would
      // immediately toggle recording back off.
      e.preventDefault();
      void start();
    }
    function onUp(e: KeyboardEvent) {
      if (e.code !== 'Space' || shouldIgnore(e)) return;
      e.preventDefault();
      void stop();
    }
    // Releasing the key outside the window would otherwise leave it recording.
    function onBlur() {
      if (recorder.current?.recording) void stop();
    }

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  });

  if (!isSupported()) {
    return (
      <p className="text-sm text-[--muted]">
        This browser cannot record audio. Type your line in the box below.
      </p>
    );
  }

  const label = recording ? 'Stop recording' : 'Record a line';

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="btn"
        aria-pressed={recording}
        disabled={disabled}
        data-testid="record-button"
        onClick={() => {
          // Click is the tap-toggle path, and also what a screen reader sends
          // when it activates the button on either platform.
          if (recording) void stop();
          else void start();
        }}
      >
        {label}
      </button>
      <span className="text-sm text-[--muted]">
        {recording
          ? 'Recording…'
          : tapToggle.current
            ? 'Tap to start, tap again to stop.'
            : 'Or hold Space while you speak.'}
      </span>
    </div>
  );
}
