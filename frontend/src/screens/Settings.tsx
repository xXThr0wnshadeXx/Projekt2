// Settings — issue #21 (modes) and the self-voicing switch (DESIGN.md 12, 13).
//
// The mode decides what the app may say about a student's work (DESIGN.md 14).
// None of the three ever solves, hints, or gives a next step.

import { useRef } from 'react';
import { announce } from '../components/LiveRegion';
import type { Mode, Settings as SettingsData } from '../state';

export interface SettingsProps {
  settings: SettingsData;
  onChange: (next: SettingsData) => void;
}

export const MODE_INFO: Record<Mode, { name: string; detail: string }> = {
  study: {
    name: 'Study',
    detail:
      'After each step you save, hear whether it follows from the line before, and which operation you used.',
  },
  homework: {
    name: 'Homework',
    detail:
      'After each step you save, hear only whether it checks out or could not be confirmed.',
  },
  exam: {
    name: 'Exam',
    detail: 'No step checking at all. You can still read, explore, and write your work.',
  },
};

const MODES: Mode[] = ['study', 'homework', 'exam'];

export function Settings({ settings, onChange }: SettingsProps) {
  const heading = useRef<HTMLHeadingElement>(null);


  function setMode(mode: Mode) {
    onChange({ ...settings, mode });
    announce(`${MODE_INFO[mode].name} mode. ${MODE_INFO[mode].detail}`);
  }

  return (
    <section id="step-settings" aria-labelledby="settings-heading" className="step">
      <h2
        ref={heading}
        id="settings-heading"
        tabIndex={-1}
        className="step-title focus-visible:ring-4 focus-visible:ring-[--accent]"
      >
        Mode
      </h2>

      <fieldset className="mt-6">
        <legend className="text-lg font-semibold">Mode</legend>
        <p className="mt-1 text-sm text-[--muted]">
          In every mode, Glance never solves a problem or tells you what to do next.
        </p>
        <div className="mt-4 space-y-3">
          {MODES.map((mode) => (
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
    </section>
  );
}
