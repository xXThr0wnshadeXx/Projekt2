// Export: PDF + accessible HTML — issue #22.
//
// Acceptance: the HTML passes axe with no critical issues. Beyond that, what is
// asserted is what makes it a usable hand-in: real MathML a screen reader can
// read, the student's own numbered lines, and nothing that could run code or
// phone home when an instructor opens it.

import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PROBLEM = {
  instructions: 'Solve for x.',
  lines: [{ id: 'L1', latex: '2x + 3 = 11', confidence: 1, intent_notes: '', valid: true }],
  diagrams: [],
  warnings: [],
  source: 'sample',
};

const WORK = [
  { id: 'W1', latex: '2x = 8', readback: '2 x equals 8', valid: true },
  { id: 'W2', latex: 'x = 4', readback: 'x equals 4', valid: true },
];

/** Start with a saved problem and saved work, as after a reload. */
async function seed(page: Page, work: unknown[] = WORK) {
  await page.addInitScript(
    ([problem, lines]) => {
      localStorage.setItem('glance.problem.v1', JSON.stringify(problem));
      localStorage.setItem('glance.work.v1', JSON.stringify(lines));
    },
    [PROBLEM, work] as const,
  );
}

async function openExport(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Back to your problem' }).click();
  await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
  await page.keyboard.press('x');
  await expect(page.getByRole('heading', { name: 'Hand in your work' })).toBeFocused();
}

async function downloadHtml(page: Page): Promise<string> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download accessible HTML' }).click();
  const file = await download;
  return readFileSync((await file.path())!, 'utf8');
}

test.describe('@smoke export date', () => {
  // Pinned, so the result is the same on a laptop and on CI (which runs in UTC).
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('the filename uses the student\'s local date, like the file itself', async ({ page }) => {
    // 10 pm on 14 November in Los Angeles is already the 15th in UTC.
    await page.clock.setFixedTime(new Date('2026-11-14T22:00:00-08:00'));
    await seed(page);
    await openExport(page);
    await downloadHtml(page);
    await expect(page.getByTestId('live-polite')).toContainText('math-work-2026-11-14.html');
  });

});

test.describe('@smoke export', () => {
  test('X opens the hand-in, announced with the number of lines', async ({ page }) => {
    await seed(page);
    await openExport(page);
    await expect(page.getByTestId('live-polite')).toContainText('2 lines of your work');
    const preview = page.getByRole('region', { name: 'Math work' });
    await expect(preview.getByRole('group', { name: 'My line 1' })).toBeVisible();
    await expect(preview.getByRole('group', { name: 'My line 2' })).toBeVisible();
  });

  test('the HTML file is a real accessible document with MathML', async ({ page }) => {
    await seed(page);
    await openExport(page);
    await page.getByLabel(/Your name/).fill('Sam Example');
    const html = await downloadHtml(page);

    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<title>Math work — Sam Example</title>');
    expect(html).toContain('<h1>Math work — Sam Example</h1>');
    expect(html).toContain('<h2>My work</h2>');
    // One <math> per line: 1 problem line + 2 work lines.
    expect(html.match(/<math /g)).toHaveLength(3);
    expect(html).toContain('alttext="2 x equals 8"');
    // Clean MathML: no MathJax internals, no scripts, no network.
    expect(html).not.toContain('data-semantic');
    // The MathML namespace is an identifier, not a request; any other URL fails.
    const withoutNamespace = html.replaceAll('xmlns="http://www.w3.org/1998/Math/MathML"', '');
    expect(withoutNamespace).not.toMatch(/<script|https?:\/\//i);
    await expect(page.getByTestId('live-polite')).toContainText(/Downloaded math-work-sam-example-\d{4}-\d{2}-\d{2}\.html/);
  });

  test('the exported file has no axe critical or serious violations', async ({ page }) => {
    await seed(page);
    await openExport(page);
    const html = await downloadHtml(page);

    await page.setContent(html);
    const results = await new AxeBuilder({ page }).analyze();
    const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(bad.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('LaTeX links and anything that could run code are stripped', async ({ page }) => {
    await seed(page, [
      { id: 'W1', latex: '\\href{javascript:alert(1)}{x} = 1', readback: 'x equals 1', valid: true },
    ]);
    await openExport(page);
    const html = await downloadHtml(page);
    expect(html).not.toMatch(/javascript:|href=|onclick/i);
    expect(html).toContain('<math');
  });

  test('a line that could not be checked is kept and marked, never dropped', async ({ page }) => {
    await seed(page, [{ id: 'W1', latex: 'x \\to 2', readback: 'x goes to 2', valid: false }]);
    await openExport(page);
    const html = await downloadHtml(page);
    expect(html).toContain('(could not be checked)');
    expect(html.match(/<math /g)).toHaveLength(2);
  });

  test('with no work yet, the file still says so plainly', async ({ page }) => {
    await seed(page, []);
    await openExport(page);
    await expect(page.getByTestId('live-polite')).toContainText('0 lines of your work');
    const html = await downloadHtml(page);
    expect(html).toContain('No lines written yet.');
  });

  test('print opens the print dialog and prints only the hand-in', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { printed: number }).printed = 0;
      window.print = () => {
        (window as unknown as { printed: number }).printed += 1;
      };
    });
    await seed(page);
    await openExport(page);
    await page.getByRole('button', { name: 'Print or save as PDF' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
    await expect(page.getByTestId('live-polite')).toContainText('Save as PDF');

    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('heading', { name: 'Glance', level: 1 })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Download accessible HTML' })).toBeHidden();
    await expect(page.locator('#export-preview')).toBeVisible();
  });

  test('the scratchpad has a Hand in button', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Back to your problem' }).click();
    await page.keyboard.press('s');
    await page.getByRole('button', { name: 'Hand in my work' }).click();
    await expect(page.getByRole('heading', { name: 'Hand in your work' })).toBeFocused();
  });
});
