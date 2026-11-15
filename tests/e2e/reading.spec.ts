// How the page itself is read: the app's own voice, and large print.
//
// Most people with low vision use no screen reader. For them the live regions
// this app talks through are silent, so "math you can hear" has to mean the
// app can speak for itself, and it has to be possible to switch that on, and
// to make the print larger, from the first screen.

import { test, expect, type Page } from '@playwright/test';

const polite = (page: Page) => page.getByTestId('live-polite');

/** Replace the speech engine with a recorder, before the app loads. */
async function recordSpeech(page: Page) {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    (window as unknown as { __spoken: string[] }).__spoken = spoken;
    // The test browsers differ: Playwright's WebKit has no speech synthesis
    // on some platforms and one that cannot be patched on others, though
    // Safari on a real iPhone speaks. So the whole engine is replaced with a
    // recorder, and the app's own voice is tested the same way everywhere.
    const recorder = {
      speaking: false,
      pending: false,
      paused: false,
      speak: (u: { text: string }) => {
        spoken.push(u.text);
      },
      cancel: () => {},
      pause: () => {},
      resume: () => {},
      getVoices: () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    Object.defineProperty(window, 'speechSynthesis', {
      value: recorder,
      configurable: true,
      writable: true,
    });
    (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
      text: string;
      rate = 1;
      lang = '';
      constructor(text: string) {
        this.text = text;
      }
    };
  });
}

const spoken = (page: Page) =>
  page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);

const rootSize = (page: Page) =>
  page.evaluate(() => document.documentElement.style.fontSize);

test.describe('@smoke reading controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('cleared')) {
        localStorage.clear();
        sessionStorage.setItem('cleared', '1');
      }
    });
  });

  test('the app opens in large print, and the size can be changed and is kept', async ({ page }) => {
    await page.goto('/');
    // Set by an effect after the first render, so it is waited for.
    await expect.poll(() => rootSize(page)).toBe('125%');

    await page.getByRole('button', { name: 'Larger text' }).click();
    await expect(polite(page)).toHaveText('Text size 150 percent.');
    await expect.poll(() => rootSize(page)).toBe('150%');

    await page.reload();
    await expect(page.getByTestId('text-scale')).toHaveText('150%');
    await expect.poll(() => rootSize(page)).toBe('150%');
  });

  test('at the largest size the button says so instead of going dead', async ({ page }) => {
    await page.goto('/');
    const larger = page.getByRole('button', { name: 'Larger text' });
    for (let i = 0; i < 3; i += 1) await larger.click();
    await expect(page.getByTestId('text-scale')).toHaveText('200%');

    await larger.click();
    await expect(polite(page)).toHaveText('This is the largest text size.');
    await expect(larger).toBeFocused();
  });

  test('nothing is spoken until reading aloud is switched on', async ({ page }) => {
    await recordSpeech(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Try a sample problem' }).click();
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
    await page.keyboard.press('g');
    await expect(polite(page)).toContainText('equation');
    expect(await spoken(page)).toEqual([]);
  });

  test('with reading aloud on, everything the app announces is spoken', async ({ page }) => {
    await recordSpeech(page);
    await page.goto('/');

    const toggle = page.getByRole('button', { name: 'Read aloud: off' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Read aloud: on' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByRole('button', { name: 'Try a sample problem' }).click();
    await expect(page.locator('#L2 mjx-container')).toHaveAttribute(
      'data-semantic-speech-none',
      /.+/,
    );
    await page.getByRole('group', { name: 'Line 2' }).focus();
    await page.keyboard.press('g');
    await expect(polite(page)).toContainText('fraction');
    await page.keyboard.press('r');
    await expect(polite(page)).toContainText('Line 2. the fraction');

    const said = (await spoken(page)).join(' | ');
    expect(said).toContain('Reading aloud is on.');
    expect(said).toContain('Sample problem. Solve for x. 2 lines.');
    expect(said).toContain('This is an equation, with a left side and a right side.');
    expect(said).toContain('the fraction with numerator the square root of x plus 1');
    // The voice says math, never markup.
    expect(said).not.toContain('\\');
  });

  test('a server that is down is said once, not twice', async ({ page }) => {
    await page.route('**/api/**', (route) => route.abort());
    await page.goto('/');
    await expect(page.getByTestId('backend-status')).toBeVisible();
    // Said once as a notice. The Capture button also names itself
    // "unavailable right now" (#127); that is a control's name, not a notice.
    await expect(page.getByText(/unavailable/i).and(page.locator(':not(button)'))).toHaveCount(1);
    await expect(page.getByText(/not reachable/i)).toHaveCount(0);
  });

  test('the same controls are in Settings', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('button', { name: /^Read aloud/ })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Text size' })).toBeVisible();
  });
});
