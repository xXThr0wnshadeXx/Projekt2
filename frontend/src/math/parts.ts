// Understand it by ear — issue #199.
//
// A sighted student sees which part of an expression is on top, under the root
// or in the exponent without reading anything else. A blind student had to
// walk the whole tree to find out. This answers questions about one part of a
// line directly: "what's on top?", "what's under the root?", "how many terms
// on the left?", "spell it out".
//
// Every answer is read off the MathML that MathJax builds for the line, with no
// model. It names and reads parts of what is printed, the way a human reader
// would, so it cannot solve, simplify or suggest anything: there is no
// arithmetic here at all. That is also why it stays on in exam mode.

import { toMathML } from './sre';

export type Part =
  | 'top'
  | 'bottom'
  | 'root'
  | 'power'
  | 'base'
  | 'left'
  | 'right'
  | 'terms'
  | 'spell'
  | 'shape';

const OPERATORS: Record<string, string> = {
  '+': 'plus',
  '-': 'minus',
  '−': 'minus',
  '×': 'times',
  '·': 'times',
  '⋅': 'times',
  '*': 'times',
  '÷': 'divided by',
  '/': 'divided by',
  '=': 'equals',
  '≠': 'is not equal to',
  '<': 'is less than',
  '>': 'is greater than',
  '≤': 'is less than or equal to',
  '≥': 'is greater than or equal to',
  '≈': 'is approximately',
  '±': 'plus or minus',
  '(': 'open bracket',
  ')': 'close bracket',
  '[': 'open bracket',
  ']': 'close bracket',
  '|': 'absolute value bar',
  ',': 'comma',
  '!': 'factorial',
};

const LETTERS: Record<string, string> = {
  'π': 'pi', 'θ': 'theta', 'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'Δ': 'delta',
  'δ': 'delta', 'λ': 'lambda', 'μ': 'mu', 'σ': 'sigma', 'φ': 'phi', 'ω': 'omega',
  '∞': 'infinity',
};

// Characters MathML uses for structure that a listener never hears.
const SILENT = new Set(['⁡', '⁢', '⁣', '⁤', '']);

const RELATIONS = new Set(['=', '≠', '<', '>', '≤', '≥', '≈']);

function token(text: string): string {
  const t = text.trim();
  if (SILENT.has(t)) return '';
  return OPERATORS[t] ?? LETTERS[t] ?? t;
}

/** The meaningful children of an element, skipping wrappers and annotations. */
function kids(el: Element): Element[] {
  return Array.from(el.children).filter((c) => !c.localName.startsWith('annotation'));
}

/** Read a piece of MathML aloud in plain words. */
export function words(el: Element): string {
  const c = kids(el);
  switch (el.localName) {
    case 'mn':
    case 'mi':
    case 'mo':
    case 'mtext':
      return token(el.textContent ?? '');
    case 'mspace':
      return '';
    case 'semantics':
      return c[0] ? words(c[0]) : '';
    case 'mfrac':
      return `${words(c[0])}, over ${words(c[1])}`;
    case 'msqrt':
      return `the square root of ${join(c)}`;
    case 'mroot':
      return `the ${ordinal(words(c[1]))} root of ${words(c[0])}`;
    case 'msup': {
      const power = words(c[1]);
      if (power === '2') return `${words(c[0])} squared`;
      if (power === '3') return `${words(c[0])} cubed`;
      return `${words(c[0])} to the power ${power}`;
    }
    case 'msub':
      return `${words(c[0])} sub ${words(c[1])}`;
    case 'msubsup':
      return `${words(c[0])} sub ${words(c[1])} to the power ${words(c[2])}`;
    default:
      return join(c);
  }
}

function join(elements: Element[]): string {
  return elements.map(words).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function ordinal(n: string): string {
  return ({ '3': 'cube', '4': 'fourth', '5': 'fifth' } as Record<string, string>)[n] ?? `${n}th`;
}

/** The top row of a line, however many single-row wrappers MathJax added. */
function topRow(root: Element): Element[] {
  let row = root;
  while (kids(row).length === 1 && ['mrow', 'semantics', 'mstyle'].includes(kids(row)[0].localName)) {
    row = kids(row)[0];
  }
  return kids(row);
}

/** The two sides of a line around its top-level relation, if it has one. */
function sides(root: Element): { left: Element[]; relation: string; right: Element[] } | null {
  const row = topRow(root);
  const at = row.findIndex((e) => e.localName === 'mo' && RELATIONS.has((e.textContent ?? '').trim()));
  if (at < 0) return null;
  // A row that is itself a single <mrow> per side is unwrapped too.
  const unwrap = (part: Element[]) =>
    part.length === 1 && part[0].localName === 'mrow' ? kids(part[0]) : part;
  return {
    left: unwrap(row.slice(0, at)),
    relation: (row[at].textContent ?? '').trim(),
    right: unwrap(row.slice(at + 1)),
  };
}

/** Split a row into terms at top-level plus and minus signs. */
function terms(row: Element[]): Element[][] {
  const out: Element[][] = [[]];
  row.forEach((e, i) => {
    const op = e.localName === 'mo' ? (e.textContent ?? '').trim() : '';
    if ((op === '+' || op === '-' || op === '−') && i > 0) out.push([]);
    else out[out.length - 1].push(e);
  });
  return out.filter((t) => t.length > 0);
}

function all(root: Element, name: string): Element[] {
  const found = Array.from(root.getElementsByTagName(name));
  return root.localName === name ? [root, ...found] : found;
}

function termList(row: Element[]): string {
  const ts = terms(row).map(join);
  return `${ts.length} ${ts.length === 1 ? 'term' : 'terms'}: ${ts.join('; ')}`;
}

/** "There are 2 fractions. In the first one, " when there is more than one. */
function which(count: number, kind: string): string {
  return count > 1 ? `There are ${count} ${kind}s. In the first one, ` : '';
}

/** Answer a question about one part of `latex`, read off its structure. */
export async function describePart(latex: string, part: Part): Promise<string> {
  const root = await toMathML(latex);
  if (!root) return 'I could not read the structure of this line.';
  const s = sides(root);

  switch (part) {
    case 'top':
    case 'bottom': {
      const fractions = all(root, 'mfrac');
      if (fractions.length === 0) return 'This line has no fraction.';
      const [top, bottom] = kids(fractions[0]);
      const intro = which(fractions.length, 'fraction');
      return part === 'top'
        ? `${intro}${intro ? 'on' : 'On'} top: ${words(top)}.`
        : `${intro}${intro ? 'on' : 'On'} the bottom: ${words(bottom)}.`;
    }
    case 'root': {
      const radicals = [...all(root, 'msqrt'), ...all(root, 'mroot')];
      if (radicals.length === 0) return 'This line has no root.';
      const first = radicals[0];
      const inside = first.localName === 'mroot' ? words(kids(first)[0]) : join(kids(first));
      return `${which(radicals.length, 'root')}${radicals.length > 1 ? 'under' : 'Under'} the root: ${inside}.`;
    }
    case 'power':
    case 'base': {
      const powers = [...all(root, 'msup'), ...all(root, 'msubsup')];
      if (powers.length === 0) return 'This line has no powers.';
      const p = kids(powers[0]);
      const exponent = words(p[p.length - 1]);
      const base = words(p[0]);
      const intro = which(powers.length, 'power');
      return part === 'power'
        ? `${intro}${intro ? 'the' : 'The'} power is ${exponent}, on ${base}.`
        : `${intro}${intro ? 'the' : 'The'} base is ${base}, raised to the power ${exponent}.`;
    }
    case 'left':
    case 'right': {
      if (!s) return 'This line has no equals sign or inequality, so it has no sides.';
      const side = part === 'left' ? s.left : s.right;
      return `On the ${part} side: ${join(side)}.`;
    }
    case 'terms': {
      if (!s) return `This line has ${termList(topRow(root))}.`;
      return `On the left side, ${termList(s.left)}. On the right side, ${termList(s.right)}.`;
    }
    case 'spell': {
      const leaves = Array.from(root.querySelectorAll('mn, mi, mo, mtext'))
        .flatMap((e) => (e.localName === 'mn' ? Array.from(e.textContent ?? '') : [e.textContent ?? '']))
        .map(token)
        .filter(Boolean);
      return `${leaves.join(', ')}.`;
    }
    case 'shape': {
      if (!s) return `An expression: ${join(topRow(root))}.`;
      const kind = s.relation === '=' ? 'An equation' : s.relation === '≈' ? 'An approximation' : 'An inequality';
      const describe = (side: Element[]) =>
        side.length === 1 && side[0].localName === 'mfrac'
          ? `a fraction: ${words(side[0])}`
          : join(side);
      const between = s.relation === '=' ? '' : ` The left side ${token(s.relation)} the right side.`;
      return `${kind}. On the left, ${describe(s.left)}. On the right, ${describe(s.right)}.${between}`;
    }
  }
}
