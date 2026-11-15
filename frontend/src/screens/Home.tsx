// Home screen — the first thing a screen reader reads (DESIGN.md 5, Flow A).
//
// It has to answer three questions before anyone presses anything: what is
// this, who is it for, and what will it not do. A visitor who cannot answer
// those from the first screen has to be told by a person, and a student
// arriving alone has no such person. So it says them, briefly, once: in the
// heading, in one sentence, and in three numbered steps. The steps are text,
// not controls, so Tab still goes straight to the buttons.

import { useEffect, useRef, useState } from 'react';
import { announce } from '../components/LiveRegion';
import { setSelfVoicing, speakOnce } from '../audio/tts';
import { useShortcuts } from '../shortcuts';
import { ReadingControls } from '../components/ReadingControls';
import type { Settings } from '../state';

export interface HomeProps {
  onCapture: () => void;
  onSample: () => void;
  /** Present only when a problem from earlier in the session is still loaded. */
  onResume?: () => void;
  onSettings: () => void;
  settings: Settings;
  onSettingsChange: (next: Settings) => void;
}

// Said aloud on arrival, so it is one breath long.
const WHAT =
  'Glance. Math for students who are blind or have low vision. It reads a problem aloud and writes down your own work as you say it. It never solves it for you.';

// First visit (#200): one question, so a student arriving alone, with or
// without a screen reader, can start with no one helping.
const WELCOMED_KEY = 'glance.welcomed.v1';
const ASK_VOICE = 'Press Y to hear Glance speak to you, or N if you use a screen reader.';
const NEXT = 'Then press C to point your camera at a worksheet, or S to try a sample problem.';

function welcomedBefore(): boolean {
  try {
    return window.localStorage.getItem(WELCOMED_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberWelcomed(): void {
  try {
    window.localStorage.setItem(WELCOMED_KEY, '1');
  } catch {
    // Private windows can refuse storage; the question is simply asked again.
  }
}

// Keys a screen-reader user moves around with. The first-gesture voice waits
// for something else, so it does not talk over a screen reader.
const NAVIGATION_KEYS = new Set([
  'Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown',
]);

export function Home({
  onCapture,
  onSample,
  onResume,
  onSettings,
  settings,
  onSettingsChange,
}: HomeProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [firstVisit, setFirstVisit] = useState(() => !welcomedBefore());

  useEffect(() => {
    heading.current?.focus();
    if (firstVisit) {
      announce(`${WHAT} ${ASK_VOICE} ${NEXT}`);
    } else if (onResume) {
      announce(`Welcome back. ${WHAT} Press B to go back to your problem, C to capture a new one, or S for the sample.`);
    } else {
      announce(`${WHAT} Capture a problem, or try the sample.`);
    }
    // Announce once, on arrival.
  }, [onResume]);

  // A student with no screen reader hears nothing from a live region, and the
  // browser will not let the page speak until they do something. So on a first
  // visit, their first tap, click or key other than navigation says the
  // question aloud, once.
  useEffect(() => {
    if (!firstVisit || settings.selfVoicing) return;
    let done = false;
    const CONTROLS = 'button, a, input, select, textarea, label';
    function first(e: Event) {
      if (done) return;
      // Someone using a control has found their way already, and a screen
      // reader activating one must never be talked over: stop listening.
      const target = e instanceof KeyboardEvent ? document.activeElement : e.target;
      if (target instanceof Element && target.closest(CONTROLS)) {
        done = true;
        return;
      }
      // Keys: only Space or Enter on the page itself. Navigation keys and the
      // single-key shortcuts here mean the student already knows what to do.
      if (e instanceof KeyboardEvent && (NAVIGATION_KEYS.has(e.key) || ![' ', 'Enter'].includes(e.key))) return;
      done = true;
      speakOnce(`Welcome to Glance. ${ASK_VOICE} ${NEXT}`);
    }
    window.addEventListener('pointerdown', first, true);
    window.addEventListener('keydown', first, true);
    return () => {
      window.removeEventListener('pointerdown', first, true);
      window.removeEventListener('keydown', first, true);
    };
  }, [firstVisit, settings.selfVoicing]);

  function chooseVoice(on: boolean) {
    rememberWelcomed();
    setFirstVisit(false);
    onSettingsChange({ ...settings, selfVoicing: on });
    if (on) {
      // Switched on here, before announcing, so this very sentence is spoken.
      setSelfVoicing(true);
      announce(`Okay, I will speak to you. ${NEXT}`);
    } else {
      announce(`Okay, your screen reader will do the talking. ${NEXT}`);
    }
  }

  useShortcuts({
    u: onCapture,
    c: onCapture,
    s: onSample,
    ...(onResume ? { b: onResume } : {}),
    ...(firstVisit ? { y: () => chooseVoice(true), n: () => chooseVoice(false) } : {}),
  });

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-8">
      <h2
        ref={heading}
        tabIndex={-1}
        className="text-2xl font-semibold tracking-tight focus-visible:ring-4 focus-visible:ring-[--accent]"
      >
        Math for students who are blind or have low vision
      </h2>
      {firstVisit && (
        // Text, not buttons: it adds no Tab stops, and Tab still goes
        // straight to "Capture a problem". The Read aloud switch below does
        // the same thing for anyone who prefers a control.
        <p
          className="mt-4 rounded-lg border-2 border-[--accent] bg-[--surface] px-4 py-3 text-xl font-semibold"
          data-testid="welcome"
        >
          New here? Press <kbd className="kbd">Y</kbd> to hear Glance speak to you, or{' '}
          <kbd className="kbd">N</kbd> if you use a screen reader.
        </p>
      )}
      <p className="mt-3 text-lg">
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
        no next steps. It reads, it writes down what you say, and it can check
        a line you have written. The work stays yours, so it can be used in
        class and in exams.
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
