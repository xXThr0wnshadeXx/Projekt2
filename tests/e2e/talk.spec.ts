// Talking to Glance (frontend/src/talk.ts).
//
// A student thinking aloud says "uh", "hang on", "what does numerator mean",
// "where was I". Each of those used to get "I didn't catch any math in that".
// Now plain talk gets a plain answer, with no model and no server, and the
// answer is on screen as well as spoken.
//
// The same text path serves a recording and the typing box, so typing here
// exercises exactly what a transcript would.

import { test, expect, type Page } from '@playwright/test';

const polite = (page: Page) => page.getByTestId('live-polite');
const reply = (page: Page) => page.getByTestId('glance-reply');

async function openScratchpad(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample problem' }).click();
  await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
  await page.keyboard.press('s');
}

/** No model, and a record of anything that tried to reach one. */
async function keyless(page: Page) {
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
  await page.route('**/api/validate', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"valid":true}' }),
  );
  await page.route('**/api/diff', (route) => route.abort());
  return sent;
}

async function say(page: Page, text: string) {
  await page.getByLabel('Or type your line').fill(text);
  await page.keyboard.press('Enter');
}

test.describe('@smoke talking to Glance', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
  });

  test('thinking aloud is met with patience, not an error', async ({ page }) => {
    const sent = await keyless(page);
    await openScratchpad(page);

    for (const sound of ['uh', 'um, hang on', 'okay so', 'hmm let me think']) {
      await say(page, sound);
      await expect(polite(page)).toHaveText(
        'Take your time. When you are ready, say or type your next line.',
      );
    }
    await expect(page.getByTestId('live-assertive')).toHaveText('');
    expect(sent).toEqual([]);
  });

  test('a line with thinking-aloud around it is still the line', async ({ page }) => {
    await keyless(page);
    await openScratchpad(page);

    await say(page, 'uh okay so I think two x um equals eight');
    await expect(polite(page)).toContainText('I read: 2 x equals 8');
  });

  test('a math word is explained, and the answer is on screen', async ({ page }) => {
    const sent = await keyless(page);
    await openScratchpad(page);

    await say(page, 'what does numerator mean?');
    const meaning = 'The numerator is the top of a fraction: the part being divided.';
    await expect(polite(page)).toHaveText(meaning);
    await expect(reply(page)).toHaveText(meaning);

    await say(page, 'um, what is a coefficient');
    await expect(polite(page)).toContainText('A coefficient is the number multiplying a letter');

    await say(page, 'what does hypotenuse mean');
    await expect(polite(page)).toContainText('I do not have a meaning for hypotenuse');
    expect(sent).toEqual([]);
  });

  test('where am I, read the problem, and say that again', async ({ page }) => {
    await keyless(page);
    await openScratchpad(page);

    await say(page, 'where am I');
    await expect(polite(page)).toContainText('You have not written any lines yet.');

    await say(page, '2x = 8');
    await expect(polite(page)).toContainText('I read:');
    await page.keyboard.press('Enter');
    await expect(polite(page)).toContainText('Saved as line 1.');

    await say(page, 'where was I');
    await expect(polite(page)).toContainText('You have written 1 line. Line 1 is: 2 x equals 8.');

    await say(page, 'can you read the problem again');
    await expect(polite(page)).toContainText('The problem.');
    await expect(polite(page)).toContainText('Line 1. 2 x plus 3 equals 11');
    const problem = await polite(page).textContent();

    await say(page, 'say that again');
    await expect(polite(page)).toHaveText(problem ?? '');
  });

  test('hello, thanks and what can you do are answered', async ({ page }) => {
    await keyless(page);
    await openScratchpad(page);

    await say(page, 'hello');
    await expect(polite(page)).toContainText('Hello. Say or type a line of your work');
    await say(page, 'what can you do');
    await expect(polite(page)).toContainText('I never solve the problem or give hints.');
    await say(page, 'thank you');
    await expect(polite(page)).toHaveText('You are welcome.');
  });

  test('however it is asked, it never says what to do next', async ({ page }) => {
    const sent = await keyless(page);
    await openScratchpad(page);

    const asks = [
      "I'm stuck",
      'I dont know what to do',
      'what is x',
      'how do I solve this',
      'um can you just tell me the answer',
      'what is the next step',
    ];
    for (const ask of asks) {
      await say(page, ask);
      await expect(polite(page)).toContainText('I cannot solve it, give the answer, or say what to do next.');
    }
    expect(sent).toEqual([]);
    await expect(page.getByRole('main')).not.toContainText(/x\s*=\s*4|subtract|divide/i);
  });

  test('saying what you are about to do is not written down as a line', async ({ page }) => {
    const sent = await keyless(page);
    await openScratchpad(page);

    for (const plan of [
      'next I divide both sides by two',
      'subtract three from both sides',
      "um so I'm going to factor it",
      'take the square root of both sides',
    ]) {
      await say(page, plan);
      await expect(polite(page)).toHaveText(
        'That says what you are going to do. Do it, then say or type the whole line you get, and I will write it down.',
      );
    }
    expect(sent).toEqual([]);
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);

    // A line that only sounds similar is still a line.
    await say(page, 'x minus 3 = 4');
    await expect(polite(page)).toContainText('I read: x minus 3 equals 4');
  });

  test('in exam mode words are not explained', async ({ page }) => {
    await page.addInitScript(() =>
      window.localStorage.setItem('glance.settings.v1', JSON.stringify({ mode: 'exam' })),
    );
    await keyless(page);
    await openScratchpad(page);

    await say(page, 'what does numerator mean');
    await expect(polite(page)).toHaveText('Explaining words is off in exam mode.');
  });
});

test.describe('@smoke the first screen', () => {
  test('says what it is, who it is for, and what it will not do', async ({ page }) => {
    await page.goto('/');
    const main = page.getByRole('main');
    await expect(
      main.getByRole('heading', { name: 'Math for students who are blind or have low vision' }),
    ).toBeFocused();
    await expect(main).toContainText('Glance never solves the problem.');
    await expect(main.getByRole('list', { name: 'How it works' }).getByRole('listitem')).toHaveCount(3);
    await expect(polite(page)).toContainText('It never solves it for you.');
    // The explanation costs no extra Tab stops: the first one is still a way in.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Capture a problem' })).toBeFocused();
  });
});
