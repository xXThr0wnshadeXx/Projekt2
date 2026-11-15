import { test, expect, type Page } from '@playwright/test';
import { sampleProblem, type WorkLine } from '../../frontend/src/state';

const restored = (count: number) =>
  `Glance. I restored your work from earlier: ${count} ${count === 1 ? 'line' : 'lines'}. Use the Down arrow to move through the page and Space to press or hear what you are on.`;
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
    // Your work is on the page from the start, so it fails on arrival.
    await page.goto('/?crash=work');

    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Screen unavailable' })).toBeFocused();
    await expect(main).toContainText(recovery);
    await expect(assertive(page)).toHaveText(recovery);
    await expect(page.getByRole('heading', { name: 'Glance', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main');
    // Only that part failed: the worksheet is still on the page, and there is still one main landmark.
    await expect(page.getByRole('heading', { name: 'Your worksheet' })).toBeVisible();
    await expect(page.getByRole('main')).toHaveCount(1);
    expect(errors.filter((message) => message.includes('work'))).toEqual(['TypeError work']);
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
    await page.getByRole('button', { name: 'Low-vision mode' }).click();

    await expect(page.getByRole('heading', { name: 'Glance', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Screen unavailable' })).toBeFocused();
    await page.getByRole('button', { name: 'Back to the start' }).click();
    await expect(page.getByRole('heading', { name: 'Your worksheet' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Low-vision mode' })).toBeVisible();
  });

  test('announces two restored work lines once at startup', async ({ page }) => {
    await seed(page, problem, work);
    await page.goto('/');
    await expect(polite(page)).toHaveText(restored(2));
    // Moving around the page says what is there, not the greeting again.
    await page.getByText('More settings').click();
    await page.getByRole('radio', { name: /^Study/ }).check();
    await expect(polite(page)).toContainText('Study mode');
    await expect(polite(page)).not.toContainText('I restored your work');
  });

  test('announces one restored problem line with the singular', async ({ page }) => {
    await seed(page, { ...problem, lines: [problem.lines[0]] });
    await page.goto('/');
    await expect(polite(page)).toHaveText(restored(1));
  });

  test('does not announce restoration in a fresh session', async ({ page }) => {
    await page.goto('/');
    await expect(polite(page)).toContainText('Glance. It reads your maths worksheet aloud');
    await expect(polite(page)).not.toContainText('I restored your work');
  });
});
