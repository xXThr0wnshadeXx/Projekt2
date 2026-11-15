import { test, expect, type Page } from '@playwright/test';
import { sampleProblem, type WorkLine } from '../../frontend/src/state';

const restored = (count: number) =>
  `I restored your work from earlier: ${count} ${count === 1 ? 'line' : 'lines'}.`;
const recovery = 'Something went wrong on this screen. Your work is saved.';
const assertive = (page: Page) => page.getByTestId('live-assertive');
const polite = (page: Page) => page.getByTestId('live-polite');

const problem = sampleProblem();
const work: WorkLine[] = [
  { id: 'W1', latex: '2x = 8', valid: true, readback: '2 x equals 8' },
  { id: 'W2', latex: 'x = 4', valid: true, readback: 'x equals 4' },
];

async function seed(page: Page, savedProblem: typeof problem | null, savedWork: WorkLine[] = []) {
  await page.addInitScript(({ savedProblem, savedWork }) => {
    if (savedProblem) localStorage.setItem('glance.problem.v1', JSON.stringify(savedProblem));
    if (savedWork.length) localStorage.setItem('glance.work.v1', JSON.stringify(savedWork));
  }, { savedProblem, savedWork });
}

test.describe('@smoke screen recovery', () => {
  test('a screen crash preserves work and offers a focused way to restart', async ({ page }) => {
    await seed(page, problem, work);
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('/?crash=scratchpad');
    await page.getByRole('button', { name: 'Back to your problem' }).click();
    await page.getByRole('button', { name: 'Start working' }).click();

    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Screen unavailable' })).toBeFocused();
    await expect(main).toContainText(recovery);
    await expect(assertive(page)).toHaveText(recovery);
    await expect(page.getByRole('heading', { name: 'Glance', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main');
    expect(errors.filter((message) => message.includes('scratchpad'))).toEqual(['TypeError scratchpad']);
    expect(errors.join('\n')).not.toContain('Synthetic screen failure');
    expect(await page.evaluate(() => [
      JSON.parse(localStorage.getItem('glance.problem.v1')!),
      JSON.parse(localStorage.getItem('glance.work.v1')!),
    ])).toEqual([problem, work]);

    await main.getByRole('button', { name: 'Start this screen again' }).click();
    await expect(main.getByRole('heading', { name: 'Your work', exact: true })).toBeFocused();
    await expect(page.getByTestId('math-line-W1')).toBeVisible();
    await expect(page.getByTestId('math-line-W2')).toBeVisible();
    await expect(assertive(page)).toHaveText('');
  });

  test('back to the start leaves the problem available', async ({ page }) => {
    await seed(page, problem);
    await page.goto('/?crash=lowvision');
    await page.getByRole('button', { name: 'Back to your problem' }).click();
    await page.getByRole('button', { name: 'Low-vision mode' }).click();

    await expect(page.getByRole('heading', { name: 'Glance', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Screen unavailable' })).toBeFocused();
    await page.getByRole('button', { name: 'Back to the start' }).click();
    await expect(page.getByRole('button', { name: 'Back to your problem' })).toBeVisible();
  });

  test('announces two restored work lines once at startup', async ({ page }) => {
    await seed(page, problem, work);
    await page.goto('/');
    await expect(polite(page)).toHaveText(restored(2));
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Back to the start', exact: true }).click();
    await expect(polite(page)).toContainText('Capture a problem');
    await expect(polite(page)).not.toContainText('I restored your work');
  });

  test('announces one restored work line with the singular', async ({ page }) => {
    await seed(page, problem, [work[0]]);
    await page.goto('/');
    await expect(polite(page)).toHaveText(restored(1));
  });

  test('a reload on Home with a problem but no work announces the problem, not a line count', async ({ page }) => {
    await seed(page, problem);
    await page.goto('/');
    await expect(polite(page)).toHaveText('I restored your problem from earlier.');
  });

  test('does not announce restoration in a fresh session', async ({ page }) => {
    await page.goto('/');
    await expect(polite(page)).toContainText('Capture a problem');
    await expect(polite(page)).not.toContainText('I restored your work');
  });
});
