// ClarifyDialog — issue #19.
//
// "x plus one over two" is two different expressions and speech cannot tell
// them apart. A tool that guesses is worse than useless for homework, because
// the student cannot see what it chose. So we ask.
//
// This is the demo's wow moment (DESIGN.md 25), which means it has to be
// flawless with a screen reader: a real modal dialog, focus trapped inside it
// while it is open, focus restored to wherever the student was when it closes,
// and number keys 1 to 3 as a shortcut for people who do not want to tab.

import { useEffect, useRef } from 'react';
import type { SpokenAlternative } from '../api';

export interface ClarifyDialogProps {
  question: string;
  alternatives: SpokenAlternative[];
  onChoose: (choice: SpokenAlternative) => void;
  onCancel: () => void;
}

export function ClarifyDialog({
  question,
  alternatives,
  onChoose,
  onCancel,
}: ClarifyDialogProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Remember where focus was so it can go back; losing a student's place in
    // the page is disorienting in a way sighted users rarely notice.
    restoreTo.current = document.activeElement as HTMLElement | null;
    first.current?.focus();
    return () => restoreTo.current?.focus?.();
  }, []);

  // The keys are heard on the whole document, not only inside the dialog.
  // Focus does not always land on the first option: WebKit sometimes leaves it
  // on the button that opened the dialog, and a screen reader's virtual cursor
  // can sit outside it too. If the keys only worked with focus inside, Escape
  // and 1 to 3 would go dead exactly then, with the dialog still open. The
  // dialog is modal, so while it is open every one of these keys is its own.
  // Capture phase, so the screen's shortcuts behind it never see them.
  const latest = useRef({ alternatives, onChoose, onCancel });
  latest.current = { alternatives, onChoose, onCancel };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (handleKey(e)) e.stopPropagation();
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  /** Returns true when the key was the dialog's to handle. */
  function handleKey(e: KeyboardEvent): boolean {
    const { alternatives, onChoose, onCancel } = latest.current;

    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      return true;
    }

    // 1 to 3 pick an option directly (DESIGN.md 12).
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= alternatives.length) {
      e.preventDefault();
      onChoose(alternatives[n - 1]);
      return true;
    }

    if (e.key !== 'Tab') return false;

    // Focus trap. Without it, Tab walks out of the dialog into the page behind
    // and a screen-reader user has no idea the dialog is still open.
    //
    // Every Tab is handled here rather than only at the first and last
    // control: Safari's default Tab skips buttons and jumps to the next text
    // field, which would be the typing box *behind* this dialog.
    const focusables = Array.from(
      dialog.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((el) => !el.hasAttribute('disabled'));
    if (focusables.length === 0) return false;
    e.preventDefault();
    const at = focusables.indexOf(document.activeElement as HTMLElement);
    const next = e.shiftKey
      ? at <= 0 ? focusables.length - 1 : at - 1
      : at === -1 || at === focusables.length - 1 ? 0 : at + 1;
    focusables[next].focus();
    return true;
  }

  return (
    // The backdrop is not clickable-to-close on purpose: a stray tap must not
    // silently throw away what the student just said.
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="clarify-question"
        data-testid="clarify-dialog"
        className="w-full max-w-lg rounded-lg border border-[--line] bg-[--surface] p-6"
      >
        <h2 id="clarify-question" className="text-lg font-semibold">
          {question}
        </h2>

        <ul className="mt-4 space-y-3">
          {alternatives.map((option, i) => (
            <li key={option.latex}>
              <button
                ref={i === 0 ? first : undefined}
                type="button"
                className="btn w-full justify-start text-left"
                onClick={() => onChoose(option)}
              >
                <span aria-hidden="true" className="mr-3 font-mono">
                  {i + 1}.
                </span>
                {/* The readback is the spoken form; it is what the student is
                    actually choosing between, so it is the accessible name. */}
                <span>
                  {option.readback}
                  {/* An option SymPy could not read is still offered — the
                      student knows what they said — but saying so here is the
                      difference between an honest choice and a silent one. */}
                  {!option.valid && (
                    <span className="ml-2 text-[--warn]">(I could not check this one)</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>

        <p className="mt-3 text-sm text-[--muted]">
          Press <kbd className="kbd">1</kbd> to{' '}
          <kbd className="kbd">{alternatives.length}</kbd> to choose, or{' '}
          <kbd className="kbd">Esc</kbd> to cancel.
        </p>
      </div>
    </div>
  );
}
