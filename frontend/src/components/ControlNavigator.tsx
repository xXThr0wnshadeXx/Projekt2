// A deliberately small command surface for people who cannot scan a page.
// Space opens it; the student names the control they want rather than hunting
// through every button. It uses real button names, so it cannot drift from UI.
import { useEffect, useRef, useState } from 'react';
import { isSelfVoicingEnabled, speak } from '../audio/tts';
import { announce } from './LiveRegion';

function nameOf(button: HTMLButtonElement): string {
  return (button.getAttribute('aria-label') || button.innerText).replace(/\s+/g, ' ').trim();
}

function controls(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('button:not([data-voice-navigator])')]
    .filter((button) => !button.disabled && button.offsetParent !== null);
}

function essentialNames(): string[] {
  const marked = controls().filter((button) => button.hasAttribute('data-voice-essential'));
  return (marked.length ? marked : controls().slice(0, 3)).map(nameOf).filter(Boolean).slice(0, 4);
}

export function ControlNavigator({ screen }: { screen: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);

  // The automatic voice gives only the few controls needed to move forward.
  // Detailed maths, status, and errors are still announced when requested.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const names = essentialNames();
      if (isSelfVoicingEnabled() && names.length) {
        speak(`Essential controls: ${names.join('. ')}. Press Space to name a button.`);
      }
    }, 100);
    return () => window.clearTimeout(timer);
  }, [screen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Some assistive keyboards report a printable space but no physical
      // `code`, so accept either form.
      if ((event.code !== 'Space' && event.key !== ' ') || event.repeat || open) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable], mjx-container')) return;
      // Scratchpad keeps Space for push-to-talk: it already accepts spoken
      // commands there, including "hand in" and "read line two".
      if (screen === 'scratchpad') return;
      event.preventDefault();
      setQuery('');
      setOpen(true);
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, screen]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    announce(`Name a button to press. Essential controls: ${essentialNames().join(', ')}.`);
  }, [open]);

  function submit() {
    const wanted = query.trim().toLowerCase().replace(/^(press|open|go to)\s+/, '');
    if (!wanted) {
      announce('Type the name of a button, then press Enter.', 'assertive');
      return;
    }
    const matches = controls().filter((button) => {
      const label = nameOf(button).toLowerCase();
      return label === wanted || label.includes(wanted) || wanted.includes(label);
    });
    if (matches.length === 1) {
      const label = nameOf(matches[0]);
      setOpen(false);
      announce(`Opening ${label}.`);
      matches[0].click();
      return;
    }
    const choices = matches.length ? matches.map(nameOf).slice(0, 4) : essentialNames();
    announce(matches.length > 1 ? `I found more than one button: ${choices.join(', ')}. Be more specific.` : `I could not find ${query}. Essential controls are: ${choices.join(', ')}.`, 'assertive');
  }

  if (!open) return null;
  return (
    <div data-voice-navigator className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="control-navigator-title" className="w-full max-w-lg rounded-lg border border-[--line] bg-[--surface] p-5 shadow-xl">
        <h2 id="control-navigator-title" className="text-xl font-semibold">Choose a control</h2>
        <p className="mt-2 text-[--muted]">Type the button name, then press Enter. Essential controls: {essentialNames().join(', ')}.</p>
        <form className="mt-4 flex gap-3" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <input ref={input} aria-label="Button to press" value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-[48px] min-w-0 flex-1 rounded-lg border border-[--line] bg-[--bg] px-3" />
          <button data-voice-navigator type="submit" className="btn">Go</button>
          <button data-voice-navigator type="button" className="btn" onClick={() => { setOpen(false); announce('Button chooser closed.'); }}>Cancel</button>
        </form>
      </section>
    </div>
  );
}
