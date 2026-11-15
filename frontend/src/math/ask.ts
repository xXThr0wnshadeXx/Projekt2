// Read the written structure of one line. There is no evaluation or algebra here.

type Relation = '=' | '<' | '>' | '≤' | '≥' | '≠';
type Sign = '+' | '-' | '±';

type Part =
  | { kind: 'atom'; text: string }
  | { kind: 'signed'; sign: Sign; value: Part }
  | { kind: 'sum'; first: Part; rest: { sign: Sign; value: Part }[] }
  | { kind: 'product'; left: Part; right: Part; explicit: boolean }
  | { kind: 'fraction'; numerator: Part; denominator: Part }
  | { kind: 'root'; radicand: Part; index?: Part }
  | { kind: 'power'; base: Part; exponent: Part }
  | { kind: 'subscript'; base: Part; index: Part }
  | { kind: 'group'; open: '(' | '['; value: Part }
  | { kind: 'function'; name: string; input: Part }
  | { kind: 'relation'; symbol: Relation; left: Part; right: Part };

const RELATION_SPEECH: Record<Relation, string> = {
  '=': 'equals',
  '<': 'less than',
  '>': 'greater than',
  '≤': 'less than or equal to',
  '≥': 'greater than or equal to',
  '≠': 'not equal to',
};

const SIGN_SPEECH: Record<Sign, string> = { '+': 'plus', '-': 'minus', '±': 'plus or minus' };
const FUNCTIONS = new Map([
  ['\\sin', 'sine'],
  ['\\cos', 'cosine'],
  ['\\tan', 'tangent'],
  ['\\log', 'logarithm'],
  ['\\ln', 'natural logarithm'],
]);
const TOKENS = new Map([
  ['\\le', '≤'], ['\\leq', '≤'], ['\\ge', '≥'], ['\\geq', '≥'],
  ['\\ne', '≠'], ['\\neq', '≠'], ['\\pm', '±'], ['−', '-'],
  ['\\cdot', '×'], ['\\times', '×'], ['·', '×'], ['*', '×'],
]);
const NUMBER = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const SPACING = /^\s|^\\(?:[,;:! ]|quad|qquad)$/;

function tokenize(latex: string): string[] | null {
  const token = /\\(?:[a-zA-Z]+|[,;:! ])|\d+(?:\.\d+)?|\.\d+|[a-zA-Z]|\s+|[{}()[\]^_+*/<>=\-−≤≥≠±×·]/y;
  const tokens: string[] = [];
  while (token.lastIndex < latex.length) {
    const match = token.exec(latex);
    if (!match) return null;
    const text = match[0];
    if (!SPACING.test(text)) tokens.push(TOKENS.get(text) ?? text);
  }
  return tokens;
}

function isRelation(token: string): token is Relation {
  return Object.hasOwn(RELATION_SPEECH, token);
}

function isSign(token: string): token is Sign {
  return Object.hasOwn(SIGN_SPEECH, token);
}

function isAtom(token: string): boolean {
  return NUMBER.test(token) || /^[a-zA-Z]$/.test(token) || token === '\\pi';
}

function startsFactor(token: string): boolean {
  return isAtom(token) || FUNCTIONS.has(token) || ['(', '[', '\\left', '\\frac', '\\sqrt'].includes(token);
}

class LineParser {
  private at = 0;

  constructor(private tokens: string[]) {}

  private peek(): string {
    return this.tokens[this.at] ?? '';
  }

  private take(token: string): boolean {
    if (this.peek() !== token) return false;
    this.at += 1;
    return true;
  }

  private expect(token: string): void {
    if (!this.take(token)) throw new SyntaxError();
  }

  line(): Part {
    const left = this.sum();
    const symbol = this.peek();
    let result = left;
    if (isRelation(symbol)) {
      this.at += 1;
      result = { kind: 'relation', symbol, left, right: this.sum() };
    }
    if (this.peek()) throw new SyntaxError();
    return result;
  }

  private sum(): Part {
    const first = this.product();
    const rest: { sign: Sign; value: Part }[] = [];
    let sign = this.peek();
    while (isSign(sign)) {
      this.at += 1;
      rest.push({ sign, value: this.product() });
      sign = this.peek();
    }
    return rest.length ? { kind: 'sum', first, rest } : first;
  }

  private product(): Part {
    let left = this.factor();
    for (;;) {
      if (this.take('/')) {
        const denominator = this.factor();
        // A bare slash followed by juxtaposition or another slash has
        // competing readings. Brackets can make either grouping explicit.
        if (this.peek() === '/' || (denominator.kind !== 'group' && startsFactor(this.peek()))) {
          throw new SyntaxError();
        }
        left = { kind: 'fraction', numerator: left, denominator };
      } else {
        const explicit = this.take('×');
        if (!explicit && !startsFactor(this.peek())) return left;
        left = { kind: 'product', left, right: this.factor(), explicit };
      }
    }
  }

  private factor(): Part {
    const sign = this.peek();
    if (isSign(sign)) {
      this.at += 1;
      return { kind: 'signed', sign, value: this.factor() };
    }
    return this.scripts(this.primary());
  }

  private scripts(base: Part): Part {
    let exponent: Part | undefined;
    let index: Part | undefined;
    for (;;) {
      if (!exponent && this.take('^')) exponent = this.scriptArgument();
      else if (!index && this.take('_')) index = this.scriptArgument();
      else break;
    }
    const indexed: Part = index ? { kind: 'subscript', base, index } : base;
    return exponent ? { kind: 'power', base: indexed, exponent } : indexed;
  }

  private scriptArgument(): Part {
    if (this.peek() === '{') return this.between('{', '}');
    const token = this.peek();
    if (!isAtom(token)) throw new SyntaxError();
    // In TeX an unbraced script takes one token: x^12 is x^1 followed by 2.
    if (/^\d/.test(token) && token.length > 1) {
      this.tokens[this.at] = token.slice(1);
      return { kind: 'atom', text: token[0] };
    }
    if (token.startsWith('.')) throw new SyntaxError();
    this.at += 1;
    return { kind: 'atom', text: token === '\\pi' ? 'pi' : token };
  }

  private between(open: string, close: string): Part {
    this.expect(open);
    const value = this.sum();
    this.expect(close);
    return value;
  }

  private primary(): Part {
    if (this.take('\\frac')) {
      const numerator = this.between('{', '}');
      return { kind: 'fraction', numerator, denominator: this.between('{', '}') };
    }
    if (this.take('\\sqrt')) {
      const index = this.peek() === '[' ? this.between('[', ']') : undefined;
      return { kind: 'root', index, radicand: this.between('{', '}') };
    }

    const scalable = this.take('\\left');
    const token = this.peek();
    if (token === '(' || token === '[') {
      this.at += 1;
      const value = this.sum();
      if (scalable) this.expect('\\right');
      this.expect(token === '(' ? ')' : ']');
      return { kind: 'group', open: token, value };
    }
    if (scalable) throw new SyntaxError();

    if (isAtom(token)) {
      this.at += 1;
      return { kind: 'atom', text: token === '\\pi' ? 'pi' : token };
    }
    const name = FUNCTIONS.get(token);
    if (!name) throw new SyntaxError();
    this.at += 1;
    const next = this.peek();
    const input = next === '{'
      ? this.between('{', '}')
      : next === '(' || next === '[' || next === '\\left' ? this.primary() : this.factor();
    return { kind: 'function', name, input };
  }
}

/** Parse only the supported notation, with no repairs to incomplete lines. */
export function parseLine(latex: string): Part | null {
  const tokens = tokenize(latex);
  if (!tokens?.length) return null;
  try {
    return new LineParser(tokens).line();
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof RangeError) return null;
    throw error;
  }
}

function children(part: Part): Part[] {
  switch (part.kind) {
    case 'atom': return [];
    case 'signed': case 'group': return [part.value];
    case 'sum': return [part.first, ...part.rest.map(({ value }) => value)];
    case 'product': case 'relation': return [part.left, part.right];
    case 'fraction': return [part.numerator, part.denominator];
    case 'root': return part.index ? [part.index, part.radicand] : [part.radicand];
    case 'power': return [part.base, part.exponent];
    case 'subscript': return [part.base, part.index];
    case 'function': return [part.input];
  }
}

function firstPart<K extends Part['kind']>(line: Part, kind: K): Extract<Part, { kind: K }> | undefined {
  // Visit a part before its contents, and read across the line from the left.
  const remaining = [line];
  while (remaining.length) {
    const part = remaining.pop()!;
    if (part.kind === kind) return part as Extract<Part, { kind: K }>;
    remaining.push(...children(part).reverse());
  }
}

function speak(part: Part, followedByMore = false): string {
  switch (part.kind) {
    case 'atom': return part.text;
    case 'signed':
      return (part.sign === '-' ? 'negative' : SIGN_SPEECH[part.sign]) + ' ' + speak(part.value, followedByMore);
    case 'sum':
      return [speak(part.first, true), ...part.rest.map(({ sign, value }, i) =>
        SIGN_SPEECH[sign] + ' ' + speak(value, followedByMore || i < part.rest.length - 1),
      )].join(' ');
    case 'product':
      return speak(part.left, true) + (part.explicit ? ' times ' : ' ') + speak(part.right, followedByMore);
    case 'fraction':
      return 'the fraction with numerator ' + speak(part.numerator, true) + ' and denominator ' +
        speak(part.denominator) + (followedByMore ? ', end fraction' : '');
    case 'root': {
      const index = part.index && speak(part.index);
      const name = !index ? 'the square root' : index === '3' ? 'the cube root' : 'the root with index ' + index;
      return name + ' of ' + speak(part.radicand) + (followedByMore ? ', end root' : '');
    }
    case 'power': {
      const base = speak(part.base, true);
      const exponent = speak(part.exponent);
      if (exponent === '2') return base + ' squared';
      if (exponent === '3') return base + ' cubed';
      return base + ' to the power of ' + exponent +
        (followedByMore && part.exponent.kind !== 'atom' ? ', end exponent' : '');
    }
    case 'subscript':
      return speak(part.base, true) + ' sub ' + speak(part.index) +
        (followedByMore && part.index.kind !== 'atom' ? ', end subscript' : '');
    case 'group': {
      const name = part.open === '(' ? 'parenthesis' : 'bracket';
      return 'open ' + name + ' ' + speak(part.value) + ', close ' + name;
    }
    case 'function': return part.name + ' of ' + speak(part.input, followedByMore);
    case 'relation': return speak(part.left, true) + ' ' + RELATION_SPEECH[part.symbol] + ' ' + speak(part.right);
  }
}

type Question = 'numerator' | 'denominator' | 'root' | 'power' | 'left' | 'right' |
  'leftTerms' | 'rightTerms' | 'kind' | 'brackets';

const QUESTIONS: [RegExp, Question][] = [
  [/^(?:on (?:the )?top|top|numerator)(?: of (?:the|this) fraction)?$/, 'numerator'],
  [/^(?:on (?:the )?bottom|bottom|denominator)(?: of (?:the|this) fraction)?$/, 'denominator'],
  [/^(?:under|inside) (?:the )?(?:square )?root$/, 'root'],
  [/^(?:power|exponent)$/, 'power'],
  [/^(?:on (?:the )?left(?: side)?|left side)$/, 'left'],
  [/^(?:on (?:the )?right(?: side)?|right side)$/, 'right'],
  [/^how many terms (?:are )?on (?:the )?left(?: side)?$/, 'leftTerms'],
  [/^how many terms (?:are )?on (?:the )?right(?: side)?$/, 'rightTerms'],
  [/^(?:what kind of line is this|what(?: is|'?s) this)$/, 'kind'],
  [/^(?:in|inside) (?:the )?(?:brackets|parentheses)$/, 'brackets'],
];

function describePart(part: Part | undefined, label: string, missing: string): string {
  return part ? 'The ' + label + ' is ' + speak(part) + '.' : 'There ' + missing + ' in this line.';
}

/** Answer only questions about what is written on this line. */
export function askAbout(question: string, latex: string): string | null {
  const text = question.toLowerCase().trim().replace(/’/g, "'").replace(/[.!?]+$/, '')
    .replace(/\s+/g, ' ');
  const subject = text.replace(/^(?:what'?s|what is) /, '').replace(/^the /, '');
  const kind = QUESTIONS.find(([pattern, key]) => pattern.test(key === 'kind' ? text : subject))?.[1];
  if (!kind) return null;
  const line = parseLine(latex);
  if (!line) return 'I could not read the structure of this line.';

  switch (kind) {
    case 'numerator':
    case 'denominator':
      return describePart(firstPart(line, 'fraction')?.[kind], kind, 'is no fraction');
    case 'root':
      return describePart(firstPart(line, 'root')?.radicand, 'part under the root', 'is no root');
    case 'power':
      return describePart(firstPart(line, 'power')?.exponent, 'exponent', 'is no exponent');
    case 'brackets': {
      const group = firstPart(line, 'group');
      return group ? 'Inside the brackets: ' + speak(group.value) + '.' : 'There are no brackets in this line.';
    }
    case 'kind':
      if (line.kind !== 'relation') return 'An expression.';
      return line.symbol === '=' ? 'An equation.' : 'An inequality: ' + RELATION_SPEECH[line.symbol] + '.';
    default: {
      const side = kind === 'left' || kind === 'leftTerms' ? 'left' : 'right';
      if (line.kind !== 'relation') return 'There is no ' + side + ' side in this line.';
      const part = line[side];
      if (kind === side) return describePart(part, side + ' side', 'is no ' + side + ' side');
      const terms = part.kind === 'sum' ? part.rest.length + 1 : 1;
      return terms === 1 ? 'There is 1 term on the ' + side + '.' : 'There are ' + terms + ' terms on the ' + side + '.';
    }
  }
}
