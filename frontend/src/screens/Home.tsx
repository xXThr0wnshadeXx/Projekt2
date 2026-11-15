// Home screen — the first thing a screen reader reads (DESIGN.md 5, Flow A).
//
// Deliberately short. Three ways in and a sample, each a real button with an
// accessible name, so the opening announcement is a list of choices rather
// than a page of prose someone has to tab through to get past.

import { useEffect, useRef } from 'react';
import { announce } from '../components/LiveRegion';
import { useShortcuts } from '../shortcuts';

export interface HomeProps {
  onCapture: () => void;
  onSample: () => void;
  /** Present only when a problem from earlier in the session is still loaded. */
  onResume?: () => void;
  backEndReachable: boolean;
  /** False on a deployed build that was never given a server address (#135). */
  connected?: boolean;
  /** Why capture cannot work right now, or undefined when it can (#127). */
  captureUnavailable?: string;
  onSettings: () => void;
}

export function Home({
  onCapture,
  onSample,
  onResume,
  backEndReachable,
  connected = true,
  captureUnavailable,
  onSettings,
}: HomeProps) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
    announce(
      onResume
        ? 'Glance. Capture a problem, try the sample, or go back to your problem.'
        : 'Glance. Capture a problem, or try the sample.',
    );
  }, [onResume]);

  // The button stays in the tab order when capture cannot work, so a student
  // moving by Tab is told why instead of landing on a screen where every
  // upload fails. `disabled` would drop it from the tab order and say nothing.
  function capture() {
    if (captureUnavailable) {
      announce(`Capture is unavailable right now. ${captureUnavailable} Try the sample problem instead.`);
      return;
    }
    onCapture();
  }

  useShortcuts({ u: capture, c: capture });

  return (
    <main id="main" className="mx-auto max-w-3xl px-6 py-8">
      <h2
        ref={heading}
        tabIndex={-1}
        className="text-2xl font-semibold tracking-tight focus-visible:ring-4 focus-visible:ring-[--accent]"
      >
        Start
      </h2>
      <p className="mt-2 text-[--muted]">
        Bring in any math problem — a file, a screenshot, or a photo. Hear its
        structure, explore it piece by piece, and read it in large print.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          className="btn"
          onClick={capture}
          aria-disabled={captureUnavailable ? 'true' : undefined}
        >
          {captureUnavailable ? 'Capture a problem - unavailable right now' : 'Capture a problem'}
        </button>
        <button type="button" className="btn" onClick={onSample}>
          Try a sample problem
        </button>
        {onResume && (
          <button type="button" className="btn" onClick={onResume}>
            Back to your problem
          </button>
        )}
        <button type="button" className="btn" onClick={onSettings}>
          Settings
        </button>
      </div>

      {!backEndReachable && (
        <p
          data-testid="backend-notice"
          className="mt-6 rounded-lg border border-[--warn] px-4 py-3 text-sm text-[--warn]"
        >
          {connected
            ? 'The server is not reachable, so capture is unavailable.'
            : 'This site has not been connected to a server yet, so capture is unavailable.'}{' '}
          The sample
          problem still works — you can explore it, glance at it, and read it in
          low-vision mode.
        </p>
      )}

      {backEndReachable && captureUnavailable && (
        <p
          data-testid="models-notice"
          className="mt-6 rounded-lg border border-[--warn] px-4 py-3 text-sm text-[--warn]"
        >
          Capture and speaking a line are unavailable on this server right now.
          The sample problem, typing lines, and step checks still work.
        </p>
      )}

      {/* DESIGN.md 15 asks for this notice on Home, in one line. */}
      <p className="mt-10 text-sm text-[--muted]">
        Images are sent to the OpenAI API to be read, and are not stored on our
        server. There are no accounts, and your work stays in this browser.
      </p>
    </main>
  );
}
