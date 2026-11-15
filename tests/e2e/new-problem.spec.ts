// A new problem starts clean, a reload returns to the same place, and Back
// moves between Glance's screens — issue #208.
//
// The model endpoints are stubbed: what is under test is what the app does
// with saved work and with the screen the student was on, not any maths.

import { test, expect, type Page } from '@playwright/test';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const SECOND = {
  instructions: 'Solve for y.',
  lines: [{ id: 'L1', latex: '5y = 20', confidence: 1, intent_notes: '', valid: true }],
  diagrams: [],
  warnings: [],
};

function spoken(latex: string, readback: string) {
  return { latex, ambiguous: false, clarifying_question: null, alternatives: [], readback, valid: true };
}

test.beforeEach(async ({ page }) => {
  // Cleared once per test, not on reload: a reload must keep what was saved.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.clear();
      sessionStorage.setItem('seeded', '1');
    }
  });
  await page.route('**/api/health', (route) => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/diff', (route) => route.abort());
  await page.route('**/api/capture', (route) => route.fulfill({ json: SECOND }));
  let n = 0;
  await page.route('**/api/spoken-to-latex', (route) => {
    n += 1;
    return route.fulfill({
      json: n === 1 ? spoken('2x = 8', '2 x equals 8') : spoken('y = 4', 'y equals 4'),
    });
  });
});

async function openSampleAndWrite(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample problem' }).click();
  await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Start working' }).click();
  await expect(page.getByRole('heading', { name: 'Your work', exact: true })).toBeFocused();
  await writeLine(page, 'two x equals eight', 1);
}

async function writeLine(page: Page, text: string, number: number) {
  await page.getByLabel('Or type your line').fill(text);
  await page.getByRole('button', { name: 'Add line' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('group', { name: `Your line ${number}` })).toBeVisible();
}

/** From the scratchpad back to the problem, then capture the second one. */
async function captureSecond(page: Page) {
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Your problem', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Capture another problem' }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'problem.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
}

test.describe('@smoke new problem starts clean', () => {
  test('Start fresh: the hand-in holds only the second problem\'s work', async ({ page }) => {
    await openSampleAndWrite(page);
    await captureSecond(page);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('You have 1 line of work on the last problem');
    await expect(page.getByTestId('live-assertive')).toContainText('Keep them, or start fresh?');
    await expect(page.getByRole('button', { name: 'Start fresh' })).toBeFocused();
    await page.getByRole('button', { name: 'Start fresh' }).click();

    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Start working' }).click();
    await expect(page.getByRole('region', { name: 'Your lines' })).toContainText('Nothing yet');
    await writeLine(page, 'y equals four', 1);

    await page.getByRole('button', { name: 'Hand in my work' }).click();
    const preview = page.getByRole('region', { name: 'Math work' });
    await expect(preview.getByRole('group', { name: 'My line 1' })).toBeVisible();
    await expect(preview.getByRole('group', { name: 'My line 2' })).toHaveCount(0);
    await expect(preview).not.toContainText('2 x equals 8');
  });

  test('Keep my work: the earlier lines stay', async ({ page }) => {
    await openSampleAndWrite(page);
    await captureSecond(page);

    await page.getByRole('button', { name: 'Keep my work' }).click();
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Start working' }).click();
    await expect(page.getByRole('group', { name: 'Your line 1' })).toBeVisible();
  });

  test('with no saved work a new problem just opens', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Capture a problem', exact: true }).click();
    await page.locator('input[type=file]').setInputFiles({
      name: 'problem.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await expect(page.getByRole('heading', { name: 'Your problem', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('@smoke place and Back', () => {
  test('a reload mid-scratchpad lands on the same screen and comparison line', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Try a sample problem' }).click();
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
    // Work from the second line of the problem.
    await page.keyboard.press('n');
    await page.getByRole('button', { name: 'Start working' }).click();
    await expect(page.getByRole('heading', { name: 'Your work', exact: true })).toBeFocused();
    await expect(page.getByTestId('live-polite')).toContainText('Following line 2 of the problem');
    await writeLine(page, 'two x equals eight', 1);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your work', exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Your line 1' })).toBeVisible();
    await expect(page.getByTestId('live-polite')).toContainText('Back on your work. Line 2.');
    await expect(page.getByText('Following line 2 of the problem.').first()).toBeVisible();
  });

  test('Back from the scratchpad returns to the problem, not off the site', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Try a sample problem' }).click();
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Start working' }).click();
    await expect(page.getByRole('heading', { name: 'Your work', exact: true })).toBeFocused();
    expect(new URL(page.url()).hash).toBe('#scratchpad');

    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Your problem', exact: true })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/');
  });
});
