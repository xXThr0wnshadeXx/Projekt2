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

// --- The fixed command set without the server (issue #128) -----------------
//
// A copy of the rules in backend/app/commands.py, so delete, read, undo, hand
// in and the rest still work when the server can't be reached. The server
// stays the first choice (it also has a model fallback for unusual
// phrasing). tests/fixtures/commands.json is checked against BOTH copies, so
// a rule changed on one side and not the other fails the tests.

export type ParsedIntent =
  | 'navigate' | 'read' | 'edit' | 'delete' | 'undo' | 'new_line'
  | 'check' | 'what_changed' | 'export' | 'help';

export interface ParsedCommand {
  intent: ParsedIntent;
  target_line: string | null;
  instruction: string | null;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, first: 1, second: 2, third: 3, fourth: 4,
  fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  // Speech-to-text often hears these for "two" and "four".
  to: 2, too: 2, for: 4,
};
const NUM = `(\\d{1,3}|${Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join('|')})`;
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const ORD = `(\\d{1,3})(?:st|nd|rd|th)|(${ORDINALS.join('|')})`;
const LINE = `(?:line\\s+(?:number\\s+)?${NUM}|(?:the\\s+)?(?:${ORD})\\s+line)`;

const full = (pattern: string) => new RegExp(`^(?:${pattern})$`);

function toNumber(token: string | undefined | null): number | null {
  if (!token) return null;
  const t = token.toLowerCase();
  return /^\d+$/.test(t) ? Number(t) : NUMBER_WORDS[t] ?? null;
}

function lineRef(text: string): number | null {
  const m = new RegExp(LINE).exec(text);
  return m ? toNumber(m.slice(1).find((g) => g)) : null;
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:]+/g, ' ')
    .replace(/^(please|okay|ok|um|uh|glance)\s+/, '')
    .replace(/\s+(please)$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cmd(intent: ParsedIntent, line: number | null = null, instruction: string | null = null): ParsedCommand {
  return { intent, target_line: line !== null ? `W${line}` : null, instruction };
}

/** Match a command by rules, like the server. null means "not recognised". */
export function parseCommand(text: string, current: number | null, lineCount: number): ParsedCommand | null {
  const t = normalise(text);
  if (!t) return null;
  const here = current || lineCount || null;
  const ref = lineRef(t);

  if (full('undo( that| it| the delete)?').test(t)) return cmd('undo');
  if (full('(help|what can i say|what are the commands|commands)').test(t)) return cmd('help');
  if (full('(export|hand (it )?in|hand in my work|download( my work)?|print( my work)?|save as pdf)').test(t)) return cmd('export');
  if (full('(new line|next step|add (a )?(new )?line|start a new line)').test(t)) return cmd('new_line');
  if (full(`what changed( (on|in) ${LINE})?`).test(t)) return cmd('what_changed', ref ?? here);
  if (full('(next|next line|go down|down)').test(t)) return cmd('navigate', (here ?? 0) + 1);
  if (full('(previous|previous line|back|go back|go up|up|last line)').test(t)) {
    if (t === 'last line') return cmd('navigate', lineCount || null);
    return cmd('navigate', Math.max((here ?? 1) - 1, 1));
  }
  if (full('(first line|top)').test(t)) return cmd('navigate', 1);
  if (full(`(go to |jump to |move to )?${LINE}`).test(t)) return cmd('navigate', ref);
  if (full(`read( (it|this|that|this line|that line|the line|${LINE}))?`).test(t)) return cmd('read', ref ?? here);
  if (full('read (all|everything|it all|my work|all my work|all lines|back my work|the whole thing)').test(t)) {
    return cmd('read', null, 'all');
  }
  if (full(`(delete|remove|erase|scratch|cross out)( (it|this|that|this line|that line|the line|${LINE}))?`).test(t)) {
    return cmd('delete', ref ?? here);
  }
  if (full(`(check|check (it|this|that|this step|that step|my step|my work|${LINE}))`).test(t)) return cmd('check', ref ?? here);

  const edit = full(
    `(?:change|replace|swap)\\s+(?:the\\s+)?(.+?)\\s+(?:to|with|for|into)\\s+(?:a\\s+|an\\s+|the\\s+)?(.+?)` +
      `(?:\\s+(?:on|in)\\s+${LINE})?`,
  ).exec(t);
  if (edit) {
    const line = toNumber(edit.slice(3).find((g) => g)) ?? here;
    return cmd('edit', line, `replace ${edit[1]} with ${edit[2]}`);
  }
  if (full(`(edit|fix|change|correct)( (it|this|that|this line|that line|the line|${LINE}))?`).test(t)) {
    return cmd('edit', ref ?? here, null);
  }
  return null;
}
