import { expect, test } from '@playwright/test';

test('live board adds only new lines and stops capturing on request', async ({ page, browserName }) => {
  await page.addInitScript((useVideoStub) => {
    if (useVideoStub) {
      // The Windows WebKit build does not deliver frames from a canvas stream.
      // Stub the camera boundary while letting the app encode and upload JPEG.
      Object.defineProperties(HTMLVideoElement.prototype, {
        videoWidth: { get: () => 80 },
        videoHeight: { get: () => 40 },
        play: { value: async () => {} },
        srcObject: { value: null, writable: true },
      });
      Object.defineProperty(CanvasRenderingContext2D.prototype, 'drawImage', {
        value: function (this: CanvasRenderingContext2D) {
          this.fillRect(0, 0, 80, 40);
        },
      });
    }
    const mediaDevices = {
      getUserMedia: async () => {
        if (useVideoStub) return { getTracks: () => [], getVideoTracks: () => [] };
        const canvas = document.createElement('canvas');
        canvas.width = 80;
        canvas.height = 40;
        const context = canvas.getContext('2d')!;
        context.fillRect(0, 0, 80, 40);
        const stream = canvas.captureStream(10);
        requestAnimationFrame(() => context.fillRect(0, 0, 40, 20));
        return stream;
      },
    };
    Object.defineProperty(navigator, 'mediaDevices', { value: mediaDevices });
  }, browserName === 'webkit');
  let captures = 0;
  await page.route('**/api/capture', async (route) => {
    captures += 1;
    const equations = captures === 1 ? ['2x+3=11'] : ['2 x + 3 = 11', 'x=4'];
    await route.fulfill({
      json: {
        instructions: '', diagrams: [], warnings: [],
        lines: equations.map((latex, i) => ({
          id: 'L' + i, latex, valid: true, confidence: 1, intent_notes: '',
        })),
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Capture a problem' }).click();
  await page.getByRole('button', { name: 'Live board' }).click();
  await expect(page.getByRole('heading', { name: 'Live board' })).toBeFocused();
  await page.clock.install();
  await page.getByRole('button', { name: 'Start reading' }).click();
  const board = page.getByRole('region', { name: 'Board lines' });
  await expect.poll(async () => ({
    count: await board.getByRole('listitem').count(),
    error: await page.getByTestId('live-assertive').textContent(),
  })).toEqual({ count: 1, error: '' });
  await expect(page.getByTestId('live-polite')).toContainText('1 new line.');

  await expect(page.getByRole('button', { name: 'Discard board line 1' })).toContainText('×');
  await page.getByRole('button', { name: 'Discard board line 1' }).click();
  await expect(board.getByRole('listitem')).toHaveCount(0);
  await expect(page.getByTestId('live-polite')).toContainText('Discarded board line 1. It will not be read again.');

  await page.clock.fastForward(7_100);
  await expect(board.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByTestId('live-polite')).toContainText('1 new line.');
  await expect(board.getByRole('group', { name: 'Board line 1' })).toBeVisible();

  await page.getByRole('button', { name: 'Stop reading' }).click();
  await page.clock.fastForward(20_000);
  expect(captures).toBe(2);
  await expect(page.getByRole('button', { name: 'Start reading' })).toBeFocused();
  await expect(page.getByTestId('live-polite')).toHaveText('Live board stopped.');
});
