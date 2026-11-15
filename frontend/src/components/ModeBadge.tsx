// ModeBadge — issue #21 (DESIGN.md 12: "Mode badge" on Home).
//
// Always on screen, so a student or an invigilator can see at a glance which
// rules are in force. It is plain text in the header, read in reading order,
// not a live region: the mode is announced when it changes, in Settings.

import type { Mode } from '../state';

const LABEL: Record<Mode, string> = {
  study: 'Study mode',
  homework: 'Homework mode',
  exam: 'Exam mode',
};

export function ModeBadge({ mode, lockedUntil }: { mode: Mode; lockedUntil?: string }) {
  return (
    <p
      data-testid="mode-badge"
      className="inline-flex min-h-[32px] items-center rounded-full border border-[--line] px-3 text-sm font-medium"
    >
      {LABEL[mode]}
      {lockedUntil && `, set by your instructor until ${lockedUntil}`}
    </p>
  );
}
