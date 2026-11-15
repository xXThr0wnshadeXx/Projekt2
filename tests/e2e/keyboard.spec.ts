// Keyboard map and spoken help — issue #25.
//
// The help has to say what each screen actually does, never fire while the
// student is typing, and be reachable without the "?" key too.

import { test, expect, type Page } from '@playwright/test';
import { KEYMAP, helpText } from '../../frontend/src/shortcuts';
import { stubServerWithModels } from './server';


async function openSample(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample problem' }).click();
  await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
}

const polite = (page: Page) => page.getByTestId('live-polite');

test.describe('@smoke keyboard help', () => {
  test('? speaks the shortcuts for the current screen and shows them', async ({ page }) => {
    await openSample(page);
    await expect(page.locator('#L1')).toBeFocused();

    await page.keyboard.press('Shift+Slash'); // "?"
    await expect(polite(page)).toHaveText(helpText('problem'));

    const panel = page.getByRole('region', { name: 'Keyboard shortcuts on this screen' });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('hear the structure of the line');
    // Pressing ? must not pull the student off the line they were on.
    await expect(page.locator('#L1')).toBeFocused();
  });

  test('the help changes with the screen', async ({ page }) => {
    await stubServerWithModels(page); // capture needs the model (#127)
    await page.goto('/');
    // Let the welcome announcement land first, as it would for a person.
    await expect(polite(page)).toContainText('Glance.');
    await page.keyboard.press('Shift+Slash');
    await expect(polite(page)).toHaveText(helpText('home'));

    await page.getByRole('button', { name: 'Capture a problem' }).click();
    await expect(page.getByRole('region', { name: 'Keyboard shortcuts on this screen' })).toHaveCount(0);
    await page.keyboard.press('Shift+Slash');
    await expect(polite(page)).toHaveText(helpText('capture'));
  });

  test('the button opens the list and moves focus to it, and Close shuts it', async ({ page }) => {
    await page.goto('/');
    const button = page.getByRole('button', { name: 'Keyboard shortcuts' });
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('heading', { name: 'Keyboard shortcuts on this screen' })).toBeFocused();

    await page.getByRole('button', { name: 'Close shortcuts' }).click();
    await expect(page.getByRole('region', { name: 'Keyboard shortcuts on this screen' })).toHaveCount(0);
    await expect(polite(page)).toHaveText('Shortcuts closed.');
  });

  test('shortcuts never fire while typing in a box', async ({ page }) => {
    await openSample(page);
    await page.getByRole('button', { name: 'Start working' }).click();
    const box = page.getByLabel('Or type your line');
    await box.click();
    await box.pressSequentially('? p u x');
    await expect(box).toHaveValue('? p u x');
    await expect(page.getByRole('region', { name: 'Keyboard shortcuts on this screen' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'The problem' })).toHaveCount(0);
  });

  test('modifier chords are left to the browser and screen reader', async ({ page }) => {
    await openSample(page);
    await page.keyboard.press('Control+g');
    await expect(polite(page)).not.toContainText('structure');
  });

  test('U on the capture screen opens the file picker', async ({ page }) => {
    await stubServerWithModels(page); // capture needs the model (#127)
    await page.goto('/');
    await page.getByRole('button', { name: 'Capture a problem' }).click();
    await expect(page.getByRole('heading', { name: 'Capture a problem' })).toBeFocused();
    // Headless Chromium doesn't raise a file-chooser event for a key-driven
    // click, so assert the thing that opens it: the file input being clicked.
    await page.evaluate(() => {
      const input = document.querySelector('input[type=file]')!;
      (window as unknown as { clicks: number }).clicks = 0;
      input.addEventListener('click', (e) => {
        (window as unknown as { clicks: number }).clicks += 1;
        e.preventDefault();
      });
    });
    await page.keyboard.press('u');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { clicks: number }).clicks))
      .toBe(1);
  });

  test('? also works when a keyboard reports it as Shift and slash', async ({ page }) => {
    await openSample(page);
    await page.evaluate(() =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: '/', shiftKey: true, bubbles: true }),
      ),
    );
    await expect(polite(page)).toHaveText(helpText('problem'));
  });

  test('? works in low-vision mode too', async ({ page }) => {
    await openSample(page);
    await page.keyboard.press('l');
    await page.keyboard.press('Shift+Slash');
    await expect(polite(page)).toHaveText(helpText('lowvision'));
  });
});

test('every screen lists ? and nothing is listed twice', () => {
  for (const [screen, keys] of Object.entries(KEYMAP)) {
    const names = keys.map((k) => k.keys);
    expect(names, screen).toContain('Question mark');
    expect(new Set(names).size, screen).toBe(names.length);
  }
});
