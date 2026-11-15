// Issue #200: opening Glance must not need a sighted person. On a first visit
// any key starts Glance and turns its own voice on; Escape keeps it quiet for
// a screen reader user. Later visits go straight to Home.

import { test, expect, type Page } from '@playwright/test';
import { MIC_EXPLAINED } from '../../frontend/src/components/RecordButton';

const polite = (page: Page) => page.getByTestId('live-polite');
const assertive = (page: Page) => page.getByTestId('live-assertive');

/** Record what the app's own voice says, before the app loads. */
async function recordSpeech(page: Page) {
  await page.addInitScript(() => {
    const spoken: string[] = [];
    (window as unknown as { __spoken: string[] }).__spoken = spoken;
    window.speechSynthesis.speak = (u: SpeechSynthesisUtterance) => {
      spoken.push(u.text);
    };
    window.speechSynthesis.cancel = () => {};
  });
}
const spoken = (page: Page) =>
  page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.join(' | '));

test.describe('@smoke first visit', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('any key starts Glance talking', async ({ page }) => {
    await recordSpeech(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome to Glance' })).toBeFocused();
    await expect(page.getByTestId('welcome-text')).toContainText('Press any key to start');

    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: /Math for students/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Read aloud: on' })).toBeVisible();
    await expect.poll(() => spoken(page)).toContain("Hi, I'm Glance. Reading aloud is on.");
  });

  test('Escape starts quietly, for a screen reader user', async ({ page }) => {
    await recordSpeech(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome to Glance' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: /Math for students/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Read aloud: off' })).toBeVisible();
    expect(await spoken(page)).toBe('');
  });

  test('both choices are real buttons', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'I use a screen reader' }).click();
    await expect(page.getByRole('heading', { name: /Math for students/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Read aloud: off' })).toBeVisible();
  });

  test('the welcome is shown once, even after work is cleared', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Start, and read aloud to me' }).click();
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await expect(page.getByRole('heading', { name: /Math for students/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Welcome to Glance' })).toHaveCount(0);
  });
});

test.describe('@smoke microphone', () => {
  test('the microphone is explained before the browser asks', async ({ page }) => {
    // The browser's own prompt waits for the student, so the request does too.
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => new Promise<MediaStream>(() => {});
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Try a sample problem' }).click();
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
    await page.keyboard.press('s');
    await page.getByTestId('record-button').click();
    await expect(assertive(page)).toContainText(MIC_EXPLAINED);
  });
});
