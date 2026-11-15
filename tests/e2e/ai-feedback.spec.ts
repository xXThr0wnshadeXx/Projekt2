import { expect, test, type Page } from '@playwright/test';

async function seed(page: Page, mode: string) {
  await page.addInitScript((m) => {
    localStorage.setItem('glance.settings.v2', JSON.stringify({ mode: m, selfVoicing: false }));
    localStorage.setItem('glance.problem.v1', JSON.stringify({
      instructions: 'Solve for x.', lines: [{ id: 'L1', latex: '2x+3=11', confidence: 1, intent_notes: '', valid: true }], diagrams: [], warnings: [], source: 'sample',
    }));
    localStorage.setItem('glance.work.v1', JSON.stringify([{ id: 'W1', latex: '2x=8', readback: '2 x equals 8', valid: true }]));
  }, mode);
  await page.goto('/');
  await page.getByRole('button', { name: 'Back to your problem' }).click();
  await page.keyboard.press('x');
}

test('reader mode (the default) has no AI feedback on the hand-in screen', async ({ page }) => {
  let called = false;
  await page.route('**/api/feedback', (route) => { called = true; return route.abort(); });
  await seed(page, 'reader');
  await expect(page.getByRole('heading', { name: 'AI feedback' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Check accuracy with AI' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Get a feedback-only hint' })).toHaveCount(0);
  expect(called).toBe(false);
});

test('homework mode offers one AI review and refuses a second', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/feedback', (route) => {
    calls += 1;
    return route.fulfill({ json: { outcome: 'needs_review', message: 'Look again at the grouping in your work.' } });
  });
  await seed(page, 'homework');
  const review = page.getByRole('button', { name: 'Check accuracy with AI' });
  await review.click();
  await expect(page.getByLabel('AI feedback result')).toHaveText('Look again at the grouping in your work.');
  await review.click();
  await expect(page.getByLabel('AI feedback result')).toHaveText("I can't review this problem again.");
  expect(calls).toBe(1);

  await page.reload();
  await page.getByRole('button', { name: 'Back to your problem' }).click();
  await page.keyboard.press('x');
  await page.getByRole('button', { name: 'Check accuracy with AI' }).click();
  await expect(page.getByLabel('AI feedback result')).toHaveText("I can't review this problem again.");
  expect(calls).toBe(1);
});
