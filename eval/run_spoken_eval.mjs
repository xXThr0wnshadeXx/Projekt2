/** Run the existing 50-phrase live spoken-math fixture without Python. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseUrl = process.argv[2];
const model = process.argv[process.argv.indexOf('--model') + 1];
if (!baseUrl || !model || !baseUrl.startsWith('http')) {
  throw new Error('Usage: node eval/run_spoken_eval.mjs BASE_URL --model MODEL_ID');
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (latex) => String(latex).replace(/\\(?:left|right)\b|\s+/g, '').replace(/([_^])\{([a-z0-9])\}/gi, '$1$2');
const present = (value) => typeof value === 'string' && value.trim().length > 0;
function matches(group, fixture, result) {
  if (group === 'unambiguous') return result?.ambiguous === false && result?.valid === true && present(result.readback) && normalize(result.latex) === normalize(fixture.latex);
  const options = result?.alternatives;
  return result?.ambiguous === true && result?.latex == null && present(result.clarifying_question)
    && Array.isArray(options) && options.length >= 2 && options.length <= 3
    && options.every((option) => present(option?.latex) && present(option?.readback))
    && new Set(options.map((option) => normalize(option.latex))).size === options.length;
}
const fixtures = JSON.parse(await readFile(resolve('eval', 'spoken.json'), 'utf8'));
const results = {};
for (const group of ['unambiguous', 'ambiguous']) {
  const cases = [];
  for (const fixture of fixtures[group]) {
    const started = performance.now();
    let result, error, requestError = false;
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/spoken-to-latex`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: fixture.text, context_lines: [] }) });
        if (response.status === 429 && attempt < 2) {
          await delay((Number(response.headers.get('retry-after')) || 60) * 1000 + 250);
          continue;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        result = await response.json();
        break;
      }
    } catch (caught) { error = caught.message; requestError = true; }
    cases.push({ text: fixture.text, passed: !requestError && matches(group, fixture, result), ms: Math.round(performance.now() - started), ...(error ? { error, request_error: true } : {}) });
    await delay(3200);
  }
  const completed = cases.filter((item) => !item.request_error).map((item) => item.ms).sort((a, b) => a - b);
  const percentile = (fraction) => completed.length ? completed[Math.min(completed.length - 1, Math.round((completed.length - 1) * fraction))] : null;
  results[group] = { passed: cases.filter((item) => item.passed).length, total: cases.length, request_failures: cases.filter((item) => item.request_error).length, rate: cases.filter((item) => item.passed).length / cases.length, p50_ms: percentile(0.5), p90_ms: percentile(0.9), cases };
}
const report = { model, run_at: new Date().toISOString(), results };
await writeFile(resolve('eval', 'photos', 'spoken_live_report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
