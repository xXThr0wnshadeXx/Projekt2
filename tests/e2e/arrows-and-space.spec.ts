// Issue #236: the arrow keys and the space bar drive Glance. Up or Left is the
// previous line, Down or Right the next, and a tap of Space reads the current
// line aloud. Holding Space still records on the scratchpad.

import { test, expect, type Page } from '@playwright/test';

const polite = (page: Page) => page.getByTestId('live-polite');

/** Record what Glance's own voice says, before the app loads. */
async function recordSpeech(page: Page) {
  await page.addInitScript(() => {
    const said: string[] = [];
    (window as unknown as { __said: string[] }).__said = said;
    const proto = Object.getPrototypeOf(window.speechSynthesis);
    Object.defineProperty(proto, 'speak', {
      value: (u: SpeechSynthesisUtterance) => said.push(u.text),
      configurable: true,
    });
    Object.defineProperty(proto, 'cancel', { value: () => {}, configurable: true });
  });
}
const said = (page: Page) =>
  page.evaluate(() => (window as unknown as { __said: string[] }).__said.join(' | '));

async function openSample(page: Page) {
  await page.addInitScript(() => window.localStorage.clear());
  await recordSpeech(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample problem' }).click();
  await expect(page.locator('#L2 mjx-container')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#L1')).toBeFocused();
}

test.describe('@smoke arrows and space on the problem', () => {
  test('the arrows move between lines and say where you are', async ({ page }) => {
    await openSample(page);
    await page.keyboard.press('ArrowDown');
    await expect(polite(page)).toHaveText('Line 2 of 2.');
    await expect(page.locator('#L2')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(polite(page)).toHaveText('This is the last line.');
    await page.keyboard.press('ArrowUp');
    await expect(polite(page)).toHaveText('Line 1 of 2.');
    await page.keyboard.press('ArrowRight');
    await expect(polite(page)).toHaveText('Line 2 of 2.');
    await page.keyboard.press('ArrowLeft');
    await expect(polite(page)).toHaveText('Line 1 of 2.');
    await page.keyboard.press('ArrowLeft');
    await expect(polite(page)).toHaveText('This is the first line.');
  });

  test('a tap of Space reads the current line aloud', async ({ page }) => {
    await openSample(page);
    await page.keyboard.press('ArrowDown');
    await expect(polite(page)).toHaveText('Line 2 of 2.');
    await page.keyboard.press(' ');
    await expect.poll(() => said(page)).toContain('Line 2. the fraction');
  });

  test('Space still presses a focused button', async ({ page }) => {
    await openSample(page);
    await page.getByRole('button', { name: 'Glance', exact: true }).focus();
    await page.keyboard.press(' ');
    await expect(page.getByRole('region', { name: 'Structure summary' })).toBeVisible({ timeout: 15000 });
    expect(await said(page)).not.toContain('Line 1.');
  });
});

test.describe('@smoke arrows and space on the scratchpad', () => {
  test('before any lines, Space reads the problem line you follow', async ({ page }) => {
    await openSample(page);
    await page.keyboard.press('s');
    await expect(page.getByRole('heading', { name: 'Your work', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(polite(page)).toHaveText('You have not written any lines yet.');
    await page.keyboard.press(' ');
    await expect.poll(() => said(page)).toContain('You have not written any lines yet. Problem line 1.');
  });

  test('arrows move through your lines and Space reads one', async ({ page }) => {
    await page.route('**/api/**', (r) => r.abort());
    await openSample(page);
    await page.keyboard.press('s');
    for (const line of ['2x = 8', 'x = 4']) {
      await page.getByLabel('Or type your line').fill(line);
      await page.keyboard.press('Enter');
      await expect(polite(page)).toContainText('I read:');
      await page.keyboard.press('Enter');
      await expect(polite(page)).toContainText('Saved as line');
    }
    // Saving a line puts you on it, so you start on line 2.
    await page.keyboard.press('ArrowUp');
    await expect(polite(page)).toHaveText('Your line 1 of 2.');
    await page.keyboard.press('ArrowUp');
    await expect(polite(page)).toHaveText('This is your first line.');
    await page.keyboard.press('ArrowDown');
    await expect(polite(page)).toHaveText('Your line 2 of 2.');
    await page.keyboard.press('ArrowLeft');
    await expect(polite(page)).toHaveText('Your line 1 of 2.');
    await page.keyboard.press(' ');
    await expect.poll(() => said(page)).toContain('Your line 1. 2 x equals 8');
  });

  test('typing in the text box keeps its arrows and spaces', async ({ page }) => {
    await openSample(page);
    await page.keyboard.press('s');
    const box = page.getByLabel('Or type your line');
    await box.click();
    await page.keyboard.type('x = 4');
    await page.keyboard.press('ArrowLeft');
    await expect(box).toHaveValue('x = 4');
    expect(await said(page)).toBe('');
  });

  test('holding Space still records', async ({ page, browserName, isMobile }) => {
    test.skip(isMobile, 'Touch devices record with tap-to-start, not a held key.');
    test.skip(browserName === 'webkit', 'Covered on desktop browsers.');
    await page.addInitScript(() => {
      Object.defineProperty(MediaDevices.prototype, 'getUserMedia', {
        value: () => new Promise<MediaStream>(() => {}),
        configurable: true,
      });
    });
    await openSample(page);
    await page.keyboard.press('s');
    await page.getByRole('heading', { name: 'Your work', exact: true }).focus();
    await page.keyboard.down(' ');
    await page.waitForTimeout(700);
    await page.keyboard.up(' ');
    // Held past the threshold: it went to the microphone, not to reading.
    expect(await said(page)).not.toContain('You have not written any lines yet.');
  });
});
