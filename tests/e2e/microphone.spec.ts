// Issue #200: the microphone is explained before the browser asks for it,
// so a student who can't see the prompt knows what is happening and why.

import { test, expect, type Page } from '@playwright/test';
import { MIC_EXPLAINED } from '../../frontend/src/components/RecordButton';

const assertive = (page: Page) => page.getByTestId('live-assertive');

/**
 * WebKit on some platforms has no MediaRecorder, and then the record button is
 * not drawn at all. A stand-in is installed first so the button is there.
 * `getUserMedia` is given by each test.
 */
async function stubRecording(page: Page, getUserMedia: string) {
  await page.addInitScript((source) => {
    class FakeRecorder {
      static isTypeSupported = () => true;
      state = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.onstop?.();
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { value: FakeRecorder, configurable: true });
    const getUserMediaStub = new Function('return (' + source + ')')();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: getUserMediaStub },
      configurable: true,
    });
  }, getUserMedia);
}

async function openSample(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample problem' }).click();
  await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
  await page.keyboard.press('s');
}

test.describe('@smoke microphone', () => {
  test('the microphone is explained before the browser asks', async ({ page }) => {
    // The browser's own prompt waits for the student, so the request does too.
    await stubRecording(page, '() => new Promise(() => {})');
    await page.goto('/');
    await page.getByRole('button', { name: 'Try a sample problem' }).click();
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
    await page.keyboard.press('s');
    await page.getByTestId('record-button').click();
    await expect(assertive(page)).toContainText(MIC_EXPLAINED);
  });

  test('a refused microphone says how to turn it back on', async ({ page }) => {
    await stubRecording(page, "() => Promise.reject(new DOMException('denied', 'NotAllowedError'))");
    await page.goto('/');
    await page.getByRole('button', { name: 'Try a sample problem' }).click();
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
    await page.keyboard.press('s');
    await page.getByTestId('record-button').click();
    await expect(page.getByText(/turn the microphone on, and try again/)).toBeVisible();
  });

  test('after a successful start the explanation is not repeated', async ({ page }) => {
    await stubRecording(page, '() => Promise.resolve({ getTracks: () => [] })');
    await openSample(page);
    await page.getByTestId('record-button').click();
    await expect(assertive(page)).toContainText('Recording. Speak your line.');
    await page.getByTestId('record-button').click();
    await expect(page.getByTestId('record-button')).toHaveText('Record a line');
    await page.getByTestId('record-button').click();
    await expect(assertive(page)).toContainText('Recording. Speak your line.');
    await expect(assertive(page)).not.toContainText(MIC_EXPLAINED);
    // And it is remembered across a reload, where Safari cannot be asked.
    await page.reload();
    // The sample is still loaded after a reload, on the same page.
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
    await page.locator('#L1').focus();
    await page.keyboard.press('s');
    await page.getByTestId('record-button').click();
    await expect(assertive(page)).toContainText('Recording. Speak your line.');
    await expect(assertive(page)).not.toContainText(MIC_EXPLAINED);
  });
});
