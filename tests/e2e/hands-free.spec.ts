// Hands-free dictation — issue #183.
//
// With hands-free on, a student just talks: each utterance is heard, read
// back, and saved when they say "yes", with no keyboard at all.

import { test, expect, type Page } from '@playwright/test';
import { SpeechGate } from '../../frontend/src/audio/handsFree';

test.describe('@smoke hands-free dictation', () => {
  test('notices when speech starts and ends, ignoring a quiet room', () => {
    const gate = new SpeechGate(150, 900);
    let t = 0;
    const run = (level: number, ms: number) => {
      const events: string[] = [];
      for (let end = t + ms; t < end; t += 50) {
        const e = gate.feed(level, t);
        if (e) events.push(e);
      }
      return events;
    };
    expect(run(0.005, 1000)).toEqual([]);          // background hum
    expect(run(0.3, 100)).toEqual([]);             // a click is too short
    expect(run(0.005, 300)).toEqual([]);
    expect(run(0.3, 600)).toEqual(['start']);      // speech
    expect(run(0.005, 500)).toEqual([]);           // a pause between words
    expect(run(0.3, 300)).toEqual([]);
    expect(run(0.005, 1000)).toEqual(['end']);     // they stopped
  });
});

/** A fake microphone: a tone that `window.talk(true|false)` switches on and off. */
async function fakeMicrophone(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: async () => {
          const ctx = new AudioContext();
          await ctx.resume();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          gain.gain.value = 0;
          const out = ctx.createMediaStreamDestination();
          osc.connect(gain).connect(out);
          osc.start();
          (window as unknown as { talk: (on: boolean) => void }).talk = (on) => {
            gain.gain.value = on ? 0.6 : 0;
          };
          return out.stream;
        },
      },
    });
  });
}

const CLEAR = {
  latex: '2x = 8', ambiguous: false, clarifying_question: null, alternatives: [],
  readback: '2 x equals 8', valid: true,
};

async function talk(page: Page, ms = 900) {
  await page.evaluate(() => (window as unknown as { talk: (on: boolean) => void }).talk(true));
  await page.waitForTimeout(ms);
  await page.evaluate(() => (window as unknown as { talk: (on: boolean) => void }).talk(false));
}

test.describe('@smoke hands-free in the scratchpad', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'The fake microphone needs Chromium.');

  test('just talking writes a line, "yes" saves it, and "stop listening" stops', async ({ page }) => {
    const heard = ['two x equals eight', 'yes', 'stop listening'];
    let transcribed = 0;
    await fakeMicrophone(page);
    await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true } }));
    await page.route('**/api/diff', (r) => r.abort());
    await page.route('**/api/validate', (r) => r.fulfill({ json: { valid: true } }));
    await page.route('**/api/transcribe', (r) => r.fulfill({ json: { text: heard[transcribed++] ?? '' } }));
    await page.route('**/api/spoken-to-latex', (r) => r.fulfill({ json: CLEAR }));

    await page.goto('/');
    await page.getByRole('button', { name: 'Try a sample problem' }).click();
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Start working' }).click();

    await page.getByRole('button', { name: 'Hands-free: off' }).click();
    await expect(page.getByTestId('listening')).toBeVisible();
    await expect(page.getByTestId('live-polite')).toContainText('Hands-free is on. Just talk');

    await talk(page);
    await expect(page.getByTestId('live-polite')).toContainText('2 x equals 8', { timeout: 10000 });
    expect(transcribed).toBe(1);

    await talk(page);
    await expect(page.getByRole('group', { name: 'Your line 1', exact: true })).toBeVisible({ timeout: 10000 });

    await talk(page);
    await expect(page.getByRole('button', { name: 'Hands-free: off' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('listening')).toHaveCount(0);
    expect(transcribed).toBe(3);
  });
});
