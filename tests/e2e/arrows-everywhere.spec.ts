// Issue #239: the arrow keys and Space work on every screen, not only on the
// problem and the scratchpad. Where there are no lines, the arrows move between
// the controls and Glance says what each one is; Space presses it. Up and Down
// always leave a one-line text box.

import { test, expect, type Page } from '@playwright/test';

async function recordSpeech(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
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
const lastSaid = (page: Page) =>
  page.evaluate(() => (window as unknown as { __said: string[] }).__said.at(-1) ?? '');

/** Press Down until the named button has focus, as a student would. */
async function arrowTo(page: Page, name: string) {
  const target = page.getByRole('button', { name, exact: true });
  for (let i = 0; i < 25; i += 1) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('ArrowDown');
  }
  throw new Error(`Never reached ${name} with the arrow keys`);
}

test.describe('@smoke arrows and space on every screen', () => {
  test('home: the arrows walk the controls and say each one', async ({ page }) => {
    await recordSpeech(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Try a sample problem' })).toBeVisible();

    await page.keyboard.press('ArrowDown');
    await expect.poll(() => lastSaid(page)).toMatch(/button\. Space to press\.$|link\. Space to open\.$/);

    await arrowTo(page, 'Try a sample problem');
    await expect.poll(() => lastSaid(page)).toBe('Try a sample problem, button. Space to press.');

    await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('button', { name: 'Try a sample problem' })).not.toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('button', { name: 'Try a sample problem' })).toBeFocused();
  });

  test('home: Space presses the control you arrowed to', async ({ page }) => {
    await recordSpeech(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Try a sample problem' })).toBeVisible();
    await arrowTo(page, 'Try a sample problem');
    await page.keyboard.press(' ');
    await expect(page.locator('#L1')).toBeFocused({ timeout: 15000 });
  });

  test('home: Space with nothing to press says what to do', async ({ page }) => {
    await recordSpeech(page);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Try a sample problem' })).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press(' ');
    await expect.poll(() => lastSaid(page)).toContain('Press Down to move through the choices');
  });

  test('scratchpad: Up and Down leave the text box', async ({ page }) => {
    await recordSpeech(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Try a sample problem' }).click();
    await expect(page.locator('#L1')).toBeFocused({ timeout: 15000 });
    await page.keyboard.press('s');
    const box = page.getByRole('textbox').first();
    await box.focus();
    await page.keyboard.press('ArrowDown');
    await expect(box).not.toBeFocused();
    await box.focus();
    await page.keyboard.press('ArrowUp');
    await expect(box).not.toBeFocused();
  });
});
