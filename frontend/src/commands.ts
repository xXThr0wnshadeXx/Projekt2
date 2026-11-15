// Voice and typed commands in the scratchpad — issue #24 (DESIGN.md 9, F16).
//
// What the student says or types is either a line of math or a command. A
// command starts with one of a small set of words ("next", "read", "delete",
// "undo", "check", "hand in", "help", "change … to …"); everything else is
// math, exactly as before. The server decides which command it is.

const COMMAND_START = new RegExp(
  '^(?:(?:please|okay|ok|um|uh|glance)\\s+)?(?:' +
    [
      'next', 'previous', 'back', 'go (?:to|back|up|down)', 'jump to', 'move to', 'line \\w+$',
      'first line', 'last line', 'top$', 'down$', 'up$',
      '(?:the )?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\\d{1,3}(?:st|nd|rd|th)) line$',
      'read', 'delete', 'remove', 'erase', 'scratch', 'cross out',
      'undo', 'new line', 'add (?:a )?(?:new )?line', 'start a new line',
      'check', 'what changed',
      'export', 'hand (?:it )?in', 'download', 'print', 'save as pdf',
      'help', 'what can i say', 'what are the commands$', 'commands$',
      'change', 'replace', 'swap', 'edit', 'fix', 'correct',
    ].join('|') +
    ')\\b',
  'i',
);

export function looksLikeCommand(text: string): boolean {
  return COMMAND_START.test(text.trim().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim());
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
  // Match complete tokens so editing 1 cannot alter 12 or a command name.
  const tokens = latex.match(/\\[a-zA-Z]+|\\[^a-zA-Z]|(?:\d+(?:\.\d+)?|\.\d+)|[a-zA-Z]|[\s\S]/g) ?? [];
  const positions = tokens.flatMap((token, index) => token === from ? [index] : []);
  if (positions.length !== 1) return null;
  tokens[positions[0]] = to;
  return tokens.join('');
}
