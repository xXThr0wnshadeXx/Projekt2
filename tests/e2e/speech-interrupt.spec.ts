// Moving to a new line cuts off whatever was still being read about the old
// one, so pressing the arrows quickly never stacks up a queue of old lines.

import { test, expect } from '@playwright/test';

test('@smoke each arrow press cuts off the line before it', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    const log: string[] = [];
    (window as unknown as { __log: string[] }).__log = log;
    const engine = {
      speaking: false,
      pending: false,
      paused: false,
      speak: (u: { text: string }) => log.push(`speak:${u.text}`),
      cancel: () => log.push('cancel'),
      pause() {},
      resume() {},
      getVoices: () => [],
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(window, 'speechSynthesis', { value: engine, configurable: true });
    // Some test browsers have no speech engine at all, so stand in for the
    // utterance too.
    if (!('SpeechSynthesisUtterance' in window)) {
      (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance =
        function (this: { text: string }, text: string) {
          this.text = text;
        };
    }
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Get started' })).toBeVisible();
  await page.evaluate(() => (window as unknown as { __log: string[] }).__log.splice(0));

  // Three quick presses, well inside the follow-up window that used to queue.
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowDown');

  const log = await page.evaluate(() => (window as unknown as { __log: string[] }).__log);
  const speaks = log.filter((l) => l.startsWith('speak:'));
  expect(speaks.length).toBe(3);
  // Every line is preceded by a cancel of whatever came before it.
  for (let i = 0; i < log.length; i += 1) {
    if (log[i].startsWith('speak:')) expect(log[i - 1]).toBe('cancel');
  }
});
