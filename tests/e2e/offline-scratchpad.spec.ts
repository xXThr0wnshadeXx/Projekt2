// The scratchpad when the server can't be reached — issues #128 and #131.

import { test, expect, type Page } from '@playwright/test';

const PROBLEM = {
  instructions: 'Solve for x.',
  lines: [{ id: 'L1', latex: '3x + 3 = 12', confidence: 1, intent_notes: '', valid: true }],
  diagrams: [], warnings: [], source: 'sample',
};
const WORK = [
  { id: 'W101', latex: '3x = 9', readback: '3 x equals 9', valid: true },
  { id: 'W102', latex: 'x = 3', readback: 'x equals 3', valid: true },
  { id: 'W103', latex: 'x = 3', readback: 'x equals 3 again', valid: true },
];

async function open(page: Page, work: unknown[]) {
  await page.addInitScript(
    ([problem, lines]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('glance.problem.v1', JSON.stringify(problem));
      localStorage.setItem('glance.work.v1', JSON.stringify(lines));
    },
    [PROBLEM, work] as const,
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Back to your problem' }).click();
  await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
  await page.keyboard.press('s');
  await expect(page.getByRole('heading', { name: 'Your work', exact: true })).toBeFocused();
}

async function type(page: Page, text: string) {
  await page.getByLabel('Or type your line').fill(text);
  await page.getByRole('button', { name: 'Add line' }).click();
}

const polite = (page: Page) => page.getByTestId('live-polite');
const workLines = (page: Page) => page.getByRole('region', { name: 'Your lines' }).getByRole('listitem');

test.describe('@smoke offline commands (#128)', () => {
  // No server at all: every /api/ request fails like a dropped connection.
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', (route) => route.abort());
  });

  test('delete, undo, read and read all still work', async ({ page }) => {
    await open(page, WORK);
    await type(page, 'delete line two');
    await expect(polite(page)).toHaveText('Deleted line 2. Press U to undo.');
    await expect(workLines(page)).toHaveCount(2);

    await type(page, 'undo');
    await expect(polite(page)).toHaveText(/^Put line \d+ back\.$/);
    await expect(workLines(page)).toHaveCount(3);

    await type(page, 'read line three');
    await expect(polite(page)).toHaveText('Line 3. x equals 3 again');

    await type(page, 'read my work');
    await expect(polite(page)).toHaveText('Line 1. 3 x equals 9. Line 2. x equals 3. Line 3. x equals 3 again.');
  });

  test('hand in and help still work', async ({ page }) => {
    await open(page, WORK);
    await type(page, 'help');
    await expect(polite(page)).toContainText('Keyboard shortcuts.');
    await type(page, 'hand in my work');
    await expect(page.getByRole('heading', { name: 'Hand in your work' })).toBeFocused();
  });

  test('an unknown phrase offline says it did not catch it, and changes nothing', async ({ page }) => {
    await open(page, WORK);
    await type(page, 'read the weather');
    await expect(polite(page)).toHaveText("I didn't catch that.");
    await expect(workLines(page)).toHaveCount(3);
  });
});

test.describe('@smoke step checking unavailable (#131)', () => {
  test('said once after the first saved line, not after the second', async ({ page }) => {
    await page.route('**/api/diff', (route) => route.abort());
    let n = 0;
    await page.route('**/api/spoken-to-latex', (route) => {
      n += 1;
      const latex = n === 1 ? '3x = 9' : 'x = 3';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ latex, ambiguous: false, clarifying_question: null, alternatives: [], readback: latex, valid: true }),
      });
    });
    await open(page, []);

    await type(page, 'three x equals nine');
    await page.keyboard.press('Enter');
    await expect(polite(page)).toHaveText('Saved as line 1. Step checking is unavailable right now.');

    await type(page, 'x equals three');
    await page.keyboard.press('Enter');
    await expect(polite(page)).toHaveText('Saved as line 2.');
    await page.waitForTimeout(800); // the check fails; nothing more is said
    await expect(polite(page)).toHaveText('Saved as line 2.');
  });

  test('exam mode says nothing about checking at all', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem('glance.settings.v1', JSON.stringify({ mode: 'exam', selfVoicing: false })),
    );
    await page.route('**/api/diff', (route) => route.abort());
    await page.route('**/api/spoken-to-latex', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ latex: '3x = 9', ambiguous: false, clarifying_question: null, alternatives: [], readback: '3x = 9', valid: true }),
      }),
    );
    await open(page, []);
    await type(page, 'three x equals nine');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    await expect(polite(page)).toHaveText('Saved as line 1.');
  });
});
