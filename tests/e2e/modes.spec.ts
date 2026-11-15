// Modes: study / homework / exam — issue #21, DESIGN.md 14.
//
// What is asserted is what an instructor relies on: exam mode never checks a
// step (no request leaves the browser), homework only says whether a step
// checks out, study may name the operation, and no mode ever says "wrong".
// The step check itself is SymPy's job and is covered by the back-end tests;
// here /api/diff is stubbed so the front end's behaviour is what is tested.

import { test, expect, type Page } from '@playwright/test';

const SPOKEN_CLEAR = {
  latex: '2x = 8',
  ambiguous: false,
  clarifying_question: null,
  alternatives: [],
  readback: '2 x equals 8',
  valid: true,
};

interface DiffStub {
  verified?: boolean;
  message?: string;
  delayMs?: number;
}

/** Stub /api/diff and record every request that reaches it. */
async function stubDiff(page: Page, stub: DiffStub = {}) {
  const calls: { from_latex: string; to_latex: string; mode: string }[] = [];
  await page.route('**/api/diff', async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    if (stub.delayMs) await new Promise((r) => setTimeout(r, stub.delayMs));
    const verified = stub.verified ?? true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        verified,
        method: verified ? 'ratio_constant' : 'not_verified',
        message: stub.message ?? (verified ? 'This step checks out.' : "I couldn't confirm this step."),
      }),
    });
  });
  return calls;
}

async function stubSpoken(page: Page) {
  await page.route('**/api/spoken-to-latex', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SPOKEN_CLEAR) }),
  );
}

async function setMode(page: Page, mode: 'Study' | 'Homework' | 'Exam') {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeFocused();
  await page.getByRole('radio', { name: new RegExp(`^${mode}`) }).check();
  await expect(page.getByTestId('mode-badge')).toHaveText(`${mode} mode`);
  await page.getByRole('button', { name: 'Back to the start' }).click();
}

async function openSample(page: Page) {
  await page.getByRole('button', { name: 'Try a sample problem' }).click();
  await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
}

/** Type a line in the scratchpad and confirm it. */
async function saveTypedLine(page: Page) {
  await page.getByLabel('Or type your line').fill('two x equals eight');
  await page.getByRole('button', { name: 'Add line' }).click();
  await expect(page.getByRole('button', { name: 'Save' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('group', { name: 'Your line 1' })).toBeVisible();
}

const polite = (page: Page) => page.getByTestId('live-polite');

test.describe('@smoke modes', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('modes-test-started')) {
        sessionStorage.setItem('modes-test-started', '1');
        localStorage.clear();
      }
    });
  });

  test('homework is the default and the badge says so', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('mode-badge')).toHaveText('Homework mode');
  });

  test('settings: modes are a labelled radio group, changes are announced and remembered', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    const group = page.getByRole('group', { name: 'Mode' });
    await expect(group.getByRole('radio')).toHaveCount(3);
    await expect(page.getByRole('radio', { name: /^Homework/ })).toBeChecked();

    await page.getByRole('radio', { name: /^Exam/ }).check();
    await expect(polite(page)).toContainText('Exam mode. No step checking at all.');
    await expect(page.getByTestId('mode-badge')).toHaveText('Exam mode');

    await page.reload();
    await expect(page.getByTestId('mode-badge')).toHaveText('Exam mode');
  });

  test('homework: a saved step is checked against the problem line and only told checks out', async ({ page }) => {
    const calls = await stubDiff(page);
    await stubSpoken(page);
    await page.goto('/');
    await openSample(page);
    await page.keyboard.press('s');
    await saveTypedLine(page);

    await expect(polite(page)).toHaveText('This step checks out.');
    await expect(page.getByRole('region', { name: 'Your lines' })).toContainText('This step checks out.');
    expect(calls).toEqual([{ from_latex: '2x + 3 = 11', to_latex: '2x = 8', mode: 'homework' }]);
  });

  test('study: the explanation from the server is read out', async ({ page }) => {
    await setMode(page, 'Study');
    await stubDiff(page, { message: '3 was subtracted from both sides.' });
    await stubSpoken(page);
    await openSample(page);
    await page.keyboard.press('s');
    await saveTypedLine(page);
    await expect(polite(page)).toHaveText('3 was subtracted from both sides.');
  });

  test('a step that is not verified is "couldn\'t confirm", never "wrong"', async ({ page }) => {
    await stubDiff(page, { verified: false });
    await stubSpoken(page);
    await page.goto('/');
    await openSample(page);
    await page.keyboard.press('s');
    await saveTypedLine(page);
    await expect(polite(page)).toHaveText("I couldn't confirm this step.");
    await expect(page.locator('main')).not.toContainText(/wrong/i);
  });

  test('exam: nothing is checked, and no request is even sent', async ({ page }) => {
    await setMode(page, 'Exam');
    const calls = await stubDiff(page);
    await stubSpoken(page);
    await openSample(page);

    await expect(page.getByRole('button', { name: 'What changed?' })).toHaveCount(0);
    await page.keyboard.press('w');
    await expect(polite(page)).toHaveText('What changed is off in exam mode.');

    await page.keyboard.press('s');
    await saveTypedLine(page);
    await expect(polite(page)).toHaveText('Saved as line 1.');
    await page.waitForTimeout(500);
    await expect(polite(page)).toHaveText('Saved as line 1.');
    expect(calls).toHaveLength(0);
  });

  test('what changed: W compares the current problem line with the one before', async ({ page }) => {
    const calls = await stubDiff(page, { verified: false });
    await page.goto('/');
    await openSample(page);

    await page.keyboard.press('w');
    await expect(polite(page)).toHaveText('This is the first line, so there is nothing before it to compare.');

    await page.keyboard.press('n');
    await page.getByRole('button', { name: 'What changed?' }).click();
    await expect(polite(page)).toHaveText("I couldn't confirm this step.");
    expect(calls).toEqual([
      { from_latex: '2x + 3 = 11', to_latex: '\\frac{\\sqrt{x + 1}}{2} = 5', mode: 'homework' },
    ]);
  });

  test('the first step follows the problem line the student started from', async ({ page }) => {
    const calls = await stubDiff(page);
    await stubSpoken(page);
    await page.goto('/');
    await openSample(page);
    await page.keyboard.press('n');
    await page.keyboard.press('s');
    await saveTypedLine(page);
    await expect(polite(page)).toHaveText('This step checks out.');
    expect(calls[0].from_latex).toBe('\\frac{\\sqrt{x + 1}}{2} = 5');
  });

  test('a slow check never talks over what the student did next', async ({ page }) => {
    await stubDiff(page, { delayMs: 800 });
    await stubSpoken(page);
    await page.goto('/');
    await openSample(page);
    await page.keyboard.press('s');
    await saveTypedLine(page);
    await page.getByRole('button', { name: 'Delete your line 1' }).click();
    await expect(polite(page)).toHaveText('Deleted line 1. Press U to undo.');
    await page.waitForTimeout(1200);
    await expect(polite(page)).toHaveText('Deleted line 1. Press U to undo.');
  });

  test('an unreachable checker still saves the line', async ({ page }) => {
    await page.route('**/api/diff', (route) => route.abort());
    await stubSpoken(page);
    await page.goto('/');
    await openSample(page);
    await page.keyboard.press('s');
    await saveTypedLine(page);
    await expect(polite(page)).toHaveText('Saved as line 1.');
  });
});
