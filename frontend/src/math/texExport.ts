// MathJax input can come from a model. Only emit known math commands into a
// file that the student may compile with a full TeX engine.
const COMMANDS = new Set((
  'frac dfrac tfrac sqrt binom overline underline widehat widetilde vec dot ddot ' +
  'left right bigl bigr Bigl Bigr cdot times div pm mp le leq ge geq ne neq approx equiv ' +
  'in notin subset subseteq supset supseteq cup cap emptyset infty partial nabla ' +
  'sum prod int iint iiint oint lim log ln exp sin cos tan sec csc cot arcsin arccos arctan ' +
  'min max gcd det mod bmod pmod to rightarrow leftarrow leftrightarrow implies iff ' +
  'alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi ' +
  'pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega ' +
  'Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega ' +
  'text mathrm mathit mathbf mathsf mathtt mathbb mathcal quad qquad ldots cdots vdots ddots ' +
  'langle rangle lvert rvert lVert rVert vert Vert forall exists neg land lor perp'
).split(/\s+/));
const CONTROL_SYMBOLS = new Set([' ', ',', ';', ':', '!', '{', '}', '%', '#', '$', '_', '&', '|']);

function exportableMath(latex: string): boolean {
  if (!latex.trim() || /\^\^|[\u0000-\u0008\u000b-\u001f\u007f]/.test(latex)) return false;
  let depth = 0;
  for (const part of latex.match(/\\[a-zA-Z]+|\\[\s\S]|[\s\S]/g) ?? []) {
    if (part.startsWith('\\')) {
      const command = part.slice(1);
      if (!COMMANDS.has(command) && !CONTROL_SYMBOLS.has(command)) return false;
    } else if (part === '{') {
      depth += 1;
    } else if (part === '}') {
      depth -= 1;
      if (depth < 0) return false;
    } else if ('%$#&~'.includes(part)) {
      return false;
    }
  }
  return depth === 0;
}

export function texDocument(lines: readonly string[]): string {
  const unsupported = lines.findIndex((line) => !exportableMath(line));
  if (unsupported >= 0) {
    throw new Error('Line ' + (unsupported + 1) + ' contains LaTeX that cannot be exported.');
  }
  const equations = lines.map((line) => [
    '\\begin{equation}',
    line.trim().replace(/\r?\n/g, ' '),
    '\\end{equation}',
  ].join('\n'));
  return [
    '\\documentclass{article}',
    '\\usepackage{amsmath,amssymb}',
    '\\begin{document}',
    '\\section*{My work}',
    ...equations,
    '\\end{document}',
    '',
  ].join('\n');
}
