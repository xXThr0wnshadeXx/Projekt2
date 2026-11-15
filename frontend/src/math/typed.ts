// Reading a typed line without the model.
//
// Turning "two x equals eight" or "(x+1)/2 = 5" into LaTeX normally goes
// through the model on the server. With no server, or a server with no model
// key, that left the scratchpad unable to accept a single line: the student
// could read a problem and then not write anything. Typing is supposed to be a
// first-class way to work, and typed math written with ordinary symbols does
// not need a model to be read — it needs a parser.
//
// This is that parser. It is deliberately small and deliberately strict:
//
//   - It transcribes. It never simplifies, reorders, completes or evaluates —
//     what comes out is what was typed, in LaTeX. It cannot solve anything.
//   - It refuses rather than guesses. Words whose grouping is unclear ("x plus
//     one over two") and anything it does not recognise return null, and the
//     student is asked to type it with symbols and brackets instead.
//   - The result is still read back and confirmed before it is saved, exactly
//     like a line from the model.

const NUMBER_WORDS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
  thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16',
  seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20',
};

// Phrases first, so "is equal to" is consumed before "is" can be refused.
const PHRASES: [RegExp, string][] = [
  [/\bis equal to\b/g, ' = '],
  [/\bequal to\b/g, ' = '],
  [/\bequals\b/g, ' = '],
  [/\bis less than or equal to\b/g, ' <= '],
  [/\bis greater than or equal to\b/g, ' >= '],
  [/\bis less than\b/g, ' < '],
  [/\bis greater than\b/g, ' > '],
  [/\bplus\b/g, ' + '],
  [/\bminus\b/g, ' - '],
  [/\bnegative\b/g, ' -'],
  [/\btimes\b/g, ' * '],
  [/\bsquared\b/g, '^2 '],
  [/\bcubed\b/g, '^3 '],
  [/\bthe square root of\b/g, ' sqrt '],
  [/\bsquare root of\b/g, ' sqrt '],
];

// Said aloud these do not say what they group. Never guessed at.
const UNCLEAR = /\b(over|divided by|all|quantity|of|to the|power|root)\b/;

const FUNCTIONS: Record<string, string> = {
  sin: String.raw`\sin`, cos: String.raw`\cos`, tan: String.raw`\tan`,
  log: String.raw`\log`, ln: String.raw`\ln`,
};

// Two letters side by side are read as a product ("xy"), unless they are a
// word. A word here means the line was prose, not math.
const SHORT_WORDS = new Set([
  'is', 'of', 'to', 'or', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'if', 'in',
  'it', 'me', 'my', 'no', 'on', 'so', 'up', 'us', 'we', 'am', 'he', 'hi', 'oh',
]);

type Token =
  | { kind: 'num'; text: string }
  | { kind: 'var'; text: string }
  | { kind: 'fn'; text: string }
  | { kind: 'sqrt' }
  | { kind: 'pi' }
  | { kind: 'op'; text: string }
  | { kind: 'rel'; text: string };

const RELATIONS: Record<string, string> = {
  '=': '=', '<': '<', '>': '>',
  '<=': String.raw`\le`, '>=': String.raw`\ge`, '!=': String.raw`\ne`,
};

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    const number = /^\d+(?:\.\d+)?/.exec(input.slice(i));
    if (number) {
      tokens.push({ kind: 'num', text: number[0] });
      i += number[0].length;
      continue;
    }
    const letters = /^[a-zA-Z]+/.exec(input.slice(i));
    if (letters) {
      const word = letters[0];
      const lower = word.toLowerCase();
      if (lower === 'sqrt') tokens.push({ kind: 'sqrt' });
      else if (lower === 'pi') tokens.push({ kind: 'pi' });
      else if (lower in FUNCTIONS) tokens.push({ kind: 'fn', text: FUNCTIONS[lower] });
      else if (word.length === 1) tokens.push({ kind: 'var', text: word });
      else if (word.length === 2 && !SHORT_WORDS.has(lower)) {
        tokens.push({ kind: 'var', text: word[0] }, { kind: 'var', text: word[1] });
      } else return null; // a word we do not know: this is not plain math
      i += word.length;
      continue;
    }
    const two = input.slice(i, i + 2);
    if (two in RELATIONS && two.length === 2) {
      tokens.push({ kind: 'rel', text: RELATIONS[two] });
      i += 2;
      continue;
    }
    if (c in RELATIONS) tokens.push({ kind: 'rel', text: RELATIONS[c] });
    else if ('+-*/^()'.includes(c)) tokens.push({ kind: 'op', text: c });
    else return null;
    i += 1;
  }
  return tokens;
}

/** A piece of LaTeX, and whether it came from a bracketed group. */
interface Piece {
  latex: string;
  /** The same group without its brackets, for use inside \frac or \sqrt. */
  bare?: string;
}

class Parser {
  private at = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.at];
  }

  private isOp(text: string): boolean {
    const t = this.peek();
    return t?.kind === 'op' && t.text === text;
  }

  done(): boolean {
    return this.at >= this.tokens.length;
  }

  line(): string {
    let out = this.sum().latex;
    while (this.peek()?.kind === 'rel') {
      const rel = (this.tokens[this.at++] as { text: string }).text;
      out += ` ${rel} ${this.sum().latex}`;
    }
    return out;
  }

  private sum(): Piece {
    const first = this.product();
    if (!this.isOp('+') && !this.isOp('-')) return first;
    let out = first.latex;
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.tokens[this.at++] as { text: string }).text;
      out += ` ${op} ${this.product().latex}`;
    }
    return { latex: out };
  }

  private startsFactor(): boolean {
    const t = this.peek();
    if (!t) return false;
    if (t.kind === 'op') return t.text === '(';
    return t.kind !== 'rel';
  }

  private product(): Piece {
    let left = this.signed();
    for (;;) {
      if (this.isOp('*')) {
        this.at += 1;
        left = { latex: String.raw`${left.latex} \cdot ${this.signed().latex}` };
      } else if (this.isOp('/')) {
        this.at += 1;
        const right = this.signed();
        // Brackets that only said "this whole thing is the top" are not
        // needed once it is the top of a fraction.
        left = {
          latex: String.raw`\frac{${left.bare ?? left.latex}}{${right.bare ?? right.latex}}`,
        };
      } else if (this.startsFactor()) {
        // Written side by side: 2x, 3(x+1), xy.
        const right = this.power();
        // Two numbers side by side are not a product anyone typed on
        // purpose: "twenty one" arrives here as 20 and 1. Refuse it.
        if (/\d$/.test(left.latex) && /^\d/.test(right.latex)) throw new Error('number number');
        left = { latex: left.latex + right.latex };
      } else return left;
    }
  }

  private signed(): Piece {
    if (this.isOp('-')) {
      this.at += 1;
      return { latex: `-${this.signed().latex}` };
    }
    if (this.isOp('+')) {
      this.at += 1;
      return this.signed();
    }
    return this.power();
  }

  private power(): Piece {
    const base = this.atom();
    if (!this.isOp('^')) return base;
    this.at += 1;
    const exponent = this.isOp('-') ? this.signed() : this.atom();
    return { latex: `${base.latex}^{${exponent.bare ?? exponent.latex}}` };
  }

  private group(): Piece {
    if (!this.isOp('(')) throw new Error('expected (');
    this.at += 1;
    const inner = this.line();
    if (!this.isOp(')')) throw new Error('expected )');
    this.at += 1;
    return { latex: `(${inner})`, bare: inner };
  }

  private atom(): Piece {
    const t = this.peek();
    if (!t) throw new Error('unexpected end');
    switch (t.kind) {
      case 'num':
      case 'var':
        this.at += 1;
        return { latex: t.text };
      case 'pi':
        this.at += 1;
        return { latex: String.raw`\pi ` };
      case 'sqrt': {
        this.at += 1;
        const inside = this.isOp('(') ? this.group() : this.atom();
        return { latex: String.raw`\sqrt{${inside.bare ?? inside.latex}}` };
      }
      case 'fn':
        this.at += 1;
        return { latex: `${t.text}${this.group().latex}` };
      case 'op':
        if (t.text === '(') return this.group();
        throw new Error(`unexpected ${t.text}`);
      default:
        throw new Error('unexpected relation');
    }
  }
}

/** The typed line as LaTeX, or null when this reader will not read it.
 *
 *  Null is not "wrong". It means only that the line needs the model, or needs
 *  typing with symbols, and the caller says so.
 */
export function readTyped(text: string): string | null {
  const raw = text.trim().replace(/[.;]+$/, '');
  if (!raw) return null;
  // Already LaTeX: it is the student's, and it is passed through untouched.
  if (raw.includes('\\')) return raw;

  let s = raw
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/≠/g, '!=')
    .replace(/√/g, ' sqrt ')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/π/g, ' pi ')
    .replace(/[[{]/g, '(')
    .replace(/[\]}]/g, ')');

  if (/[a-z]{3,}/i.test(s)) {
    const lower = s.toLowerCase();
    if (UNCLEAR.test(lower.replace(/\b(?:the )?square root of\b/g, ''))) return null;
    s = lower;
    for (const [pattern, replacement] of PHRASES) s = s.replace(pattern, replacement);
    s = s.replace(/\b[a-z]+\b/g, (word) => NUMBER_WORDS[word] ?? word);
  }

  const tokens = tokenize(s);
  if (!tokens || tokens.length === 0) return null;
  try {
    const parser = new Parser(tokens);
    const latex = parser.line();
    return parser.done() ? latex.replace(/\s+/g, ' ').trim() : null;
  } catch {
    return null;
  }
}
