// Voice and typed commands in the scratchpad — issue #24 (DESIGN.md 9, F16).
//
// What the student says or types is either a line of math or a command. A
// command starts with one of a small set of words ("next", "read", "delete",
// "undo", "check", "hand in", "help", "change … to …"); everything else is
// math, exactly as before. The server decides which command it is.

const COMMAND_START = new RegExp(
  '^(?:please |okay |ok |glance )?(?:' +
    [
      'next', 'previous', 'back', 'go (?:to|back|up|down)', 'jump to', 'move to', 'line \\w+$',
      'first line', 'last line', 'top$',
      'read', 'delete', 'remove', 'erase', 'scratch', 'cross out',
      'undo', 'new line', 'add (?:a )?(?:new )?line', 'start a new line',
      'check', 'what changed',
      'export', 'hand (?:it )?in', 'download', 'print', 'save as pdf',
      'help', 'what can i say', 'commands$',
      'change', 'replace', 'swap', 'edit', 'fix', 'correct',
    ].join('|') +
    ')\\b',
  'i',
);

export function looksLikeCommand(text: string): boolean {
  return COMMAND_START.test(text.trim().replace(/[.!?]+$/, ''));
}

// A request for the one thing this app never does. Matched on whole phrases a
// person asking for help would use; none of them is something a line of math
// or a command contains.
const ASKS_TO_SOLVE =
  /\b(solve|hint|clue|next step|what to do|i(?:'m| am) (?:stuck|lost)|i don'?t (?:know|understand|get it)|what(?:'s| is) (?:the value of )?[a-z]$|what (?:do|should) i do|how do i|do it for me|work it out|figure it out|finish (?:it|this)|(?:what(?:'s| is)|give me|tell me|show me) the answer|help me (?:with|do|solve|finish))\b/i;

export function asksToSolve(text: string): boolean {
  return ASKS_TO_SOLVE.test(text);
}

/** Glance changes only what the student names ("change the 3 to a 4"). A
 *  request for a correction is refused with this fixed sentence (#188). Kept in
 *  step with backend/app/commands.py. */
export const EDIT_REFUSAL =
  'I can only change what you tell me to change. Say, for example, change the 3 to a 4.';

const ASKS_FOR_CORRECTION =
  /\b(?:fix|correct|repair|redo|rewrite)\b(?!\s+(?:the\s+)?(?:\w+\s+)?(?:to|with|into)\b)|\bmake (?:it|this|that|them) (?:right|correct|better|work)\b|\bwhat(?:'s| is) wrong\b|\bwhere(?:'s| is| did i go) (?:my |the )?(?:mistake|error|wrong)\b|\bmy (?:mistake|error)\b|\bget it right\b|\bdo (?:it|this) (?:right|correctly)\b/i;

export function asksForCorrection(text: string): boolean {
  return ASKS_FOR_CORRECTION.test(text);
}

/** "W3" → 3. */
export function lineNumber(ref: string | null): number | null {
  const m = /^W(\d{1,3})$/.exec(ref ?? '');
  return m ? Number(m[1]) : null;
}

const WORDS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9', ten: '10',
  plus: '+', minus: '-', times: '\\cdot', equals: '=', 'equal sign': '=',
};

function toLatexToken(word: string): string {
  const w = word.trim().toLowerCase().replace(/^(?:a|an|the)\s+/, '');
  return WORDS[w] ?? w;
}

/** Apply "replace A with B" to a line, only when A appears exactly once.
 *
 *  Anything less certain returns null and the line goes into the edit box
 *  unchanged: guessing which "3" the student meant would silently change
 *  their work. Either way the student hears the result and confirms it.
 */
export function applyEdit(latex: string, instruction: string | null): string | null {
  const m = /^replace (.+) with (.+)$/i.exec(instruction ?? '');
  if (!m) return null;
  const from = toLatexToken(m[1]);
  const to = toLatexToken(m[2]);
  if (!from || from === to) return null;
  const parts = latex.split(from);
  if (parts.length !== 2) return null; // not there, or more than once
  return parts.join(to);
}
