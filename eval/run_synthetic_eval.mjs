/**
 * Reproducible synthetic smoke evaluation for the deployed capture endpoint.
 *
 * This deliberately creates rendered, non-sensitive math pages.  It is useful
 * for catching route/model regressions, but is not evidence for handwriting or
 * real-camera quality.  Run:
 *   node eval/run_synthetic_eval.mjs https://api.example --model MODEL_ID
 */
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve('eval', 'photos');
const model = process.argv[process.argv.indexOf('--model') + 1];
const baseUrl = process.argv[2];
if (!baseUrl || !model || !baseUrl.startsWith('http')) {
  throw new Error('Usage: node eval/run_synthetic_eval.mjs BASE_URL --model MODEL_ID');
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const retryFailed = process.argv.includes('--retry-failed');

const examples = [
  ['2x + 3 = 11', 'x = 4'], ['3y - 5 = 16', 'y = 7'],
  ['x^2 + 5x + 6 = 0', '(x + 2)(x + 3) = 0'],
  ['4a + 9 = 29', 'a = 5'], ['7m - 8 = 20', 'm = 4'],
  ['2(p + 3) = 18', 'p = 6'], ['5q + 1 = 21', 'q = 4'],
  ['r / 3 + 2 = 7', 'r = 15'], ['9 - 2t = 1', 't = 4'],
  ['6z + 4 = 40', 'z = 6'], ['x / 4 = 3', 'x = 12'],
  ['8b - 6 = 18', 'b = 3'], ['c + 12 = 19', 'c = 7'],
  ['3(n - 2) = 21', 'n = 9'], ['2w + 10 = 0', 'w = -5'],
  ['h^2 = 49', 'h = 7'], ['k - 4 = -9', 'k = -5'],
  ['11v = 88', 'v = 8'], ['d / 5 = -2', 'd = -10'],
  ['4g + 7 = 35', 'g = 7'], ['u + 6 = 14', 'u = 8'],
  ['2s - 1 = 13', 's = 7'], ['10 - f = 3', 'f = 7'],
  ['3x + 2 = 17', 'x = 5'], ['6y / 2 = 15', 'y = 5'],
  ['a^2 - 9 = 0', 'a = 3'], ['4e = 28', 'e = 7'],
  ['j + 15 = 22', 'j = 7'], ['2l + 8 = 18', 'l = 5'],
  ['p - 13 = 4', 'p = 17'],
];
const categories = [
  ...Array(10).fill('slides'), ...Array(10).fill('whiteboard'),
  ...Array(5).fill('textbook'), ...Array(5).fill('handwritten'),
];
const style = {
  slides: 'background:#f7fbff;color:#122a44;font-family:Arial,sans-serif;border-top:72px solid #20639b;',
  whiteboard: 'background:#fbfff9;color:#165b33;font-family:"Comic Sans MS",cursive;border:10px solid #c9e7d2;',
  textbook: 'background:#fffdf5;color:#1a1a1a;font-family:Georgia,serif;border:2px solid #7a6b52;',
  handwritten: 'background:repeating-linear-gradient(#fffef7 0 38px,#b9d6f2 39px 40px);color:#153d79;font-family:"Segoe Print","Comic Sans MS",cursive;',
};
const latex = (text) => text.replaceAll('^', '^').replaceAll(' / ', ' \\div ');
const html = (category, lines, number) => `<!doctype html><meta charset="utf-8"><body><main style="${style[category]}width:1060px;height:610px;padding:55px 90px;box-sizing:border-box"><p style="font-size:22px;margin:0 0 55px">Algebra practice ${number}</p>${lines.map((line, i) => `<p style="font-size:${category === 'handwritten' ? 52 : 48}px;margin:28px 0;${category === 'handwritten' ? `transform:rotate(${i ? '-0.5' : '0.4'}deg)` : ''}">${line}</p>`).join('')}</main></body>`;

await mkdir(root, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1240, height: 720 }, deviceScaleFactor: 1 });
const images = [];
try {
  for (let index = 0; index < examples.length; index += 1) {
    const category = categories[index];
    const file = `synthetic-${String(index + 1).padStart(2, '0')}.png`;
    await page.setContent(html(category, examples[index], index + 1));
    await page.screenshot({ path: join(root, file) });
    images.push({ file, category, lines: examples[index].map(latex) });
  }
} finally {
  await browser.close();
}
await writeFile(join(root, 'synthetic_expected.json'), JSON.stringify({ images }, null, 2));
const pilot = { images: [...images.slice(0, 3), ...images.slice(10, 13), ...images.slice(20, 22), ...images.slice(25, 27)] };
await writeFile(join(root, 'synthetic_pilot_expected.json'), JSON.stringify(pilot, null, 2));

const normalized = (line) => String(line).toLowerCase().replace(/[\s]/g, '');
const equivalent = (line) => normalized(line)
  .replace(/\\(?:text)\{[^}]*\}/g, '')
  .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
  .replaceAll('\\div', '/')
  .replace(/[{}\\]/g, '');
function score(expected, actual) {
  const used = new Set();
  let exact = 0;
  let matched = 0;
  for (const line of expected) {
    const exactIndex = actual.findIndex((candidate, index) => !used.has(index) && normalized(candidate) === normalized(line));
    const equivalentIndex = exactIndex < 0
      ? actual.findIndex((candidate, index) => !used.has(index) && equivalent(candidate) === equivalent(line))
      : -1;
    const index = exactIndex >= 0 ? exactIndex : equivalentIndex;
    if (index >= 0) {
      used.add(index);
      matched += 1;
      exact += Number(exactIndex >= 0);
    }
  }
  return { exact, matched, slots: Math.max(expected.length, actual.filter((line) => !String(line).startsWith('\\text{Algebra practice')).length) };
}
const reportPath = join(root, 'synthetic_report.json');
const previous = retryFailed ? JSON.parse(await readFile(reportPath, 'utf8')) : null;
const priorRows = previous ? Object.fromEntries(Object.entries(previous.results).map(([category, value]) => [category, value.cases])) : {};
const failedFiles = new Set(previous ? Object.values(previous.results).flatMap((value) => value.cases.filter((row) => row.error).map((row) => row.file)) : []);
const targets = retryFailed ? images.filter((image) => failedFiles.has(image.file)) : images;
const results = Object.fromEntries(Object.entries(priorRows).map(([category, rows]) => [category, rows.filter((row) => !failedFiles.has(row.file))]));
for (const image of targets) {
  const started = performance.now();
  let actual = [], error = null;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const body = new FormData();
      body.append('image', new Blob([await readFile(join(root, image.file))], { type: 'image/png' }), image.file);
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/capture`, { method: 'POST', body });
      if (response.status === 429 && attempt < 2) {
        await delay((Number(response.headers.get('retry-after')) || 60) * 1000 + 250);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      actual = (await response.json()).lines.map((line) => line.latex);
      break;
    }
  } catch (caught) { error = caught.message; }
  const scoreResult = score(image.lines, actual);
  const row = { file: image.file, ms: Math.round(performance.now() - started), expected: image.lines, actual, ...scoreResult, error };
  (results[image.category] ??= []).push(row);
  // The deployed API intentionally limits model-backed calls to 20/minute.
  // Leave room for slower requests and other real users during this smoke test.
  await delay(3200);
}
const summary = Object.fromEntries(Object.entries(results).map(([category, rows]) => {
  const slots = rows.reduce((sum, row) => sum + row.slots, 0);
  const times = rows.filter((row) => !row.error).map((row) => row.ms).sort((a, b) => a - b);
  const exactRate = rows.reduce((sum, row) => sum + row.exact, 0) / slots;
  const equivalentRate = rows.reduce((sum, row) => sum + row.matched, 0) / slots;
  return [category, { images: rows.length, failures: rows.filter((row) => row.error).length, exact_rate: exactRate, equivalent_rate: equivalentRate, p50_ms: times[Math.floor((times.length - 1) / 2)] ?? null, p90_ms: times[Math.min(times.length - 1, Math.round((times.length - 1) * 0.9))] ?? null, cases: rows }];
}));
const report = { warning: 'Synthetic rendered input only; not a real-photo or handwriting-quality result.', model, run_at: new Date().toISOString(), results: summary };
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
