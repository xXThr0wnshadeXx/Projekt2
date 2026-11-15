/**
 * Live check for issue #176: capture must copy printed instructions exactly,
 * leave them empty when there are none, and keep headings out of math lines.
 *
 * Renders the two non-sensitive fixtures from the issue and sends each to a
 * deployed capture endpoint (two model calls in total). Run from the repo root:
 *   node eval/run_instruction_fidelity.mjs https://api.example
 * Exits non-zero if either fixture fails.
 */
import { chromium } from 'playwright';

const baseUrl = process.argv[2];
if (!baseUrl?.startsWith('http')) {
  throw new Error('Usage: node eval/run_instruction_fidelity.mjs BASE_URL');
}

const page = (body) => `<!doctype html><meta charset="utf-8"><body style="margin:0">
  <main style="width:900px;height:420px;padding:60px 80px;box-sizing:border-box;background:#fff;color:#111;font-family:Georgia,serif">
  ${body}</main></body>`;

const fixtures = [
  {
    name: 'A: equations only',
    html: page(`<p style="font-size:44px;margin:30px 0">2x + 3 = 11</p>
      <p style="font-size:44px;margin:30px 0">(x + 1) / 2 = 5</p>`),
    expectInstructions: '',
    expectLines: 2,
  },
  {
    name: 'B: heading and equation',
    html: page(`<p style="font-size:30px;margin:0 0 40px">Solve for x.</p>
      <p style="font-size:44px;margin:30px 0">2x + 3 = 11</p>`),
    expectInstructions: 'Solve for x.',
    expectLines: 1,
  },
];

const words = (text) => String(text).toLowerCase().replace(/[^a-z0-9]/g, '');
const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 900, height: 420 } });
let failed = 0;
try {
  for (const fixture of fixtures) {
    await tab.setContent(fixture.html);
    const png = await tab.screenshot();
    const body = new FormData();
    body.append('image', new Blob([png], { type: 'image/png' }), 'fixture.png');
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/capture`, { method: 'POST', body });
    const result = response.ok ? await response.json() : { error: `HTTP ${response.status}` };
    const lines = (result.lines ?? []).map((line) => line.latex);
    const problems = [];
    if (result.error) problems.push(result.error);
    if (words(result.instructions) !== words(fixture.expectInstructions)) {
      problems.push(`instructions ${JSON.stringify(result.instructions)}, expected ${JSON.stringify(fixture.expectInstructions)}`);
    }
    if (lines.some((latex) => /\\text\s*\{[^}]*[a-z]{2,}[^}]*[a-z]{2,}/i.test(latex))) {
      problems.push('a sentence came back as a math line');
    }
    if (lines.length !== fixture.expectLines) problems.push(`${lines.length} lines, expected ${fixture.expectLines}`);
    if (problems.length) failed += 1;
    console.log(JSON.stringify({ fixture: fixture.name, pass: problems.length === 0, instructions: result.instructions, lines, problems }));
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
