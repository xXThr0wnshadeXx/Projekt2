// Settings — issue #21 (modes) and the self-voicing switch (DESIGN.md 12, 13).
//
// The mode decides what the app may say about a student's work (DESIGN.md 14).
// None of the four ever solves, hints, or gives a next step. Reader and scribe
// is the default and never checks; study and homework are only for students
// whose instructor allows step checks.

import { useEffect, useRef } from 'react';
import { announce } from '../components/LiveRegion';
import { ReadingControls } from '../components/ReadingControls';
import type { Mode, Settings as SettingsData } from '../state';

export interface SettingsProps {
  settings: SettingsData;
  onChange: (next: SettingsData) => void;
  onBack: () => void;
}

export const MODE_INFO: Record<Mode, { name: string; detail: string }> = {
  reader: {
    name: 'Reader and scribe',
    detail: 'Reads the problem and writes down your work. Never checks, solves or hints.',
  },
  study: {
    name: 'Study',
    detail:
      'After each step you save, hear whether it follows from the line before, and which operation you used, and one AI review of your finished work.',
  },
  homework: {
    name: 'Homework',
    detail:
      'After each step you save, hear only whether it checks out or could not be confirmed, and one AI review of your finished work.',
  },
  exam: {
    name: 'Exam',
    detail: 'No step checking at all. You can still read, explore, and write your work.',
  },
};

const MAIN_MODES: Mode[] = ['reader', 'exam'];
const CHECK_MODES: Mode[] = ['homework', 'study'];

export function Settings({ settings, onChange, onBack }: SettingsProps) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
    announce(`Settings. ${MODE_INFO[settings.mode].name} mode is on.`);
    // Announce once, on arrival.
  }, []);

  function setMode(mode: Mode) {
    onChange({ ...settings, mode });
    announce(`${MODE_INFO[mode].name} mode. ${MODE_INFO[mode].detail}`);
  }

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-8">
      <h2
        ref={heading}
        tabIndex={-1}
        className="text-2xl font-semibold tracking-tight focus-visible:ring-4 focus-visible:ring-[--accent]"
      >
        Settings
      </h2>

      <fieldset className="mt-6">
        <legend className="text-lg font-semibold">Mode</legend>
        <p className="mt-1 text-sm text-[--muted]">
          In every mode, Glance never solves a problem or tells you what to do next.
        </p>
        <div className="mt-4 space-y-3">
          {MAIN_MODES.map((mode) => (
            <label
              key={mode}
              className="flex min-h-[48px] cursor-pointer items-start gap-3 rounded-lg border border-[--line] px-4 py-3"
            >
              <input
                type="radio"
                name="mode"
                value={mode}
                checked={settings.mode === mode}
                onChange={() => setMode(mode)}
                aria-describedby={`mode-${mode}-detail`}
                className="mt-1 h-5 w-5"
              />
              <span>
                <span className="font-medium">{MODE_INFO[mode].name}</span>
                <span id={`mode-${mode}-detail`} className="mt-1 block text-sm text-[--muted]">
                  {MODE_INFO[mode].detail}
                </span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-6 text-sm font-medium">Only if your instructor allows step checks</p>
        <div className="mt-2 space-y-3">
          {CHECK_MODES.map((mode) => (
            <label
              key={mode}
              className="flex min-h-[48px] cursor-pointer items-start gap-3 rounded-lg border border-[--line] px-4 py-3"
            >
              <input
                type="radio"
                name="mode"
                value={mode}
                checked={settings.mode === mode}
                onChange={() => setMode(mode)}
                aria-describedby={`mode-${mode}-detail`}
                className="mt-1 h-5 w-5"
              />
              <span>
                <span className="font-medium">{MODE_INFO[mode].name}</span>
                <span id={`mode-${mode}-detail`} className="mt-1 block text-sm text-[--muted]">
                  {MODE_INFO[mode].detail}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <section aria-labelledby="reading-heading" className="mt-8">
        <h3 id="reading-heading" className="text-lg font-semibold">
          Reading
        </h3>
        <div className="mt-3">
          <ReadingControls settings={settings} onChange={onChange} />
        </div>
      </section>

      {/* "Back" alone says nothing when it is read out with no screen to look
          at. Every way out of a screen now names where it goes. */}
      <button type="button" className="btn mt-8" onClick={onBack}>
        Back to the start
      </button>
    </main>
  );
}
