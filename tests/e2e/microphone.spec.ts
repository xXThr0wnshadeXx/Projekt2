// Issue #200: the microphone is explained before the browser asks for it,
// so a student who can't see the prompt knows what is happening and why.

import { test, expect, type Page } from '@playwright/test';
import { MIC_EXPLAINED } from '../../frontend/src/components/RecordButton';

const assertive = (page: Page) => page.getByTestId('live-assertive');

test.describe('@smoke microphone', () => {
  test('the microphone is explained before the browser asks', async ({ page }) => {
    // The browser's own prompt waits for the student, so the request does too.
    await page.addInitScript(() => {
      Object.defineProperty(MediaDevices.prototype, 'getUserMedia', {
        value: () => new Promise<MediaStream>(() => {}),
        configurable: true,
      });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Try a sample problem' }).click();
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
    await page.keyboard.press('s');
    await page.getByTestId('record-button').click();
    await expect(assertive(page)).toContainText(MIC_EXPLAINED);
  });

  test('a refused microphone says how to turn it back on', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(MediaDevices.prototype, 'getUserMedia', {
        value: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
        configurable: true,
      });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Try a sample problem' }).click();
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
    await page.keyboard.press('s');
    await page.getByTestId('record-button').click();
    await expect(page.getByText(/turn the microphone on, and try again/)).toBeVisible();
  });
});
