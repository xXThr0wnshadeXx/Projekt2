// Keyboard help — issue #25.
//
// "?" speaks the shortcuts for the current screen and opens this list. The list
// is there for low-vision students without a screen reader, who would otherwise
// get the help only by turning on self-voicing.

import { useEffect, useRef } from 'react';
import { KEYMAP, type ScreenName } from '../shortcuts';

export interface KeyboardHelpProps {
  screen: ScreenName;
  /** Move focus into the panel when it opens (only when the student asked to see it). */
  takeFocus: boolean;
  onClose: () => void;
}

export function KeyboardHelp({ screen, takeFocus, onClose }: KeyboardHelpProps) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (takeFocus) heading.current?.focus();
  }, [takeFocus, screen]);

  return (
    <section
      id="keyboard-help"
      aria-labelledby="keyboard-help-title"
      className="mx-auto mt-6 max-w-3xl rounded-lg border border-[--line] px-6 py-5"
    >
      <h2
        id="keyboard-help-title"
        ref={heading}
        tabIndex={-1}
        className="text-lg font-semibold focus-visible:ring-4 focus-visible:ring-[--accent]"
      >
        Keyboard shortcuts on this screen
      </h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
        {KEYMAP[screen].map((k) => (
          <div key={k.keys} className="contents">
            <dt className="font-medium">{k.keys}</dt>
            <dd className="text-[--muted]">{k.does}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-[--muted]">
        Shortcuts never fire while you are typing in a box or exploring inside an
        equation.
      </p>
      <button type="button" className="btn mt-4" onClick={onClose}>
        Close shortcuts
      </button>
    </section>
  );
}
