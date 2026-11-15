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
import { isPressable } from '../lineKeys';

/** Said before the browser asks for the microphone, so the prompt is expected. */
export const MIC_EXPLAINED =
  'To hear you, I need the microphone. Your browser will ask now. Choose Allow.';

export interface RecordButtonProps {
  onResult: (recording: Recording) => void;
  onError: (message: string) => void;
  /** Blocked while a previous line is still being transcribed. */
  disabled?: boolean;
  /** A short tap of Space, as opposed to holding it to record (#236). */
  onTap?: () => void;
}

/** Held this long, Space records; released sooner, it was a tap (#236). */
export const HOLD_MS = 350;

const MIC_KEY = 'glance.microphoneAllowed';
// Safari cannot be asked about the microphone, so a start that worked is
// remembered instead, and the explanation is not repeated after it (#200).
let micWorked = false;

function micRemembered(): boolean {
  if (micWorked) return true;
  try {
    micWorked = localStorage.getItem(MIC_KEY) === '1';
  } catch {
    // Storage may be blocked. Then it is remembered for this visit only.
  }
  return micWorked;
}

function rememberMic(): void {
  micWorked = true;
  try {
    localStorage.setItem(MIC_KEY, '1');
  } catch {
    // Ignore: the in-memory flag still holds.
  }
}

/** True when this is a touch device, where hold-to-talk must not be used. */
export function prefersTapToggle(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(pointer: coarse)').matches === true ||
    navigator.maxTouchPoints > 1
  );
}

export function RecordButton({ onResult, onError, disabled = false, onTap }: RecordButtonProps) {
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;
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

  // Whether the browser will ask for the microphone (#200). Looked up ahead of
  // time, so the explanation is said inside the student's own press, before
  // the browser's prompt, with no extra wait.
  const micState = useRef<PermissionState | 'unknown'>('unknown');
  useEffect(() => {
    let status: PermissionStatus | undefined;
    navigator.permissions
      ?.query({ name: 'microphone' as PermissionName })
      .then((s) => {
        status = s;
        micState.current = s.state;
        s.onchange = () => {
          micState.current = s.state;
        };
      })
      .catch(() => {
        // Not every browser can be asked. Then the explanation is always given.
      });
    return () => {
      if (status) status.onchange = null;
    };
  }, []);

  async function start() {
    if (busy.current || disabled || recording) return;
    busy.current = true;
    if (micState.current !== 'granted' && !micRemembered()) {
      announce(MIC_EXPLAINED, 'assertive');
    }
    try {
      await recorder.current?.start();
      rememberMic();
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

    // Tap or hold (#236): a short tap reads the current line, holding records.
    // Recording starts once the key has been held for HOLD_MS.
    let holdTimer: number | null = null;
    let held = false;
    const ours = (e: KeyboardEvent) =>
      e.code === 'Space' &&
      !shouldIgnore(e) &&
      // Space presses a focused button. Only the record button's own press
      // is taken over, since it would otherwise toggle recording back off.
      (!isPressable(e.target) || (e.target as Element).closest('[data-testid="record-button"]') !== null);

    function onDown(e: KeyboardEvent) {
      if (!ours(e)) return;
      e.preventDefault();
      if (e.repeat || holdTimer !== null || held) return;
      holdTimer = window.setTimeout(() => {
        holdTimer = null;
        held = true;
        void start();
      }, HOLD_MS);
    }
    function onUp(e: KeyboardEvent) {
      if (!ours(e)) return;
      e.preventDefault();
      if (holdTimer !== null) {
        window.clearTimeout(holdTimer);
        holdTimer = null;
        onTapRef.current?.();
        return;
      }
      if (held) {
        held = false;
        void stop();
      }
    }
    // Releasing the key outside the window would otherwise leave it recording.
    function onBlur() {
      if (holdTimer !== null) {
        window.clearTimeout(holdTimer);
        holdTimer = null;
      }
      held = false;
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
