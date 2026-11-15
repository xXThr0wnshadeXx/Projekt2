// Session state in memory, optional localStorage behind try/catch
// (DESIGN.md 7). Holds the captured problem and the settings that outlive a
// reload. Student work lines live here too once the scratchpad lands (#18).
//
// Nothing here is sent anywhere. The back end stores nothing (DESIGN.md 15),
// so a reload would otherwise lose a problem the student just photographed —
// which, for someone who had to line a phone up over a worksheet, is a real
// cost. The problem is cached locally for exactly that reason.

/** One transcribed math line. Mirrors the capture response in DESIGN.md 9. */
export interface ProblemLine {
  id: string;
  latex: string;
  confidence: number;
  intent_notes: string;
  /** False when SymPy could not parse it. Announced as "unsure", never hidden. */
  valid: boolean;
}

export interface Diagram {
  id: string;
  description: string;
}

export interface Problem {
  instructions: string;
  lines: ProblemLine[];
  diagrams: Diagram[];
  /** Framing and quality notes, turned into spoken retake guidance (#14). */
  warnings: string[];
  /** Where it came from, so the Problem screen can say so. */
  source: 'upload' | 'paste' | 'camera' | 'sample';
}

/** One line of the student's own work (issue #18). */
export interface WorkLine {
  id: string;
  latex: string;
  /** How it is spoken back, kept so a line can be re-read without the model. */
  readback: string;
  /** False when SymPy could not parse it. Saved anyway, flagged as unsure. */
  valid: boolean;
}

export type Mode = 'study' | 'homework' | 'exam';

export interface Settings {
  mode: Mode;
  /** The app's own speech. On by default (#241): most people trying Glance
   *  have no screen reader, and silence made the keys look broken. A screen
   *  reader user turns it off, so they don't hear everything twice. */
  selfVoicing: boolean;
  /** True once the student has switched reading aloud on or off themselves.
   *  Until then the default applies, even to settings saved before it changed. */
  voiceChosen?: boolean;
  /** Size of all text, as a percentage of the browser's own size. */
  textScale: number;
}

/** Large print is the default, not a mode to go and find. */
export const TEXT_SCALES = [100, 125, 150, 175, 200];

export const defaultSettings: Settings = {
  mode: 'homework',
  selfVoicing: true,
  textScale: 125,
};

const PROBLEM_KEY = 'glance.problem.v1';
const WORK_KEY = 'glance.work.v1';
const SETTINGS_KEY = 'glance.settings.v1';
const REVIEW_KEY = 'glance.review.v1';

// Every access is wrapped: localStorage throws in private windows and in some
// embedded webviews, and a storage failure must never take the app down.
function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Out of quota or storage blocked — the in-memory copy still works.
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to do; the caller has already dropped its in-memory copy.
  }
}

export function loadProblem(): Problem | null {
  const p = read<Problem>(PROBLEM_KEY);
  // Guard against a half-written or older-shaped value rather than trusting it.
  if (!p || !Array.isArray(p.lines)) return null;
  return p;
}

export function saveProblem(problem: Problem): void {
  write(PROBLEM_KEY, problem);
}

export function clearProblem(): void {
  remove(PROBLEM_KEY);
  // A new problem means the old work no longer belongs to anything.
  remove(WORK_KEY);
  remove(REVIEW_KEY);
}

/** What a review allowance is tied to: the problem, not the work. Editing a
 *  line and asking again would make the review an answer oracle (#215). */
function reviewKeyFor(problem: Problem): string {
  return problem.lines.map((l) => l.latex).join('\n');
}

/** True once this problem has had its one review. Survives a reload. */
export function reviewSpent(problem: Problem): boolean {
  return read<string>(REVIEW_KEY) === reviewKeyFor(problem);
}

/** Spent before the request is sent: a failed request still uses it up, since
 *  refunding it would let a student retry until they like the answer. */
export function spendReview(problem: Problem): void {
  write(REVIEW_KEY, reviewKeyFor(problem));
}

export function loadWork(): WorkLine[] {
  const w = read<WorkLine[]>(WORK_KEY);
  return Array.isArray(w) ? w : [];
}

/** Fired on `window` whenever the student's work changes, so every part of
 *  the one page (the hand-in preview most of all) shows the same lines. */
export const WORK_CHANGED = 'glance:work-changed';

export function saveWork(lines: WorkLine[]): void {
  write(WORK_KEY, lines);
  window.dispatchEvent(new Event(WORK_CHANGED));
}

export function loadSettings(): Settings {
  const settings = { ...defaultSettings, ...(read<Partial<Settings>>(SETTINGS_KEY) ?? {}) };
  if (!TEXT_SCALES.includes(settings.textScale)) settings.textScale = defaultSettings.textScale;
  // Settings saved while the voice was off by default never chose silence.
  if (!settings.voiceChosen) settings.selfVoicing = defaultSettings.selfVoicing;
  return settings;
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, settings);
}

/** A worked example that needs no network.
 *
 *  Two jobs. It lets someone try the app before pointing a camera at anything,
 *  and it is the cached demo input DESIGN.md 27 asks for — if the API or the
 *  venue Wi-Fi is down during judging, the explore, glance and low-vision parts
 *  of the demo still run.
 */
export function sampleProblem(): Problem {
  return {
    instructions: 'Solve for x.',
    lines: [
      // String.raw keeps every backslash; a plain string turns \f and \s into
      // escape sequences and silently mangles the LaTeX.
      { id: 'L1', latex: String.raw`2x + 3 = 11`, confidence: 1, intent_notes: '', valid: true },
      {
        id: 'L2',
        latex: String.raw`\frac{\sqrt{x + 1}}{2} = 5`,
        confidence: 1,
        intent_notes: '',
        valid: true,
      },
    ],
    diagrams: [],
    warnings: [],
    source: 'sample',
  };
}
