// Understand it by ear — issue #199.
//
// Questions about one part of a problem line are answered from the line's own
// structure, with no model and no network, in every mode. They describe what
// is printed and never work anything out.

import { test, expect, type Page } from '@playwright/test';
import { asksAboutPart } from '../../frontend/src/talk';

const polite = (page: Page) => page.getByTestId('live-polite');

async function openScratchpad(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample problem' }).click();
  await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
  await page.keyboard.press('s');
}

/** No server at all; record anything that tried to reach one. */
async function offline(page: Page) {
  const sent: string[] = [];
  await page.route('**/api/**', (route) => {
    sent.push(new URL(route.request().url()).pathname);
    return route.abort();
  });
  return sent;
}

async function ask(page: Page, text: string) {
  await page.getByLabel('Or type your line').fill(text);
  await page.keyboard.press('Enter');
}

test.describe('@smoke asking about part of a line', () => {
  test('questions are recognised, and dictated maths is never taken for one', () => {
    expect(asksAboutPart("what's on top")).toEqual({ part: 'top' });
    expect(asksAboutPart('what is on top of line two?')).toEqual({ part: 'top', line: 2 });
    expect(asksAboutPart('read the bottom')).toEqual({ part: 'bottom' });
    expect(asksAboutPart('what is the denominator of line 2')).toEqual({ part: 'bottom', line: 2 });
    expect(asksAboutPart("what's under the root")).toEqual({ part: 'root' });
    expect(asksAboutPart("what's the power")).toEqual({ part: 'power' });
    expect(asksAboutPart('how many terms on the left')).toEqual({ part: 'terms' });
    expect(asksAboutPart('read the left side')).toEqual({ part: 'left' });
    expect(asksAboutPart('spell it out')).toEqual({ part: 'spell' });
    expect(asksAboutPart('describe line two')).toEqual({ part: 'shape', line: 2 });

    // Dictation and other talk are left alone.
    for (const said of [
      'x to the power two',
      'two x plus three equals eleven',
      'x over two',
      'what is an exponent',
      'what does base mean',
      'define numerator',
      'what is a numerator',
      'what is a denominator',
      "what's left",
      'what is x',
    ]) {
      expect(asksAboutPart(said), said).toBeNull();
    }
  });

  test('the parts of a fraction, a root and the sides are read out, with no server', async ({ page }) => {
    const sent = await offline(page);
    await openScratchpad(page);

    await ask(page, 'what is on top of line 2');
    await expect(polite(page)).toHaveText('Problem line 2. On top: the square root of x plus 1.');

    await ask(page, "what's on the bottom of line two");
    await expect(polite(page)).toHaveText('Problem line 2. On the bottom: 2.');

    await ask(page, "what's under the root in line 2");
    await expect(polite(page)).toHaveText('Problem line 2. Under the root: x plus 1.');

    await ask(page, 'describe line 2');
    await expect(polite(page)).toHaveText(
      'Problem line 2. An equation. On the left, a fraction: the square root of x plus 1, over 2. On the right, 5.',
    );

    await ask(page, 'how many terms in line one');
    await expect(polite(page)).toHaveText(
      'Problem line 1. On the left side, 2 terms: 2 x; 3. On the right side, 1 term: 11.',
    );

    await ask(page, 'spell line 1');
    await expect(polite(page)).toHaveText('Problem line 1. 2, x, plus, 3, equals, 1, 1.');

    await ask(page, 'what is on top of line 1');
    await expect(polite(page)).toHaveText('Problem line 1. This line has no fraction.');

    await ask(page, 'what is on top of line 7');
    await expect(polite(page)).toHaveText('The problem has 2 lines, so there is no line 7.');

    // Nothing was written down as a line of work, and no question went to a
    // model or the server (the app's own health check aside).
    await expect(page.getByRole('region', { name: 'Your lines' })).toContainText('Nothing yet');
    expect(sent.filter((path) => !path.endsWith('/api/health'))).toEqual([]);
  });

  test('reading parts aloud stays on in exam mode, like a human reader', async ({ page }) => {
    await page.addInitScript(() =>
      window.localStorage.setItem('glance.settings.v1', JSON.stringify({ mode: 'exam' })),
    );
    await offline(page);
    await openScratchpad(page);

    await ask(page, 'what is on top of line 2');
    await expect(polite(page)).toHaveText('Problem line 2. On top: the square root of x plus 1.');
  });
});
