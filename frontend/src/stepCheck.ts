// Step checks for the student's own work — issue #21, narrowed by #207.
//
// Glance is a reader and scribe. Mode rules (DESIGN.md 14), enforced here and
// again by the server:
//   reader    (default) never checked, never called
//   exam      never called
//   study     verified → one sentence naming the operation
//   homework  "This step checks out." / "I couldn't confirm this step."
// Study and homework are for students whose instructor allows step checks.
// A check only ever compares a saved work line with the student's OWN previous
// work line, never with a problem line, and at most MAX_CHECKS times per
// problem, so it cannot be used to hunt for an answer.
// Nothing here ever says a step is wrong or suggests what to do next.

import { diff } from './api';
import { spendCheck, type Mode } from './state';

/** Long enough for a real check, short enough not to hold up the readback. */
const BUDGET_MS = 2500;

export const SAYS_CHECKS_OFF = 'Step checking is off. Glance reads and writes; it does not check your work.';
export const SAYS_EXAM_OFF = 'Step checking is off in exam mode.';
export const SAYS_NO_PREVIOUS = 'I can only check a line against your previous line.';
export const SAYS_CAP = "I can't check more lines on this problem.";

export function stepChecksAllowed(mode: Mode): boolean {
  return mode === 'study' || mode === 'homework';
}

/** The sentence for a check that is off in this mode. */
export function checksOffMessage(mode: Mode): string {
  return mode === 'exam' ? SAYS_EXAM_OFF : SAYS_CHECKS_OFF;
}

/** Spends one of the problem's checks. False means the cap is reached. */
export function takeCheck(): boolean {
  return spendCheck();
}

/** The sentence to say after a step, or null when there is nothing to say.
 *
 *  Null when checks are off, when either line couldn't be read, and when the
 *  server doesn't answer in time — a slow check must never block or mislead.
 */
export async function checkStep(
  fromLatex: string,
  toLatex: string,
  mode: Mode,
): Promise<string | null> {
  if (!stepChecksAllowed(mode) || !fromLatex.trim() || !toLatex.trim()) return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), BUDGET_MS);
  try {
    const result = await diff(fromLatex, toLatex, mode as 'study' | 'homework', controller.signal);
    return result.message || null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/** Say what an unconfirmed step was compared with: the student's own previous
 *  line. "I couldn't confirm this step" alone leaves someone who cannot see the
 *  screen unable to tell why. Naming the line is a fact about the check, not a
 *  hint about the maths. A confirmed step, or a study-mode explanation, is
 *  passed through untouched.
 */
export function withBasis(verdict: string, basis: string): string {
  return verdict.startsWith("I couldn't confirm") ? `${verdict} It was compared with ${basis}.` : verdict;
}
