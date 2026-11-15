// One look over the work before hand-in (#215). Allowed where step checks
// are, once per problem, in fixed wording. Never in exam mode.

import { expect, test, type Page } from '@playwright/test';

const PROBLEM = {
  instructions: 'Solve for x.',
  lines: [{ id: 'L1', latex: '2x+3=11', confidence: 1, intent_notes: '', valid: true }],
  diagrams: [],
  warnings: [],
  source: 'sample',
};
const WORK = [
  { id: 'W1', latex: '2x=8', readback: '2 x equals 8', valid: true },
  { id: 'W2', latex: 'x=5', readback: 'x equals 5', valid: true },
];

async function openHandIn(page: Page, mode: 'homework' | 'study' | 'exam', work = WORK) {
  await page.addInitScript(({ problem, work, mode }) => {
    localStorage.setItem('glance.problem.v1', JSON.stringify(problem));
    localStorage.setItem('glance.work.v1', JSON.stringify(work));
    localStorage.setItem('glance.settings.v1', JSON.stringify({ mode, selfVoicing: false, textScale: 125 }));
  }, { problem: PROBLEM, work, mode });
  await page.goto('/');
  // One page: with a worksheet saved, the hand-in section is already there.
  await expect(page.getByRole('heading', { name: 'Hand in your work' })).toBeVisible();
}

const polite = (page: Page) => page.getByTestId('live-polite');

test.describe('@smoke one look over the work', () => {
  test('names a line by number only, and never says wrong', async ({ page }) => {
    const requests: unknown[] = [];
    await page.route('**/api/feedback', (route) => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ json: { outcome: 'look_again', line: 2, message: 'Line 2 of your work may be worth another look.' } });
    });
    await openHandIn(page, 'homework');

    await page.getByRole('button', { name: 'Review my work' }).click();
    await expect(page.getByTestId('review-result')).toHaveText('Line 2 of your work may be worth another look.');
    await expect(polite(page)).toContainText('Line 2 of your work may be worth another look.');
    expect(requests).toEqual([{ problem_lines: ['2x+3=11'], work_lines: ['2x=8', 'x=5'], mode: 'homework' }]);

    const text = await page.locator('main').innerText();
    for (const word of ['wrong', 'incorrect', 'mistake', 'should', 'hint', 'answer']) {
      expect(text.toLowerCase()).not.toContain(word);
    }
  });

  test('one review per problem, even after a reload', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/feedback', (route) => {
      calls += 1;
      return route.fulfill({ json: { outcome: 'nothing_flagged', line: null, message: 'Nothing stood out for another look.' } });
    });
    await openHandIn(page, 'study');

    await page.getByRole('button', { name: 'Review my work' }).click();
    await expect(page.getByTestId('review-result')).toHaveText('Nothing stood out for another look.');
    const reviewed = page.getByRole('button', { name: 'Reviewed' });
    await expect(reviewed).toHaveAttribute('aria-disabled', 'true');
    // Enter, not a click: Playwright will not click an aria-disabled control,
    // and on CI's Linux WebKit a control below the fold cannot be scrolled to.
    await reviewed.press('Enter');
    await expect(polite(page)).toContainText("I can't review this problem again.");

    await page.reload();
    await page.getByRole('button', { name: 'Reviewed' }).press('Enter');
    await expect(polite(page)).toContainText("I can't review this problem again.");
    expect(calls).toBe(1);
  });

  test('a failed review is spent, and is not a verdict', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/feedback', (route) => {
      calls += 1;
      return route.fulfill({ status: 502, json: { error: { code: 'MODEL_ERROR', message: "I couldn't review your work right now. Nothing was checked." } } });
    });
    await openHandIn(page, 'homework');
    await page.getByRole('button', { name: 'Review my work' }).click();
    await expect(page.getByTestId('review-result')).toHaveText("I couldn't review your work right now. Nothing was checked.");
    await page.getByRole('button', { name: 'Reviewed' }).press('Enter');
    await expect(polite(page)).toContainText("I can't review this problem again.");
    expect(calls).toBe(1);
  });

  test('in exam mode nothing is shown, said or sent', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/feedback', (route) => { calls += 1; return route.abort(); });
    await openHandIn(page, 'exam');
    await expect(page.getByRole('button', { name: /review/i })).toHaveCount(0);
    expect(await page.locator('main').innerText()).not.toMatch(/review/i);
    expect(calls).toBe(0);
  });

  test('with no work there is nothing to review', async ({ page }) => {
    await openHandIn(page, 'homework', []);
    await expect(page.getByRole('button', { name: /review/i })).toHaveCount(0);
  });
});
