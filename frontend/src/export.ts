// Hand-in export — issue #22 (DESIGN.md 6 F15, 13).
//
// Builds a standalone, accessible HTML document of the student's typed work:
// lang attribute, a title, headings, numbered lists, and real MathML for every
// line (so a screen reader, a braille display or MathCAT can read it, and an
// instructor sees typeset math). No scripts, no external requests, nothing that
// needs Glance to open it later.
//
// It contains only what the student confirmed. Step-check results are left out
// on purpose: a hand-in should show the student's work, not the app's opinion
// of it.

export interface ExportLine {
  latex: string;
  /** Plain-language reading, used as the MathML alt text. */
  spoken: string;
  /** False when SymPy could not read it; marked in the export, never hidden. */
  valid: boolean;
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
  const note = line.valid ? '' : ' <span class="note">(could not be checked)</span>';
  return `    <li>${body}${note}</li>`;
}

export async function buildExportHtml(input: ExportInput): Promise<string> {
  const when = input.date.toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' });
  const who = input.name.trim();
  const title = who ? `Math work — ${who}` : 'Math work';
  const problem = await Promise.all(input.problem.map(lineItem));
  const work = await Promise.all(input.work.map(lineItem));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font: 18px/1.6 system-ui, sans-serif; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; color: #111; background: #fff; }
  h1 { font-size: 1.6rem; } h2 { font-size: 1.25rem; margin-top: 2rem; }
  li { margin: .75rem 0; } math { font-size: 1.2em; } .note, .meta { color: #444; font-size: .9rem; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">${escapeHtml(when)}. Typed with Glance; every line was read back to the student and confirmed.</p>
  <h2>Problem</h2>
${input.instructions.trim() ? `  <p>${escapeHtml(input.instructions.trim())}</p>\n` : ''}  <ol>
${problem.join('\n')}
  </ol>
  <h2>My work</h2>
${work.length ? `  <ol>\n${work.join('\n')}\n  </ol>` : '  <p>No lines written yet.</p>'}
</main>
</body>
</html>
`;
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
