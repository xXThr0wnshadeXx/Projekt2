// What still has to work with no model at all.
//
// A server with no model key, or no server, is not a hypothetical: it is how
// the app is deployed until the key arrives, and it is what the venue Wi-Fi
// can produce at any moment. Reading a new photo needs the model. Everything
// after that — hearing the problem, exploring it, writing your own lines,
// having them read back, handing them in — must not.
//
// These were all found by using the app with the keyboard and listening to
// what it said, and none of them was visible to the suite before.

import { test, expect, type Page } from '@playwright/test';

const polite = (page: Page) => page.getByTestId('live-polite');
const assertive = (page: Page) => page.getByTestId('live-assertive');

async function openSample(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample problem' }).click();
  await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
}

/** The model routes as a keyless server answers them, and a recorder. */
async function keyless(page: Page, validity: boolean | 'unreachable' = true) {
  const sent: string[] = [];
  await page.route('**/api/spoken-to-latex', (route) => {
    sent.push('spoken');
    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'That address does not exist.' } }),
    });
  });
  await page.route('**/api/command', (route) => {
    sent.push('command');
    return route.abort();
  });
  await page.route('**/api/validate', (route) => {
    sent.push('validate');
    if (validity === 'unreachable') return route.abort();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ valid: validity }),
    });
  });
  await page.route('**/api/diff', (route) => route.abort());
  return sent;
}

async function typeLine(page: Page, text: string) {
  await page.getByLabel('Or type your line').fill(text);
  await page.keyboard.press('Enter');
}

test.describe('@smoke without a model', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
  });

  test('a line typed with symbols is read back and saved', async ({ page }) => {
    await keyless(page);
    await openSample(page);
    await page.keyboard.press('s');

    await typeLine(page, '(x+1)/2 = 5');
    // Read back as speech, never as LaTeX, and not saved until confirmed.
    await expect(polite(page)).toContainText(
      'I read: the fraction with numerator x plus 1 and denominator 2 equals 5',
    );
    await expect(page.getByRole('region', { name: 'Your lines' })).toContainText('Nothing yet');

    await page.keyboard.press('Enter');
    await expect(polite(page)).toHaveText('Saved as line 1.');
    await expect(page.getByRole('group', { name: 'Your line 1', exact: true })).toBeVisible();
  });

  test('simple words are read too', async ({ page }) => {
    await keyless(page);
    await openSample(page);
    await page.keyboard.press('s');

    await typeLine(page, 'two x equals eight');
    await expect(polite(page)).toContainText('I read: 2 x equals 8');
  });

  test('words whose grouping is unclear are refused, never guessed', async ({ page }) => {
    await keyless(page);
    await openSample(page);
    await page.keyboard.press('s');

    await typeLine(page, 'x plus one over two');
    await expect(assertive(page)).toContainText('Type it with symbols');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  });

  test('a line the checker cannot read is saved as unsure, not dropped', async ({ page }) => {
    await keyless(page, false);
    await openSample(page);
    await page.keyboard.press('s');

    await typeLine(page, 'x = 3 = y');
    await expect(polite(page)).toContainText('I read:');
    await page.keyboard.press('Enter');
    await expect(polite(page)).toHaveText('Saved as line 1. I could not check it.');
    await expect(page.getByRole('group', { name: 'Your line 1, unsure' })).toBeVisible();
  });

  test('with no server at all, a typed line is still saved and not flagged', async ({ page }) => {
    await page.route('**/api/**', (route) => route.abort());
    await openSample(page);
    await page.keyboard.press('s');

    await typeLine(page, '2x = 8');
    await expect(polite(page)).toContainText('I read:');
    await page.keyboard.press('Enter');
    await expect(polite(page)).toHaveText('Saved as line 1.');
    await expect(page.getByRole('group', { name: 'Your line 1', exact: true })).toBeVisible();
  });

  test('asking it to solve gets a plain no, and nothing is sent anywhere', async ({ page }) => {
    const sent = await keyless(page);
    await openSample(page);
    await page.keyboard.press('s');

    const asks = ['solve it for me', 'what is the answer', 'give me a hint', 'what should I do next'];
    for (const ask of asks) {
      await typeLine(page, ask);
      await expect(polite(page)).toHaveText(
        'I cannot solve it, give the answer, or say what to do next. The work is yours. I can read the problem again, explain a math word, or check a line once you have written it.',
      );
      await expect(page.getByLabel('Or type your line')).toHaveValue('');
    }
    expect(sent).toEqual([]);
    // The answers to the sample's two lines never appear.
    await expect(page.getByRole('main')).not.toContainText(/x\s*=\s*4|99/);
  });

  test('two deletes can both be undone', async ({ page }) => {
    await keyless(page);
    await openSample(page);
    await page.keyboard.press('s');
    for (const line of ['2x = 8', 'x = 4']) {
      await typeLine(page, line);
      await expect(polite(page)).toContainText('I read:');
      await page.keyboard.press('Enter');
      await expect(polite(page)).toContainText('Saved as line');
    }

    await page.getByRole('button', { name: 'Delete your line 2' }).click();
    await page.getByRole('button', { name: 'Delete your line 1' }).click();
    await expect(page.getByRole('region', { name: 'Your lines' })).toContainText('Nothing yet');

    // Still offered with nothing left on the page: that is when it matters.
    await page.getByRole('button', { name: 'Undo delete' }).click();
    await expect(polite(page)).toHaveText('Put line 1 back. Press U again to put back another.');
    await page.getByRole('button', { name: 'Undo delete' }).click();
    await expect(polite(page)).toHaveText('Put line 2 back.');
    await expect(page.getByRole('group', { name: 'Your line 2', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Undo delete' })).toHaveCount(0);
  });

  test('an error does not stay on the page after the student has moved on', async ({ page }) => {
    await keyless(page);
    await openSample(page);
    await page.keyboard.press('s');
    await typeLine(page, 'x plus one over two');
    await expect(assertive(page)).not.toHaveText('');

    await typeLine(page, '2x = 8');
    await expect(polite(page)).toContainText('I read:');
    await expect(assertive(page)).toHaveText('');
  });
});

test.describe('@smoke reading the problem', () => {
  test('the glance calls an equation an equation', async ({ page }) => {
    await openSample(page);
    await page.getByRole('group', { name: 'Line 1', exact: true }).focus();
    await page.keyboard.press('g');
    await expect(polite(page)).toHaveText(
      'This is an equation, with a left side and a right side. It has no fractions, roots or exponents.',
    );
  });

  test('R and Shift+R speak the math, never the LaTeX', async ({ page }) => {
    await openSample(page);
    await page.getByRole('group', { name: 'Line 2', exact: true }).focus();
    // Speech is attached a moment after the line is typeset.
    await expect(page.locator('#L2 mjx-container')).toHaveAttribute(
      'data-semantic-speech-none',
      /.+/,
    );

    await page.keyboard.press('r');
    await expect(polite(page)).toHaveText(
      'Line 2. the fraction with numerator the square root of x plus 1 and denominator 2 equals 5',
    );

    await page.keyboard.press('Shift+R');
    await expect(polite(page)).toContainText('Line 1. 2 x plus 3 equals 11.');
    await expect(polite(page)).not.toContainText('{');
  });

  test('Escape leaves the explorer and the shortcuts work again', async ({ page }) => {
    await openSample(page);
    const line = page.getByRole('group', { name: 'Line 1', exact: true });
    await line.focus();
    await expect(page.locator('#L1 mjx-container')).toHaveAttribute(
      'data-semantic-speech-none',
      /.+/,
    );

    await page.keyboard.press('Enter');
    await expect(line).not.toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(line).toBeFocused();

    // Inside the equation single keys belong to the explorer. Back on the
    // line they are the app's again.
    await page.keyboard.press('n');
    await expect(polite(page)).toHaveText('Line 2 of 2.');
  });
});
