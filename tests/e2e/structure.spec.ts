import { expect, test } from '@playwright/test';

const cases = [
  { latex: '2x + 3 = 11', summary: 'This is an equation, with a left side and a right side.' },
  { latex: '2x + 3 < 11', summary: 'This is an inequality, with a left side and a right side.' },
  { latex: String.raw`\frac{x = 1}{2}`, summary: 'This is an expression.' },
];

for (const { latex, summary } of cases) {
  test(`@smoke Glance identifies the outer structure of ${latex}`, async ({ page }) => {
    await page.addInitScript((line) => {
      localStorage.setItem('glance.problem.v1', JSON.stringify({
        instructions: '', source: 'upload', diagrams: [], warnings: [],
        lines: [{ id: 'L1', latex: line, confidence: 1, intent_notes: '', valid: true }],
      }));
    }, latex);
    await page.goto('/');
    await page.getByRole('button', { name: 'Back to your problem' }).click();
    await page.locator('#L1').press('g');
    await expect(page.getByRole('region', { name: 'Structure summary' })).toContainText(summary, { timeout: 15000 });
    await expect(page.getByTestId('live-polite')).toContainText(summary);
  });
}
