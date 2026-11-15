// Reading controls — how the page itself is read, offered where a person
// arrives rather than behind Settings.
//
// Two groups of people use this app and they need opposite things from the
// first screen. Someone with a screen reader needs the app to stay quiet,
// because their reader already speaks. Someone with low vision and no screen
// reader — which is most people with low vision — needs the app to speak and
// needs the print to be large, and until they can read the screen they cannot
// find a setting that would let them read the screen. So both controls are
// here, as real buttons, on the first screen and in Settings.

import { announce } from './LiveRegion';
import { TEXT_SCALES, type Settings } from '../state';

export interface ReadingControlsProps {
  settings: Settings;
  onChange: (next: Settings) => void;
}

export function ReadingControls({ settings, onChange }: ReadingControlsProps) {
  const at = TEXT_SCALES.indexOf(settings.textScale);
  const index = at < 0 ? 0 : at;

  function resize(step: number) {
    const next = TEXT_SCALES[Math.max(0, Math.min(TEXT_SCALES.length - 1, index + step))];
    if (next === settings.textScale) {
      announce(step > 0 ? 'This is the largest text size.' : 'This is the smallest text size.');
      return;
    }
    onChange({ ...settings, textScale: next });
    announce(`Text size ${next} percent.`);
  }

  function toggleVoice() {
    const on = !settings.selfVoicing;
    onChange({ ...settings, selfVoicing: on, voiceChosen: true });
    announce(
      on
        ? 'Reading aloud is on. Glance will speak everything it tells you.'
        : 'Reading aloud is off.',
    );
  }

  return (
    <div role="toolbar" aria-label="Reading controls" className="reading-toolbar">
      <button
        type="button"
        className="btn"
        aria-pressed={settings.selfVoicing}
        aria-describedby="read-aloud-note"
        onClick={toggleVoice}
      >
        Read aloud: {settings.selfVoicing ? 'on' : 'off'}
      </button>
      <div role="group" aria-label="Text size" className="reading-size">
        {/* Never disabled: a disabled button drops out of the tab order, and
            the student who pressed it would land nowhere. At the limit it
            says so instead. */}
        <button type="button" className="btn" aria-label="Smaller text" onClick={() => resize(-1)}>
          A−
        </button>
        <span className="reading-scale" data-testid="text-scale">
          {settings.textScale}%
        </span>
        <button type="button" className="btn" aria-label="Larger text" onClick={() => resize(1)}>
          A+
        </button>
      </div>
      {/* Read with the toggle by a screen reader; kept off screen so the top
          bar stays one clean row. */}
      <p id="read-aloud-note" className="sr-only">
        Turn reading aloud off if you use a screen reader. It already reads
        everything, and two voices at once is hard to follow.
      </p>
    </div>
  );
}
