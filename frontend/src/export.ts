// Hand-in export — issue #22 (DESIGN.md 6 F15, 13).
//
// Builds a standalone, accessible HTML document of the student's typed work:
// lang attribute, a title, headings, numbered lists, and real MathML for every
// line (so a screen reader, a braille display or MathCAT can read it, and an
// instructor sees typeset math). No scripts, no external requests, nothing that
// needs Glance to open it later.
//
// It contains the student's lines and nothing that judges them. Step-check
// results, and whether a line could be parsed, are left out on purpose: a
// hand-in shows the student's work, not the app's opinion of it. The one claim
// it makes, that lines were read back and confirmed, is written from what
// happened to each line.

export interface ExportLine {
  latex: string;
  /** Plain-language reading, used as the MathML alt text. */
  spoken: string;
  /** Kept for callers; deliberately never shown in the file. */
  valid: boolean;
  /** The student heard this line read back and confirmed it. */
  confirmed?: boolean;
}

export interface ExportInput {
  name: string;
  instructions: string;
  problem: ExportLine[];
  work: ExportLine[];
  date: Date;
}

const UNSAFE_ATTRS = /^(on|href$|xlink:href$|src$|style$|class$|id$|data-semantic-)/i;
const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Keep only MathML elements and harmless attributes.
 *
 *  The LaTeX comes from a model reading a photo or from speech, and LaTeX can
 *  carry links (\href{javascript:…}) and classes. Anything that could run code
 *  or reach the network when the file is opened is removed, along with
 *  MathJax's internal enrichment attributes.
 */
export function sanitizeMathML(markup: string): string | null {
  const doc = new DOMParser().parseFromString(markup, 'application/xml');
  const root = doc.documentElement;
  if (!root || root.namespaceURI !== MATHML_NS || root.localName !== 'math') return null;
  if (doc.getElementsByTagName('parsererror').length) return null;

  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (child.namespaceURI !== MATHML_NS) {
        child.remove();
        continue;
      }
      walk(child);
    }
    for (const attr of Array.from(el.attributes)) {
      if (UNSAFE_ATTRS.test(attr.name) || /javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  };
  walk(root);
  return new XMLSerializer().serializeToString(root);
}

/** LaTeX → sanitised display MathML, using the MathJax already on the page. */
export async function toMathML(latex: string, spoken: string): Promise<string | null> {
  try {
    await window.MathJax?.startup?.promise;
    const raw: string = await window.MathJax.tex2mmlPromise(latex, { display: true });
    const clean = sanitizeMathML(raw);
    if (!clean) return null;
    // alttext is read by tools that can't handle MathML; set after cleaning.
    const doc = new DOMParser().parseFromString(clean, 'application/xml');
    doc.documentElement.setAttribute('alttext', spoken || latex);
    return new XMLSerializer().serializeToString(doc.documentElement);
  } catch {
    return null;
  }
}

async function lineItem(line: ExportLine): Promise<string> {
  const mathml = await toMathML(line.latex, line.spoken);
  // If MathJax can't convert a line, fall back to the LaTeX as text rather
  // than dropping it — a missing line in a hand-in is worse than a raw one.
  const body = mathml ?? `<code>${escapeHtml(line.latex)}</code>`;
  return `    <li>${body}</li>`;
}

/** The plain text of a line, as it is read aloud. */
function lineText(line: ExportLine): string {
  return (line.spoken || line.latex).trim();
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** What the file says about read-back, from what actually happened.
 *  Empty when there is no work to talk about. */
export function confirmationStatement(work: ExportLine[]): string {
  if (work.length === 0) return '';
  const confirmed = work.filter((l) => l.confirmed === true).length;
  if (confirmed === work.length) {
    return work.length === 1
      ? 'The line was read back and confirmed by the student.'
      : `All ${work.length} lines were read back and confirmed by the student.`;
  }
  return `${confirmed} of ${work.length} lines were read back and confirmed by the student.`;
}

/** The one text model behind both the file and "Read my hand-in". */
export interface HandInModel {
  title: string;
  /** Date and the statement about read-back. */
  meta: string;
  instructions: string;
  problem: string[];
  work: string[];
}

export function handInModel(input: ExportInput): HandInModel {
  const when = input.date.toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' });
  const who = input.name.trim();
  const statement = confirmationStatement(input.work);
  return {
    title: who ? `Math work — ${who}` : 'Math work',
    meta: [`${when}.`, 'Written with Glance.', statement].filter(Boolean).join(' '),
    instructions: input.instructions.trim(),
    problem: input.problem.map(lineText),
    work: input.work.map(lineText),
  };
}

/** Exactly what the instructor's file contains, as lines to read aloud. */
export function handInReadout(input: ExportInput): string[] {
  const m = handInModel(input);
  const out = [`${m.title}.`, m.meta, 'Problem.'];
  if (m.instructions) out.push(m.instructions);
  m.problem.forEach((t, i) => out.push(`Problem line ${i + 1}. ${t}.`));
  out.push('My work.');
  if (m.work.length === 0) out.push('No lines written yet.');
  m.work.forEach((t, i) => out.push(`Line ${i + 1}. ${t}.`));
  return out;
}

export async function buildExportHtml(input: ExportInput): Promise<string> {
  const m = handInModel(input);
  const problem = await Promise.all(input.problem.map(lineItem));
  const work = await Promise.all(input.work.map(lineItem));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(m.title)}</title>
<style>
  body { font: 18px/1.6 system-ui, sans-serif; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; color: #111; background: #fff; }
  h1 { font-size: 1.6rem; } h2 { font-size: 1.25rem; margin-top: 2rem; }
  li { margin: .75rem 0; } math { font-size: 1.2em; } .meta { color: #444; font-size: .9rem; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(m.title)}</h1>
  <p class="meta">${escapeHtml(m.meta)}</p>
  <h2>Problem</h2>
${m.instructions ? `  <p>${escapeHtml(m.instructions)}</p>\n` : ''}  <ol>
${problem.join('\n')}
  </ol>
  <h2>My work</h2>
${work.length ? `  <ol>\n${work.join('\n')}\n  </ol>` : '  <p>No lines written yet.</p>'}
</main>
</body>
</html>
`;
}

/** A short spoken summary, said before the file leaves. */
export function handInSummary(workCount: number, instructions: string, isSample: boolean): string {
  const trimmed = instructions.trim().replace(/\s+/g, ' ');
  const short = trimmed.length > 60 ? `${trimmed.slice(0, 60).trimEnd()}…` : trimmed;
  const forWhat = isSample ? 'the sample problem' : short ? `problem: ${short}` : 'the problem';
  return `${plural(workCount, 'line')} of work, for ${forWhat}.`;
}

/** 'blocked': the browser wants a tap on the button first (no recent user gesture). */
export type ShareResult = 'shared' | 'cancelled' | 'unsupported' | 'blocked';

/** Offer the file to the phone's share sheet. 'unsupported' means nothing was
 *  shown and the caller should download instead. */
export async function shareFile(file: File, title: string): Promise<ShareResult> {
  if (typeof navigator.canShare !== 'function' || typeof navigator.share !== 'function') return 'unsupported';
  try {
    if (!navigator.canShare({ files: [file] })) return 'unsupported';
    await navigator.share({ files: [file], title });
    return 'shared';
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    if (e instanceof DOMException && e.name === 'NotAllowedError') return 'blocked';
    return 'unsupported';
  }
}

/** Hand the file to the browser as a download. Nothing is uploaded. */
export function downloadFile(filename: string, contents: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
