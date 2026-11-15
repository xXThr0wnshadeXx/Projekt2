// Voice-guided camera: issues #198 and #242.
//
// A student who cannot see the preview is told how to move the phone, and the
// photo is taken for them once the whole page is in view. The framing answers
// come from OpenAI through /api/frame (stubbed here); nothing is analysed on the
// device. The final photo is sent only once the page is well framed.

import { test, expect, type Page } from '@playwright/test';
import { asGuidance, type FrameReport, type Guidance } from '../../frontend/src/camera/framing';
import { FramingGuide } from '../../frontend/src/camera/guide';

const report = (guidance: Guidance): FrameReport => ({ guidance });

test.describe('@smoke framing a worksheet', () => {
  test('only known guidance values from the model are accepted', () => {
    expect(asGuidance('move-left')).toBe('move-left');
    expect(asGuidance('good')).toBe('good');
    expect(asGuidance('the answer is 4')).toBeNull();
    expect(asGuidance(undefined)).toBeNull();
  });

  test('the guide tone pans toward the way to move', () => {
    const tones: Array<[number, number]> = [];
    const guide = new FramingGuide({ say: () => {}, onReady: () => {}, tone: (p, c) => tones.push([p, c]) });
    guide.frame(report('move-left'));
    guide.frame(report('move-right'));
    guide.frame(report('good'));
    expect(tones[0][0]).toBeLessThan(0);
    expect(tones[1][0]).toBeGreaterThan(0);
    expect(tones[2][1]).toBeGreaterThan(tones[0][1]);
  });

  test('speaks only when the advice changes, and takes the photo after a steady run', () => {
    let t = 0;
    const said: string[] = [];
    let ready = 0;
    const guide = new FramingGuide({
      say: (s) => said.push(s), onReady: () => (ready += 1), now: () => t, steadyFrames: 4,
    });

    for (let i = 0; i < 5; i += 1) { guide.frame(report('move-left')); t += 300; }
    expect(said).toEqual(['Move the phone left.']);

    guide.frame(report('good')); t += 300;
    expect(said.at(-1)).toBe('Hold still.');
    // A wobble resets the count.
    guide.frame(report('move-left')); t += 300;
    for (let i = 0; i < 3; i += 1) { guide.frame(report('good')); t += 300; }
    expect(ready).toBe(0);
    guide.frame(report('good'));
    expect(ready).toBe(1);
    guide.frame(report('good'));
    expect(ready).toBe(1);
  });
});

/** Replace the camera with a canvas showing a page on a desk. */
async function fakeCamera(page: Page, box: Box) {
  await page.addInitScript((b) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const draw = () => {
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#3c3c3c';
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(b.left * 640, b.top * 480, (b.right - b.left) * 640, (b.bottom - b.top) * 480);
      ctx.fillStyle = '#111';
      ctx.font = '40px serif';
      ctx.fillText('2x + 3 = 11', b.left * 640 + 40, b.top * 480 + 120);
    };
    draw();
    window.setInterval(draw, 100);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: async () => canvas.captureStream(10) },
    });
  }, box);
}

test.describe('@smoke the guided camera', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'A canvas stands in for the camera in Chromium.');

  const framed = { left: 0.15, top: 0.1, right: 0.85, bottom: 0.9 };

  test('steers the phone, then takes and sends the photo by itself', async ({ page }) => {
    let uploads = 0;
    let frames = 0;
    let inFlight = 0;
    let overlap = false;
    await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true } }));
    await page.route('**/api/frame', async (r) => {
      frames += 1;
      inFlight += 1;
      if (inFlight > 1) overlap = true;
      await new Promise((done) => setTimeout(done, 100));
      inFlight -= 1;
      expect(r.request().headers()['content-type']).toBe('image/jpeg');
      return r.fulfill({ json: { guidance: 'good', reason: null } });
    });
    await page.route('**/api/capture', (r) => {
      uploads += 1;
      return r.fulfill({ json: {
        instructions: '', diagrams: [], warnings: [],
        lines: [{ id: 'L1', latex: '2x + 3 = 11', confidence: 1, intent_notes: '', valid: true }],
      } });
    });
    await fakeCamera(page, framed);
    await page.goto('/');
    await page.getByRole('button', { name: 'Capture a problem', exact: true }).click();
    await page.getByRole('button', { name: 'Take a photo' }).click();

    await expect(page.getByTestId('live-polite')).toContainText('I will tell you how to move the phone');
    expect(uploads).toBe(0);
    await expect(page.getByRole('heading', { name: 'Your problem', exact: true })).toBeVisible({ timeout: 20000 });
    expect(uploads).toBe(1);
    expect(frames).toBeGreaterThanOrEqual(2);
    expect(overlap).toBe(false);
  });

  test('tells the student which way to move when the model says so', async ({ page }) => {
    let uploads = 0;
    await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true } }));
    await page.route('**/api/frame', (r) => r.fulfill({ json: { guidance: 'move-left', reason: 'page cut off at the left' } }));
    await page.route('**/api/capture', (r) => { uploads += 1; return r.abort(); });
    await fakeCamera(page, { left: 0, top: 0.1, right: 0.55, bottom: 0.9 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Capture a problem', exact: true }).click();
    await page.getByRole('button', { name: 'Take a photo' }).click();

    await expect(page.getByTestId('live-polite')).toHaveText('Move the phone left.', { timeout: 10000 });
    await page.waitForTimeout(1500);
    expect(uploads).toBe(0);
  });

  test('falls back to a plain Take a photo when the framing check fails', async ({ page }) => {
    let uploads = 0;
    await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true } }));
    await page.route('**/api/frame', (r) => r.fulfill({
      status: 502, json: { error: { code: 'MODEL_ERROR', message: 'nope' } },
    }));
    await page.route('**/api/capture', (r) => {
      uploads += 1;
      return r.fulfill({ json: {
        instructions: '', diagrams: [], warnings: [],
        lines: [{ id: 'L1', latex: '2x + 3 = 11', confidence: 1, intent_notes: '', valid: true }],
      } });
    });
    await fakeCamera(page, framed);
    await page.goto('/');
    await page.getByRole('button', { name: 'Capture a problem', exact: true }).click();
    await page.getByRole('button', { name: 'Take a photo' }).click();

    await expect(page.getByTestId('live-polite')).toContainText('I cannot check the framing right now', { timeout: 15000 });
    expect(uploads).toBe(0);
    // Not a dead end: the student can still take the photo themselves.
    await page.getByRole('button', { name: 'Take a photo' }).click();
    await expect(page.getByRole('heading', { name: 'Your problem', exact: true })).toBeVisible({ timeout: 15000 });
    expect(uploads).toBe(1);
  });
});
