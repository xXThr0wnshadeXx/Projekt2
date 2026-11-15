// Scratchpad, readback and the clarify dialog — issues #16, #18, #19.
//
// The model endpoints are stubbed here on purpose. What is being tested is the
// front end's behaviour around an answer, not the model's answer: that nothing
// is saved before the student confirms it, that an ambiguous reading asks
// instead of guessing, and that the dialog is operable by keyboard alone.
// Model quality is measured by the eval runners (#29, #30), not here.

import { test, expect, type Page } from '@playwright/test';

/** The response shape of POST /api/spoken-to-latex — DESIGN.md 9. */
const CLEAR = {
  latex: '2x = 8',
  ambiguous: false,
  clarifying_question: null,
  alternatives: [],
  readback: '2 x equals 8',
  valid: true,
};

const AMBIGUOUS = {
  latex: null,
  ambiguous: true,
  clarifying_question: 'Did you mean x plus one, all over two, or x plus one half?',
  alternatives: [
    { latex: '\\frac{x+1}{2}', readback: 'x plus one, all over two', valid: true },
    { latex: 'x + \\frac{1}{2}', readback: 'x plus one half', valid: true },
  ],
  readback: null,
  valid: false,
};

/** The case from #79: one option is offered but SymPy could not read it. */
const AMBIGUOUS_ONE_UNCHECKED = {
  ...AMBIGUOUS,
  alternatives: [
    { latex: '\\frac{x+1}{2}', readback: 'x plus one, all over two', valid: true },
    { latex: 'x \\to 2', readback: 'x goes to two', valid: false },
  ],
};

// The step check (#21) runs after every save. These tests are about the
// scratchpad, not the checker, so it is made unreachable here: that is the
// same as running with no back end, and keeps the announcements exact on a
// machine that happens to have one running. tests/e2e/modes.spec.ts covers it.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/diff', (route) => route.abort());
});

async function stubSpoken(page: Page, body: unknown) {
  await page.route('**/api/spoken-to-latex', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

/** Open the sample problem and go to the scratchpad. */
async function openScratchpad(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample problem' }).click();
  await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Start working' }).click();
  await expect(page.getByRole('heading', { name: 'Your work', exact: true })).toBeFocused();
}

test.describe('@smoke scratchpad', () => {
  test.beforeEach(async ({ page }) => {
    // Each test starts with an empty scratchpad, not one left by the last.
    await page.addInitScript(() => window.localStorage.clear());
  });

  test('S opens the scratchpad from the problem', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Try a sample problem' }).click();
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });

    await page.keyboard.press('s');
    await expect(page.getByRole('heading', { name: 'Your work', exact: true })).toBeVisible();
  });

  test('a typed line is read back and only saved once confirmed', async ({ page }) => {
    await stubSpoken(page, CLEAR);
    await openScratchpad(page);

    await page.getByLabel('Or type your line').fill('two x equals eight');
    await page.getByRole('button', { name: 'Add line' }).click();

    // Read back first. Nothing is in the student's work yet.
    const readback = page.getByRole('region', { name: 'Confirm your line' });
    await expect(readback).toBeVisible();
    await expect(readback).toContainText('2 x equals 8');
    await expect(page.getByRole('region', { name: 'Your lines' })).toContainText('Nothing yet');

    // Focus is on Save, so Enter confirms without hunting for anything.
    await expect(page.getByRole('button', { name: 'Save' })).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('live-polite')).toHaveText('Saved as line 1.');
    await expect(page.getByRole('group', { name: 'Your line 1' })).toBeVisible();
    await expect(readback).toBeHidden();
  });

  test('discarding a readback saves nothing', async ({ page }) => {
    await stubSpoken(page, CLEAR);
    await openScratchpad(page);

    await page.getByLabel('Or type your line').fill('two x equals eight');
    await page.getByRole('button', { name: 'Add line' }).click();
    await expect(page.getByRole('region', { name: 'Confirm your line' })).toBeVisible();

    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByTestId('live-polite')).toHaveText('Discarded.');
    await expect(page.getByRole('region', { name: 'Your lines' })).toContainText('Nothing yet');
  });

  test('an ambiguous line asks instead of guessing', async ({ page }) => {
    await stubSpoken(page, AMBIGUOUS);
    await openScratchpad(page);

    await page.getByLabel('Or type your line').fill('x plus one over two');
    await page.getByRole('button', { name: 'Add line' }).click();

    // The demo's wow moment: it asks, and says so out loud.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Did you mean');
    await expect(page.getByTestId('live-assertive')).toContainText('Did you mean');

    // Nothing was saved while the question is open.
    await expect(page.getByRole('region', { name: 'Your lines' })).toContainText('Nothing yet');

    // The first option has focus, so a screen reader reads the question then
    // lands on a choice.
    await expect(page.getByRole('button', { name: /x plus one, all over two/ })).toBeFocused();
  });

  test('the clarify dialog is operable by number keys and traps focus', async ({ page }) => {
    await stubSpoken(page, AMBIGUOUS);
    await openScratchpad(page);

    await page.getByLabel('Or type your line').fill('x plus one over two');
    await page.getByRole('button', { name: 'Add line' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Tab must not walk out of the dialog into the page behind it.
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('Tab');
    await expect(page.getByRole('dialog')).toContainText('Did you mean');
    const insideDialog = await page.evaluate(
      () => !!document.activeElement?.closest('[role="dialog"]'),
    );
    expect(insideDialog).toBe(true);

    // 2 picks the second grouping.
    await page.keyboard.press('2');
    await expect(page.getByRole('dialog')).toBeHidden();

    const readback = page.getByRole('region', { name: 'Confirm your line' });
    await expect(readback).toBeVisible();
    await expect(readback).toContainText('x plus one half');
  });

  test('an option the parser could not read is still offered, and flagged', async ({ page }) => {
    // #79: requiring every alternative to parse used to throw the whole
    // question away. The student knows what they said, so the option stays —
    // but it says plainly that it was not checked, and saving it keeps that.
    await stubSpoken(page, AMBIGUOUS_ONE_UNCHECKED);
    await openScratchpad(page);

    await page.getByLabel('Or type your line').fill('x plus one over two');
    await page.getByRole('button', { name: 'Add line' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('x goes to two');
    await expect(dialog).toContainText('I could not check this one');

    await page.keyboard.press('2');
    const readback = page.getByRole('region', { name: 'Confirm your line' });
    await expect(readback).toContainText('x goes to two');
    await expect(readback).toContainText('I could not check this line');

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('live-polite')).toHaveText(
      'Saved as line 1. I could not check it.',
    );
  });

  test('Escape cancels the question without saving', async ({ page }) => {
    await stubSpoken(page, AMBIGUOUS);
    await openScratchpad(page);

    await page.getByLabel('Or type your line').fill('x plus one over two');
    await page.getByRole('button', { name: 'Add line' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('region', { name: 'Your lines' })).toContainText('Nothing yet');
  });

  test('the question still answers its keys when focus is not inside it', async ({ page }) => {
    // #153: WebKit sometimes leaves focus behind the dialog, and a screen
    // reader's cursor can be elsewhere too. Escape and 1 to 3 must still work.
    await stubSpoken(page, AMBIGUOUS);
    await openScratchpad(page);

    const typing = page.getByLabel('Or type your line');
    await typing.fill('x plus one over two');
    await page.getByRole('button', { name: 'Add line' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('region', { name: 'Your lines' })).toContainText('Nothing yet');

    await typing.fill('x plus one over two');
    await page.getByRole('button', { name: 'Add line' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('2');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('region', { name: 'Confirm your line' })).toContainText(
      'x plus one half',
    );
  });

  test('a line can be deleted and put back', async ({ page }) => {
    await stubSpoken(page, CLEAR);
    await openScratchpad(page);

    await page.getByLabel('Or type your line').fill('two x equals eight');
    await page.getByRole('button', { name: 'Add line' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('group', { name: 'Your line 1' })).toBeVisible();

    await page.getByRole('button', { name: 'Delete your line 1' }).click();
    await expect(page.getByTestId('live-polite')).toContainText('Deleted line 1');
    await expect(page.getByRole('region', { name: 'Your lines' })).toContainText('Nothing yet');

    // U undoes the delete.
    await page.keyboard.press('u');
    await expect(page.getByTestId('live-polite')).toHaveText('Put line 1 back.');
    await expect(page.getByRole('group', { name: 'Your line 1' })).toBeVisible();
  });

  test('work survives leaving the scratchpad and coming back', async ({ page }) => {
    await stubSpoken(page, CLEAR);
    await openScratchpad(page);

    await page.getByLabel('Or type your line').fill('two x equals eight');
    await page.getByRole('button', { name: 'Add line' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('group', { name: 'Your line 1' })).toBeVisible();

    await page.getByRole('button', { name: 'Leave and read the problem again' }).click();
    await expect(page.getByRole('heading', { name: 'Your problem' })).toBeVisible();
    await page.getByRole('button', { name: 'Start working' }).click();

    await expect(page.getByRole('group', { name: 'Your line 1' })).toBeVisible();
  });

  test('no control in the scratchpad offers to solve', async ({ page }) => {
    await stubSpoken(page, CLEAR);
    await openScratchpad(page);

    // The hard rule in AGENTS.md. Asserted against the *controls*, not the page
    // text: the problem's own instruction is legitimately "Solve for x.", so
    // scanning all the text would both miss the point and break the moment a
    // student expands the problem.
    await page.getByRole('button', { name: 'Show the problem' }).click();
    await expect(page.getByRole('region', { name: 'The problem' })).toContainText('Solve for x.');

    const names = await page.getByRole('button').evaluateAll((els) =>
      els.map((el) => (el.textContent ?? '').toLowerCase()),
    );
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      for (const banned of ['solve', 'answer', 'hint', 'next step', 'solution', 'check']) {
        expect(name).not.toContain(banned);
      }
    }
  });
});

test.describe('@smoke scratchpad context', () => {
  test('the student is told which problem line their work follows', async ({ page }) => {
    await stubSpoken(page, CLEAR);
    await page.goto('/');
    await page.getByRole('button', { name: 'Try a sample problem' }).click();
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });

    // Move to line 2, then start working from there. Since #92 the first saved
    // line is checked against the line S was pressed on, so a student who does
    // not know which line that is gets "I couldn't confirm this step" for a
    // correct step and no way to work out why.
    await page.getByRole('group', { name: 'Line 2' }).focus();
    await page.keyboard.press('s');

    await expect(page.getByRole('heading', { name: 'Your work' })).toBeFocused();
    await expect(page.getByTestId('live-polite')).toContainText(
      'Following line 2 of the problem',
    );
    // And on screen, for a low-vision student not running a screen reader.
    // Scoped to main: the same sentence is also in the live region, which is
    // visually hidden, so an unscoped match is ambiguous.
    await expect(
      page.getByRole('main').getByText('Following line 2 of the problem.'),
    ).toBeVisible();
  });
});
