// Structure summary — the "glance" (issue #11).
//
// A screen reader reads an equation token by token, left to right. A sighted
// reader glances and knows its shape before reading any of it: "a fraction with
// a root on top". This module produces that shape in a sentence or two, which
// is the one thing the whole product is named after.
//
// It is computed from the MathML tree MathJax builds, not from the model. That
// matters for three reasons: it is deterministic, it works with no network
// (so `G` still speaks during a demo with the API down), and it structurally
// *cannot* solve anything — it only ever counts and names parts, which is the
// hard rule in AGENTS.md. DESIGN.md 10.5 allows an optional model rewrite of
// this text; that stays optional and is not required for `G` to work.

import { loadMathJax } from './mathjax';

const RELATIONS: Record<string, string> = {
  '=': 'an equation',
  '≠': 'an equation',
  '<': 'an inequality',
  '>': 'an inequality',
  '≤': 'an inequality',
  '≥': 'an inequality',
  '≈': 'an approximate equation',
};

/** Convert LaTeX to a MathML document, or null if MathJax cannot. */
async function toMathML(latex: string): Promise<Element | null> {
  await loadMathJax();
  const mj = window.MathJax;
  try {
    const xml: string = mj.tex2mmlPromise
      ? await mj.tex2mmlPromise(latex)
      : mj.tex2mml(latex);
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) return null;
    return doc.documentElement;
  } catch {
    return null;
  }
}

/** Depth of nesting among the constructs a listener has to hold in memory. */
function nestingDepth(el: Element, depth = 0): number {
  const heavy = ['mfrac', 'msqrt', 'mroot', 'msup', 'msub', 'msubsup'];
  const here = heavy.includes(el.localName) ? depth + 1 : depth;
  let deepest = here;
  for (const child of Array.from(el.children)) {
    deepest = Math.max(deepest, nestingDepth(child, here));
  }
  return deepest;
}

function count(root: Element, name: string): number {
  return root.getElementsByTagName(name).length + (root.localName === name ? 1 : 0);
}

/** Plural-aware "2 fractions" / "1 fraction". */
function list(parts: [number, string, string][]): string {
  const said = parts
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
  if (said.length === 0) return '';
  if (said.length === 1) return said[0];
  return `${said.slice(0, -1).join(', ')} and ${said[said.length - 1]}`;
}

/** Find the top-level relation symbol, if there is one. */
function topLevelRelation(root: Element): string | null {
  // MathJax can wrap the whole line in one row, or group just the left side
  // in a row alongside the relation and right side. Unwrap only whole lines.
  let row = root;
  while (row.childElementCount === 1 && row.firstElementChild?.localName === 'mrow') {
    row = row.firstElementChild;
  }
  for (const child of Array.from(row.children)) {
    if (child.localName === 'mo') {
      const op = (child.textContent ?? '').trim();
      if (op in RELATIONS) return op;
    }
  }
  return null;
}

/** Describe only the structure of `latex` in one or two short sentences. */
export async function structureSummary(latex: string): Promise<string> {
  const root = await toMathML(latex);
  if (!root) {
    return 'I could not read the structure of this line.';
  }

  const relation = topLevelRelation(root);
  const kind = relation ? RELATIONS[relation] : 'an expression';

  const fractions = count(root, 'mfrac');
  const roots = count(root, 'msqrt') + count(root, 'mroot');
  const powers = count(root, 'msup');
  const subscripts = count(root, 'msub') + count(root, 'msubsup');

  const parts = list([
    [fractions, 'fraction', 'fractions'],
    [roots, 'square root', 'square roots'],
    [powers, 'exponent', 'exponents'],
    [subscripts, 'subscript', 'subscripts'],
  ]);

  const sentences: string[] = [];

  if (relation) {
    // Naming the two sides is the single most useful thing for a listener
    // about to walk the tree: it tells them where the halves are.
    sentences.push(`This is ${kind}, with a left side and a right side.`);
  } else {
    sentences.push(`This is ${kind}.`);
  }

  if (parts) {
    const depth = nestingDepth(root);
    const nested = depth >= 2 ? ', nested' : '';
    sentences.push(`It contains ${parts}${nested}.`);
  } else {
    sentences.push('It has no fractions, roots or exponents.');
  }

  return sentences.join(' ');
}

/** Nemeth braille for a line, when MathJax's braille output is available.
 *
 *  Export (issue #23) is the main consumer. Returns null rather than guessing
 *  when the build cannot produce it — wrong braille is worse than none.
 */
export async function nemeth(latex: string): Promise<string | null> {
  try {
    await loadMathJax();
    const mj = window.MathJax;
    if (!mj?.tex2chtmlPromise) return null;
    const node = await mj.tex2chtmlPromise(latex, { display: true });
    if (node?.querySelector('mjx-merror')) return null;
    const label = node?.getAttribute('data-semantic-braille')?.trim();
    return label || null;
  } catch {
    return null;
  }
}
