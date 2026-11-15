// Modes: reader (default) / exam / homework / study — issues #21 and #207,
// DESIGN.md 14.
//
// What is asserted is what an instructor relies on: reader and exam modes never
// check a step (no request leaves the browser), homework only says whether a
// step checks out, study may name the operation, no mode ever says "wrong", a
// check only compares a student's own consecutive lines, and at most three
// checks are made per problem.
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

/** Type a line in the scratchpad and confirm it; `n` is its line number. */
async function saveTypedLine(page: Page, n = 1) {
  await page.getByLabel('Or type your line').fill('two x equals eight');
  await page.getByRole('button', { name: 'Add line' }).click();
  await expect(page.getByRole('button', { name: 'Save' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('group', { name: `Your line ${n}` })).toBeVisible();
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

  test('reader and scribe is the default and the badge says so', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('mode-badge')).toHaveText('Reader and scribe');
  });

  test('settings: modes are a labelled radio group, changes are announced and remembered', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    const group = page.getByRole('group', { name: 'Mode' });
    await expect(group.getByRole('radio')).toHaveCount(4);
    await expect(page.getByRole('radio', { name: /^Reader and scribe/ })).toBeChecked();
    await expect(group).toContainText('Only if your instructor allows step checks');

    await page.getByRole('radio', { name: /^Exam/ }).check();
    await expect(polite(page)).toContainText('Exam mode. No step checking at all.');
    await expect(page.getByTestId('mode-badge')).toHaveText('Exam mode');

    await page.reload();
    await expect(page.getByTestId('mode-badge')).toHaveText('Exam mode');
  });

  test('an old stored homework mode is not carried over, reading preferences are', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem('glance.settings.v1', JSON.stringify({ mode: 'homework', textScale: 150, selfVoicing: false })),
    );
    await page.goto('/');
    await expect(page.getByTestId('mode-badge')).toHaveText('Reader and scribe');
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('radio', { name: /^Reader and scribe/ })).toBeChecked();
  });

  test('reader: ten guesses in a row are never checked, announced, or sent anywhere', async ({ page }) => {
    const calls = await stubDiff(page);
    await stubSpoken(page);
    await page.goto('/');
    await openSample(page);
    // No "What changed?" button in reader and scribe mode.
    await expect(page.getByRole('button', { name: 'What changed?' })).toHaveCount(0);
    await page.keyboard.press('s');
    for (let n = 1; n <= 10; n += 1) {
      await page.getByLabel('Or type your line').fill(`x = ${n - 1}`);
      await page.getByRole('button', { name: 'Add line' }).click();
      await expect(page.getByRole('button', { name: 'Save' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('group', { name: `Your line ${n}` })).toBeVisible();
      await expect(polite(page)).toHaveText(`Saved as line ${n}.`);
    }
    await page.waitForTimeout(500);
    await expect(page.locator('body')).not.toContainText(/checks out|couldn.t confirm/i);
    await expect(polite(page)).not.toContainText(/checks out|couldn.t confirm/i);
    expect(calls).toHaveLength(0);
  });

  test('reader: W says step checking is off', async ({ page }) => {
    const calls = await stubDiff(page);
    await page.goto('/');
    await openSample(page);
    await page.keyboard.press('w');
    await expect(polite(page)).toHaveText(
      'Step checking is off. Glance reads and writes; it does not check your work.',
    );
    expect(calls).toHaveLength(0);
  });

  test('homework: the first line is never checked, the next one is checked against it', async ({ page }) => {
    await setMode(page, 'Homework');
    const calls = await stubDiff(page);
    await stubSpoken(page);
    await openSample(page);
    await page.keyboard.press('s');
    await saveTypedLine(page, 1);
    await page.waitForTimeout(500);
    // Never against a problem line: the first line has nothing before it.
    await expect(polite(page)).toHaveText('Saved as line 1.');
    expect(calls).toHaveLength(0);

    await saveTypedLine(page, 2);
    await expect(polite(page)).toHaveText('This step checks out.');
    await expect(page.getByRole('region', { name: 'Your lines' })).toContainText('This step checks out.');
    expect(calls).toEqual([{ from_latex: '2x = 8', to_latex: '2x = 8', mode: 'homework' }]);
  });

  test('homework: the first line starting from a later problem line is still not checked', async ({ page }) => {
    await setMode(page, 'Homework');
    const calls = await stubDiff(page);
    await stubSpoken(page);
    await openSample(page);
    await page.keyboard.press('n');
    await page.keyboard.press('s');
    await saveTypedLine(page);
    await page.waitForTimeout(500);
    await expect(polite(page)).toHaveText('Saved as line 1.');
    expect(calls).toHaveLength(0);
  });

  test('homework: W on the problem compares no problem lines', async ({ page }) => {
    await setMode(page, 'Homework');
    const calls = await stubDiff(page);
    await openSample(page);
    await expect(page.getByRole('button', { name: 'What changed?' })).toHaveCount(0);
    await page.keyboard.press('n');
    await page.keyboard.press('w');
    await expect(polite(page)).toHaveText(
      'Step checks compare a line of your work with your previous line. Open your work to check one.',
    );
    expect(calls).toHaveLength(0);
  });

  test('homework: at most three checks per problem, and a reload does not reset them', async ({ page }) => {
    await setMode(page, 'Homework');
    const calls = await stubDiff(page);
    await stubSpoken(page);
    await openSample(page);
    await page.keyboard.press('s');
    await saveTypedLine(page, 1);
    await saveTypedLine(page, 2);
    await expect(polite(page)).toHaveText('This step checks out.');
    await saveTypedLine(page, 3);
    await expect(polite(page)).toHaveText('This step checks out.');
    await saveTypedLine(page, 4);
    await expect(polite(page)).toHaveText('This step checks out.');
    expect(calls).toHaveLength(3);

    // A reload must not hand out fresh checks.
    await page.reload();
    await page.getByRole('button', { name: 'Back to your problem' }).click();
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
    await page.keyboard.press('s');
    await expect(page.getByRole('heading', { name: 'Your work', exact: true })).toBeFocused();
    await saveTypedLine(page, 5);
    await expect(polite(page)).toHaveText("I can't check more lines on this problem.");
    expect(calls).toHaveLength(3);
  });

  test('study: the explanation from the server is read out', async ({ page }) => {
    await setMode(page, 'Study');
    await stubDiff(page, { message: '3 was subtracted from both sides.' });
    await stubSpoken(page);
    await openSample(page);
    await page.keyboard.press('s');
    await saveTypedLine(page, 1);
    await saveTypedLine(page, 2);
    await expect(polite(page)).toHaveText('3 was subtracted from both sides.');
  });

  test('a step that is not verified is "couldn\'t confirm", never "wrong"', async ({ page }) => {
    await setMode(page, 'Homework');
    await stubDiff(page, { verified: false });
    await stubSpoken(page);
    await openSample(page);
    await page.keyboard.press('s');
    await saveTypedLine(page, 1);
    await saveTypedLine(page, 2);
    // Never "wrong" — and it says which line it was compared with, because a
    // student who cannot see the screen has no other way to know.
    await expect(polite(page)).toHaveText(
      "I couldn't confirm this step. It was compared with your line 1.",
    );
    await expect(page.getByRole('main')).not.toContainText(/wrong|incorrect|mistake/i);
  });

  test('exam: nothing is checked, and no request is even sent', async ({ page }) => {
    await setMode(page, 'Exam');
    const calls = await stubDiff(page);
    await stubSpoken(page);
    await openSample(page);

    await expect(page.getByRole('button', { name: 'What changed?' })).toHaveCount(0);
    await page.keyboard.press('w');
    await expect(polite(page)).toHaveText('Step checking is off in exam mode.');

    await page.keyboard.press('s');
    await saveTypedLine(page);
    await expect(polite(page)).toHaveText('Saved as line 1.');
    await page.waitForTimeout(500);
    await expect(polite(page)).toHaveText('Saved as line 1.');
    expect(calls).toHaveLength(0);
  });

  test('a slow check never talks over what the student did next', async ({ page }) => {
    await setMode(page, 'Homework');
    await stubDiff(page, { delayMs: 800 });
    await stubSpoken(page);
    await openSample(page);
    await page.keyboard.press('s');
    await saveTypedLine(page, 1);
    await saveTypedLine(page, 2);
    await page.getByRole('button', { name: 'Delete your line 2' }).click();
    await expect(polite(page)).toHaveText('Deleted line 2. Press U to undo.');
    await page.waitForTimeout(1200);
    await expect(polite(page)).toHaveText('Deleted line 2. Press U to undo.');
  });

  test('an unreachable checker still saves the line', async ({ page }) => {
    await setMode(page, 'Homework');
    await page.route('**/api/diff', (route) => route.abort());
    await stubSpoken(page);
    await openSample(page);
    await page.keyboard.press('s');
    await saveTypedLine(page, 1);
    await saveTypedLine(page, 2);
    await expect(polite(page)).toHaveText('Saved as line 2.');
  });
});
