import { expect, test } from '@playwright/test';

test('final hand-in can request live AI review or a feedback-only hint', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('glance.problem.v1', JSON.stringify({
      instructions: 'Solve for x.', lines: [{ id: 'L1', latex: '2x+3=11', confidence: 1, intent_notes: '', valid: true }], diagrams: [], warnings: [], source: 'sample',
    }));
    localStorage.setItem('glance.work.v1', JSON.stringify([{ id: 'W1', latex: '2x=8', readback: '2 x equals 8', valid: true }]));
  });
  await page.route('**/api/feedback', (route) => route.fulfill({ json: { outcome: 'needs_review', message: 'Review the grouping in your submitted work.' } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Back to your problem' }).click();
  await page.keyboard.press('x');
  await page.getByRole('button', { name: 'Check accuracy with AI' }).click();
  await expect(page.getByLabel('AI feedback result')).toHaveText('Review the grouping in your submitted work.');
  await page.getByRole('button', { name: 'Get a feedback-only hint' }).click();
  await expect(page.getByLabel('AI feedback result')).toBeVisible();
});
