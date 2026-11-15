// The natural voice — issue #182.
//
// When the server offers a natural voice, the app speaks with it; on any
// problem it falls back to the browser's voice for that sentence, so the
// student is never left in silence. Where the server offers none, nothing
// changes.

import { test, expect, type Page } from '@playwright/test';

type Recorder = Window & { browserSaid: string[]; played: string[] };

/** Record both voices instead of playing them. */
async function recordVoices(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Recorder;
    w.browserSaid = [];
    w.played = [];
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: class { constructor(readonly text: string) {} },
    });
    Object.defineProperty(window, 'speechSynthesis', {
      value: { cancel: () => {}, speak: (u: { text: string }) => w.browserSaid.push(u.text) },
    });
    class FakeAudio {
      onended: (() => void) | null = null;
      constructor(readonly src: string) {}
      play() {
        w.played.push(this.src);
        window.setTimeout(() => this.onended?.(), 20);
        return Promise.resolve();
      }
      pause() {}
    }
    Object.defineProperty(window, 'Audio', { value: FakeAudio });
  });
}

/** The server: health says whether a voice exists; /api/speak is recorded. */
async function server(page: Page, { voice, speakStatus = 200 }: { voice: boolean; speakStatus?: number }) {
  const requests: { text: string; voice: string; speed: number }[] = [];
  await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true, voice } }));
  await page.route('**/api/speak', (r) => {
    requests.push(r.request().postDataJSON());
    return speakStatus === 200
      ? r.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.from('ID3fake') })
      : r.fulfill({ status: speakStatus, json: { error: { code: 'MODEL_ERROR', message: 'down' } } });
  });
  return requests;
}

const browserSaid = (page: Page) => page.evaluate(() => (window as unknown as Recorder).browserSaid);
const played = (page: Page) => page.evaluate(() => (window as unknown as Recorder).played);

async function turnOnReadingAloud(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Read aloud: off' }).click();
}

test.describe('@smoke the natural voice', () => {
  test('speaks with the natural voice when the server offers one', async ({ page }) => {
    await recordVoices(page);
    const requests = await server(page, { voice: true });
    await turnOnReadingAloud(page);

    await expect.poll(() => requests.map((r) => r.text)).toContain(
      'Reading aloud is on. Glance will speak everything it tells you.',
    );
    expect(requests[0]).toMatchObject({ voice: 'coral', speed: 1 });
    await expect.poll(() => played(page)).toHaveLength(1);
    expect(await browserSaid(page)).toEqual([]);
  });

  test('falls back to the browser voice for that sentence if the natural one fails', async ({ page }) => {
    await recordVoices(page);
    await server(page, { voice: true, speakStatus: 502 });
    await turnOnReadingAloud(page);

    await expect.poll(() => browserSaid(page)).toContain(
      'Reading aloud is on. Glance will speak everything it tells you.',
    );
    expect(await played(page)).toEqual([]);
  });

  test('never asks for it where the server has no natural voice', async ({ page }) => {
    await recordVoices(page);
    const requests = await server(page, { voice: false });
    await turnOnReadingAloud(page);

    await expect.poll(() => browserSaid(page)).toContain(
      'Reading aloud is on. Glance will speak everything it tells you.',
    );
    expect(requests).toEqual([]);
  });

  test('the chosen voice and speed are used, and Test voice speaks a sample', async ({ page }) => {
    await recordVoices(page);
    const requests = await server(page, { voice: true });
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();

    await page.getByRole('radio', { name: 'Sage: calm' }).check();
    await page.getByRole('radio', { name: 'Slower' }).check();
    await page.getByRole('button', { name: 'Test voice' }).click();

    await expect.poll(() => requests.at(-1)).toMatchObject({ voice: 'sage', speed: 0.85 });
    expect(requests.at(-1)?.text).toContain('This is how Glance sounds.');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('glance.settings.v1') ?? '{}'));
    expect(stored).toMatchObject({ voice: 'sage', speechRate: 0.85 });
  });

  test('a phrase heard before is played from the cache, not fetched again', async ({ page }) => {
    await recordVoices(page);
    const requests = await server(page, { voice: true });
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    const test = page.getByRole('button', { name: 'Test voice' });
    await test.click();
    await expect.poll(() => played(page)).toHaveLength(1);
    await test.click();
    await expect.poll(() => played(page)).toHaveLength(2);
    expect(requests.filter((r) => r.text.startsWith('This is how Glance sounds.'))).toHaveLength(1);
  });
});
