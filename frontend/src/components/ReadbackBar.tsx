// ReadbackBar — issue #18.
//
// Nothing the model heard is saved until the student confirms it. This is the
// whole safety story: capture and speech recognition both make mistakes, and
// the student is the only one who knows what they meant. So every line is read
// back and waits.
//
// Enter saves, E edits, Escape discards (DESIGN.md 12).

import { useEffect, useRef } from 'react';

export interface ReadbackBarProps {
  /** How the line is spoken back, e.g. "2 x equals 8". */
  readback: string;
  /** True when SymPy could not parse it — saved anyway, flagged as unsure. */
  unsure: boolean;
  onSave: () => void;
  onEdit: () => void;
  onDiscard: () => void;
}

export function ReadbackBar({ readback, unsure, onSave, onEdit, onDiscard }: ReadbackBarProps) {
  const save = useRef<HTMLButtonElement>(null);

  // Focus lands on Save, so Enter confirms without the student having to find
  // anything, and a screen reader reads the readback from the region label.
  useEffect(() => {
    save.current?.focus();
  }, [readback]);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea')) return;
    const key = e.key.toLowerCase();
    if (key === 'e') {
      e.preventDefault();
      onEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onDiscard();
    }
  }

  return (
    <section
      aria-label="Confirm your line"
      onKeyDown={onKeyDown}
      data-testid="readback-bar"
      className="mt-6 rounded-lg border border-[--accent] bg-[--surface] px-4 py-4"
    >
      <p className="text-lg">
        <span className="sr-only">I heard: </span>
        {readback}
      </p>

      {unsure && (
        <p className="mt-2 text-sm text-[--warn]">
          I could not check this line. You can still save it.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <button ref={save} type="button" className="btn" onClick={onSave}>
          Save
        </button>
        <button type="button" className="btn" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="btn" onClick={onDiscard}>
          Discard
        </button>
      </div>

      <p className="mt-3 text-sm text-[--muted]">
        <kbd className="kbd">Enter</kbd> saves, <kbd className="kbd">E</kbd> edits,{' '}
        <kbd className="kbd">Esc</kbd> discards.
      </p>
    </section>
  );
}
