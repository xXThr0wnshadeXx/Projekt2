import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const fixtures = path.resolve('eval/capture_fidelity');
const cases: { file: string; instructions: string; lines: string[] }[] =
  JSON.parse(fs.readFileSync(path.join(fixtures, 'expected.json'), 'utf8')).cases;

// Optionally replay the actual responses from run_capture_fidelity after its
// live run passes. CI uses the contract fixtures and makes no model calls.
const report = process.env.CAPTURE_FIDELITY_REPORT
  ? JSON.parse(fs.readFileSync(process.env.CAPTURE_FIDELITY_REPORT, 'utf8'))
  : null;

for (const fixture of cases) {
  test(`@smoke capture fidelity: ${fixture.file} starts on the equation`, async ({ page }) => {
    const observed = report?.results.find((row: { file: string }) => row.file === fixture.file);
    if (report) expect(observed?.passed, 'The live fidelity check must pass first').toBe(true);
    const captured = observed?.actual ?? {
      instructions: fixture.instructions,
      lines: fixture.lines.map((latex, i) => ({
        id: `L${i + 1}`, latex, confidence: 1, intent_notes: '', valid: true,
      })),
      diagrams: [], warnings: [],
    };
    await page.addInitScript(() => localStorage.clear());
    await page.route('**/api/health', (route) => route.fulfill({ json: { ok: true } }));
    await page.route('**/api/capture', (route) => route.fulfill({ json: captured }));
    await page.goto('/');
    await page.locator('input[type=file]').setInputFiles(path.join(fixtures, fixture.file));

    await expect(page.locator('[data-testid^="math-line-L"]')).toHaveCount(fixture.lines.length);
    await expect(page.locator('#L1')).toBeFocused();
    await expect(page.getByTestId('live-polite')).toHaveText(
      `Found ${fixture.lines.length} ${fixture.lines.length === 1 ? 'line' : 'lines'}.` +
      (fixture.instructions ? ` ${fixture.instructions}` : ''),
    );
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#L1')).not.toContainText('Solve for');
    await page.keyboard.press('r');
    await expect(page.getByTestId('live-polite')).toHaveText('Line 1. 2 x plus 3 equals 11');
  });
}
