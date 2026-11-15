// Step checks for the student's own work and "what changed?" — issue #21.
//
// Mode rules (DESIGN.md 14), enforced here and again by the server:
//   study     verified → one sentence naming the operation
//   homework  "This step checks out." / "I couldn't confirm this step."
//   exam      never called
// Nothing here ever says a step is wrong or suggests what to do next.

import { diff } from './api';
import type { Mode } from './state';

/** Long enough for a real check, short enough not to hold up the readback. */
const BUDGET_MS = 2500;

export function stepChecksAllowed(mode: Mode): boolean {
  return mode !== 'exam';
}

/** The sentence to say after a step, or null when there is nothing to say.
 *
 *  Null in exam mode, when either line couldn't be read, and when the server
 *  doesn't answer in time — a slow check must never block or mislead.
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
    const result = await diff(fromLatex, toLatex, mode, controller.signal);
    return result.message || null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}
