// Home screen — the first thing a screen reader reads (DESIGN.md 5, Flow A).
//
// It has to answer three questions before anyone presses anything: what is
// this, who is it for, and what will it not do. A visitor who cannot answer
// those from the first screen has to be told by a person, and a student
// arriving alone has no such person. So it says them, briefly, once: in the
// heading, in one sentence, and in three numbered steps. The steps are text,
// not controls, so Tab still goes straight to the buttons.

import { useEffect, useRef } from 'react';
import { announce } from '../components/LiveRegion';
import { useShortcuts } from '../shortcuts';
import { ReadingControls } from '../components/ReadingControls';
import type { Settings } from '../state';

export interface HomeProps {
  onCapture: () => void;
  onSample: () => void;
  /** Present only when a problem from earlier in the session is still loaded. */
  onResume?: () => void;
  takeRestoredAnnouncement: () => string;
  onSettings: () => void;
  settings: Settings;
  onSettingsChange: (next: Settings) => void;
}

// Said aloud on arrival, so it is one breath long.
const WHAT =
  'Glance. Math for students who are blind or have low vision. It reads a problem aloud and writes down your own work as you say it. It never solves it for you.';

export function Home({
  onCapture,
  onSample,
  onResume,
  takeRestoredAnnouncement,
  onSettings,
  settings,
  onSettingsChange,
}: HomeProps) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
    const welcome = onResume
      ? `${WHAT} Capture a problem, try the sample, or go back to your problem.`
      : `${WHAT} Capture a problem, or try the sample.`;
    // Announce after the live regions have mounted. StrictMode cancels the
    // first timer before it can use the one-time restoration message.
    const timer = window.setTimeout(() => announce(takeRestoredAnnouncement() || welcome), 0);
    return () => window.clearTimeout(timer);
  }, [onResume, takeRestoredAnnouncement]);

  useShortcuts({ u: onCapture, c: onCapture });

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-8">
      <h2
        ref={heading}
        tabIndex={-1}
        className="display focus-visible:ring-4 focus-visible:ring-[--accent]"
      >
        Math for students who are blind or have low vision
      </h2>
      <p className="mt-6 max-w-2xl border-l-2 border-[--fg] pl-4 text-lg">
        Glance reads a math problem aloud, lets you explore it piece by piece,
        and writes down your own working as you say it or type it. No pencil,
        no paper, no need to see the page.
      </p>

      <ol className="mt-5 space-y-2" aria-label="How it works">
        <li>
          <strong>1. Bring in a problem.</strong> A photo, a screenshot, a
          worksheet or a PDF.
        </li>
        <li>
          <strong>2. Hear it and explore it.</strong> In speech, in large
          print, or in Nemeth braille.
        </li>
        <li>
          <strong>3. Do the work yourself.</strong> Say or type each line, hear
          it read back, and hand in typed work.
        </li>
      </ol>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" className="btn-primary" onClick={onCapture}>
          Capture a problem
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

      <p className="mt-6 rounded-lg border border-[--line] bg-[--surface] px-4 py-3">
        <strong>Glance never solves the problem.</strong> No answers, no hints,
        no next steps. It reads the problem and writes down what you say. The
        work stays yours, so it can be used in class and in exams. Step checks
        only if your instructor turns them on.
      </p>

      {/* How the page itself is read. Here, not only in Settings: a student
          who cannot yet read the screen cannot go looking for the setting
          that would let them. The notice about a server that is down lives
          in one place, the footer; it used to be said here as well, twice
          over, in two different wordings. */}
      <div className="mt-8 border-t border-[--line] pt-6">
        <ReadingControls settings={settings} onChange={onSettingsChange} />
      </div>

      {/* DESIGN.md 15 asks for this notice on Home, in one line. */}
      <p className="mt-10 text-sm text-[--muted]">
        Images are sent to the OpenAI API to be read, and are not stored on our
        server. There are no accounts, and your work stays in this browser.
      </p>
    </main>
  );
}
