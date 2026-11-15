// Open it and it talks — issue #200.
//
// A student arriving alone, with or without a screen reader, must be able to
// start with no one helping: one question on the first visit, the first
// gesture speaks it aloud, and nothing gets in the way of Tab.

import { test, expect, type Page } from '@playwright/test';

const polite = (page: Page) => page.getByTestId('live-polite');

type SpeechWindow = Window & { said: string[] };

/** Record what the app's own voice says, instead of playing it. */
async function recordSpeech(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as SpeechWindow;
    w.said = [];
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: class { constructor(readonly text: string) {} },
    });
    Object.defineProperty(window, 'speechSynthesis', {
      value: { cancel: () => {}, speak: (u: { text: string }) => w.said.push(u.text) },
    });
  });
}

/** Open Glance and wait until it is ready for a key, as a student would. */
async function open(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Math for students who are blind or have low vision' })).toBeFocused();
}

const said = (page: Page) => page.evaluate(() => (window as unknown as SpeechWindow).said);

test.describe('@smoke a first visit with no one helping', () => {
  test('asks one question, without adding a Tab stop', async ({ page }) => {
    await open(page);
    await expect(page.getByTestId('welcome')).toContainText('Press Y to hear Glance speak to you');
    await expect(polite(page)).toContainText('Press Y to hear Glance speak to you, or N if you use a screen reader.');
    // No Tab stop was added: talk.spec.ts "the first screen" checks that Tab
    // still goes straight to Capture a problem.
    await expect(page.getByTestId('welcome').locator('button, a, [tabindex]')).toHaveCount(0);
  });

  test('the first tap says the question aloud, once, even with reading aloud off', async ({ page }) => {
    await recordSpeech(page);
    await open(page);
    // Moving around with Tab, as a screen-reader user does, says nothing.
    await page.keyboard.press('Tab');
    expect(await said(page)).toEqual([]);

    await page.mouse.click(5, 300);
    await expect.poll(() => said(page)).toEqual([
      'Welcome to Glance. Press Y to hear Glance speak to you, or N if you use a screen reader. Then press C to point your camera at a worksheet, or S to try a sample problem.',
    ]);
    await page.mouse.click(5, 300);
    expect(await said(page)).toHaveLength(1);
  });

  test('Y turns on the voice, and that answer is spoken', async ({ page }) => {
    await recordSpeech(page);
    await open(page);
    await page.keyboard.press('y');

    await expect(page.getByRole('button', { name: 'Read aloud: on' })).toBeVisible();
    await expect(page.getByTestId('welcome')).toHaveCount(0);
    await expect.poll(() => said(page)).toContain(
      'Okay, I will speak to you. Then press C to point your camera at a worksheet, or S to try a sample problem.',
    );
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('glance.settings.v1') ?? '{}'));
    expect(stored.selfVoicing).toBe(true);
  });

  test('N leaves the talking to the screen reader, and the question is not asked again', async ({ page }) => {
    await recordSpeech(page);
    await open(page);
    await page.keyboard.press('n');

    await expect(polite(page)).toHaveText(
      'Okay, your screen reader will do the talking. Then press C to point your camera at a worksheet, or S to try a sample problem.',
    );
    await expect(page.getByRole('button', { name: 'Read aloud: off' })).toBeVisible();
    expect(await said(page)).toEqual([]);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Math for students who are blind or have low vision' })).toBeFocused();
    await expect(page.getByTestId('welcome')).toHaveCount(0);
    await expect(polite(page)).not.toContainText('Press Y');
  });

  test('S opens the sample, and a returning student can go back with B', async ({ page }) => {
    await open(page);
    await page.keyboard.press('n');
    await page.keyboard.press('s');
    await expect(page.getByRole('heading', { name: 'Your problem' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Math for students who are blind or have low vision' })).toBeFocused();
    await expect(polite(page)).toContainText('Welcome back.');
    await expect(polite(page)).toContainText('Press B to go back to your problem');
    await page.keyboard.press('b');
    await expect(page.getByRole('heading', { name: 'Your problem' })).toBeVisible();
  });
});
