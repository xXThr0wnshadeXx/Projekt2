import { expect, test, type Page } from '@playwright/test';
import { HOLD_MS } from '../../frontend/src/components/RecordButton';

type MicrophoneWindow = Window & {
  testMicrophone: { requests: number; starts: number; releases: number; grant: () => void };
};

async function mockMicrophone(page: Page, delayPermission = false) {
  await page.addInitScript((delay) => {
    const mic = { requests: 0, starts: 0, releases: 0, grant: () => {} };
    (window as MicrophoneWindow).testMicrophone = mic;
    const stream = { getTracks: () => [{ stop: () => { mic.releases += 1; } }] };

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: () => {
          mic.requests += 1;
          if (!delay) return Promise.resolve(stream);
          return new Promise((resolve) => { mic.grant = () => resolve(stream); });
        },
      },
    });

    class FakeRecorder {
      static isTypeSupported = () => true;
      readonly mimeType: string;
      state = 'inactive';
      ondataavailable?: (event: { data: Blob }) => void;
      onstop?: () => void;

      constructor(_stream: unknown, options: { mimeType: string }) {
        this.mimeType = options.mimeType;
      }

      start() {
        mic.starts += 1;
        this.state = 'recording';
      }

      stop() {
        this.state = 'inactive';
        queueMicrotask(() => {
          this.ondataavailable?.({ data: new Blob(['fake audio']) });
          this.onstop?.();
        });
      }
    }

    Object.defineProperty(window, 'MediaRecorder', { value: FakeRecorder });
  }, delayPermission);
}

async function openScratchpad(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample problem' }).click();
  await page.getByRole('button', { name: 'Start working' }).click();
  await expect(page.getByRole('heading', { name: 'Your work', exact: true })).toBeFocused();
}

test.describe('@smoke voice recording lifecycle', () => {
  for (const capped of [false, true]) {
    test(`${capped ? 'capped' : 'manually stopped'} recordings reach readback and release the microphone`, async ({ page, isMobile }) => {
      await mockMicrophone(page);
      let uploads = 0;
      await page.route('**/api/transcribe', (route) => {
        uploads += 1;
        return route.fulfill({ json: { text: 'two x equals eight' } });
      });
      await page.route('**/api/spoken-to-latex', (route) => route.fulfill({ json: {
        latex: '2x = 8', readback: '2 x equals 8', valid: true, ambiguous: false,
        clarifying_question: null, alternatives: [],
      } }));
      await openScratchpad(page);
      await page.clock.install();
      const byButton = capped || isMobile;
      if (byButton) await page.getByRole('button', { name: 'Record a line' }).click();
      else {
        await page.keyboard.down('Space');
        // Space has to be held, not tapped, before recording starts.
        await page.clock.fastForward(HOLD_MS + 50);
      }
      const stop = page.getByRole('button', { name: 'Stop recording' });
      await expect(stop).toBeVisible();
      await page.clock.fastForward(capped ? 28_100 : 400);
      if (!capped) {
        if (byButton) await stop.click();
        else await page.keyboard.up('Space');
      }
      // Let the upload's own deadline timers run in real time again.
      await page.clock.resume();

      await expect(page.getByRole('region', { name: 'Confirm your line' })).toContainText('2 x equals 8');
      expect(uploads).toBe(1);
      expect(await page.evaluate(() => (window as MicrophoneWindow).testMicrophone.releases)).toBe(1);
    });
  }

  test('releasing Space before permission arrives does not start recording', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Touch devices use tap-to-toggle.');
    await mockMicrophone(page, true);
    await openScratchpad(page);

    await page.keyboard.down('Space');
    await expect.poll(() => page.evaluate(() => (window as MicrophoneWindow).testMicrophone.requests)).toBe(1);
    await page.keyboard.up('Space');
    await page.evaluate(() => (window as MicrophoneWindow).testMicrophone.grant());

    await expect.poll(() => page.evaluate(() => (window as MicrophoneWindow).testMicrophone.releases)).toBe(1);
    expect(await page.evaluate(() => (window as MicrophoneWindow).testMicrophone.starts)).toBe(0);
    await expect(page.getByRole('button', { name: 'Record a line' })).toBeVisible();
  });

  // The one page (#240) has no way to leave the scratchpad, so this case
  // cannot happen; a grant that arrives after recording stopped is covered by
  // the test above.
  test.skip('leaving the scratchpad releases a microphone granted after navigation', async ({ page }) => {
    await mockMicrophone(page, true);
    await openScratchpad(page);

    await page.getByRole('button', { name: 'Record a line' }).click();
    await expect.poll(() => page.evaluate(() => (window as MicrophoneWindow).testMicrophone.requests)).toBe(1);
    await page.getByRole('button', { name: 'Leave and read the problem again' }).click();
    await expect(page.getByRole('heading', { name: 'Your problem' })).toBeVisible();
    await page.evaluate(() => (window as MicrophoneWindow).testMicrophone.grant());

    await expect.poll(() => page.evaluate(() => (window as MicrophoneWindow).testMicrophone.releases)).toBe(1);
    expect(await page.evaluate(() => (window as MicrophoneWindow).testMicrophone.starts)).toBe(0);
  });
});
