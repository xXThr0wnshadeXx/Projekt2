// Moving to a new line cuts off whatever was still being read about the old
// one, so pressing the arrows quickly never stacks up a queue of old lines.

import { test, expect } from '@playwright/test';

test('@smoke each arrow press cuts off the line before it', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    // The app's own voice is off by default; this is about what it says.
    window.localStorage.setItem('glance.settings.v1', JSON.stringify({ mode: 'homework', selfVoicing: true, textScale: 125 }));
    const log: string[] = [];
    (window as unknown as { __log: string[] }).__log = log;
    const engine = {
      speaking: false,
      pending: false,
      paused: false,
      // Behaves like a real engine: busy from speak() until cancelled. The
      // app only cancels while something is being said.
      speak(this: { speaking: boolean }, u: { text: string }) {
        log.push(`speak:${u.text}`);
        this.speaking = true;
      },
      cancel(this: { speaking: boolean }) {
        log.push('cancel');
        this.speaking = false;
      },
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
  await expect(page.getByRole('button', { name: 'Try a sample problem' })).toBeVisible();
  // The welcome is announced on a timer after load. Let it be spoken before
  // clearing the log, or it lands among the arrow presses.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __log: string[] }).__log.length)).toBeGreaterThan(0);
  await page.evaluate(() => (window as unknown as { __log: string[] }).__log.splice(0));

  // Three quick presses, well inside the follow-up window that used to queue.
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowDown');

  const log = await page.evaluate(() => (window as unknown as { __log: string[] }).__log);
  const speaks = log.filter((l) => l.startsWith('speak:'));
  expect(speaks.length).toBe(3);
  // Every line after the first cuts off the one before it. Nothing was being
  // said before the first, so there is nothing to cut off there.
  const at = log.map((l, i) => (l.startsWith('speak:') ? i : -1)).filter((i) => i >= 0);
  for (const i of at.slice(1)) expect(log[i - 1]).toBe('cancel');
});
