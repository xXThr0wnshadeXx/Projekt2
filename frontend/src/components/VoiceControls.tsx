// Voice and speed for the app's own voice — issue #182.
//
// Real radio buttons in fieldsets, so each choice is announced with its group,
// and a Test voice button so a student can hear the choice before committing
// to it. When the server offers no natural voice the choices still save, and
// the browser's voice is used until a natural one is available.

import { announce } from './LiveRegion';
import { isNaturalVoiceAvailable, testVoice } from '../audio/tts';
import { SPEECH_RATES, VOICES, type Settings, type VoiceName } from '../state';

const VOICE_LABEL: Record<VoiceName, string> = {
  coral: 'Coral: warm',
  sage: 'Sage: calm',
  verse: 'Verse: bright',
  browser: "Your browser's voice",
};

const RATE_LABEL: Record<number, string> = { 0.85: 'Slower', 1: 'Normal', 1.2: 'Faster' };

export interface VoiceControlsProps {
  settings: Settings;
  onChange: (next: Settings) => void;
}

export function VoiceControls({ settings, onChange }: VoiceControlsProps) {
  const natural = isNaturalVoiceAvailable();

  return (
    <div className="mt-4 space-y-4">
      <fieldset>
        <legend className="font-medium">Voice</legend>
        {!natural && (
          <p className="mt-1 text-sm text-[--muted]" id="voice-note">
            Natural voices need the Glance server. Until it is reachable, your browser's voice is used.
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-3">
          {VOICES.map((v) => (
            <label key={v} className="flex min-h-[48px] cursor-pointer items-center gap-2 rounded-lg border border-[--line] px-3">
              <input
                type="radio"
                name="voice"
                value={v}
                checked={settings.voice === v}
                onChange={() => {
                  onChange({ ...settings, voice: v });
                  announce(`Voice: ${VOICE_LABEL[v]}.`);
                }}
                className="h-5 w-5"
              />
              {VOICE_LABEL[v]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-medium">Speed</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {SPEECH_RATES.map((r) => (
            <label key={r} className="flex min-h-[48px] cursor-pointer items-center gap-2 rounded-lg border border-[--line] px-3">
              <input
                type="radio"
                name="speech-rate"
                value={r}
                checked={settings.speechRate === r}
                onChange={() => {
                  onChange({ ...settings, speechRate: r });
                  announce(`Speed: ${RATE_LABEL[r]}.`);
                }}
                className="h-5 w-5"
              />
              {RATE_LABEL[r]}
            </label>
          ))}
        </div>
      </fieldset>

      <button type="button" className="btn" onClick={testVoice}>
        Test voice
      </button>
    </div>
  );
}
