// Voice-guided camera — issue #198.
//
// A student who cannot see the preview is told how to move the phone, and the
// photo is taken for them once the whole page is in view. Nothing is uploaded
// until then.

import { test, expect, type Page } from '@playwright/test';
import { analyseFrame, type Box } from '../../frontend/src/camera/framing';
import { FramingGuide } from '../../frontend/src/camera/guide';

/** A dark desk with a white page at `page` (fractions of the frame). */
function frame(page: Box | null, { w = 160, h = 120, desk = 60, paper = 235 } = {}) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const inside = page && x >= page.left * w && x < page.right * w && y >= page.top * h && y < page.bottom * h;
      const v = inside ? paper : desk;
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  }
  return analyseFrame(data, w, h);
}

test.describe('@smoke framing a worksheet', () => {
  test('says how to move the phone, from the picture alone', () => {
    expect(frame({ left: 0.15, top: 0.1, right: 0.85, bottom: 0.9 }).guidance).toBe('good');
    expect(frame({ left: 0, top: 0.1, right: 0.6, bottom: 0.9 }).guidance).toBe('move-left');
    expect(frame({ left: 0.4, top: 0.1, right: 1, bottom: 0.9 }).guidance).toBe('move-right');
    expect(frame({ left: 0.15, top: 0, right: 0.85, bottom: 0.7 }).guidance).toBe('move-up');
    expect(frame({ left: 0.15, top: 0.3, right: 0.85, bottom: 1 }).guidance).toBe('move-down');
    expect(frame({ left: 0, top: 0.1, right: 1, bottom: 0.9 }).guidance).toBe('further');
    expect(frame({ left: 0.4, top: 0.4, right: 0.6, bottom: 0.6 }).guidance).toBe('closer');
    expect(frame(null).guidance).toBe('no-page');
    expect(frame({ left: 0.15, top: 0.1, right: 0.85, bottom: 0.9 }, { desk: 5, paper: 30 }).guidance).toBe('too-dark');
  });

  test('the guide tone pans toward the way to move', () => {
    expect(frame({ left: 0, top: 0.1, right: 0.6, bottom: 0.9 }).pan).toBeLessThan(0);
    expect(frame({ left: 0.4, top: 0.1, right: 1, bottom: 0.9 }).pan).toBeGreaterThan(0);
    expect(frame({ left: 0.15, top: 0.1, right: 0.85, bottom: 0.9 }).centred).toBeGreaterThan(0.9);
  });

  test('speaks only when the advice changes, and takes the photo after a steady run', () => {
    let t = 0;
    const said: string[] = [];
    let ready = 0;
    const guide = new FramingGuide({ say: (s) => said.push(s), onReady: () => (ready += 1), now: () => t });
    const left = frame({ left: 0, top: 0.1, right: 0.6, bottom: 0.9 });
    const good = frame({ left: 0.15, top: 0.1, right: 0.85, bottom: 0.9 });

    for (let i = 0; i < 5; i += 1) { guide.frame(left); t += 300; }
    expect(said).toEqual(['Move the phone left.']);

    guide.frame(good); t += 300;
    expect(said.at(-1)).toBe('Hold still.');
    // A wobble resets the count.
    guide.frame(left); t += 300;
    for (let i = 0; i < 3; i += 1) { guide.frame(good); t += 300; }
    expect(ready).toBe(0);
    guide.frame(good);
    expect(ready).toBe(1);
    guide.frame(good);
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

  test('steers the phone, then takes and sends the photo by itself', async ({ page }) => {
    let uploads = 0;
    await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true } }));
    await page.route('**/api/capture', (r) => {
      uploads += 1;
      return r.fulfill({ json: {
        instructions: '', diagrams: [], warnings: [],
        lines: [{ id: 'L1', latex: '2x + 3 = 11', confidence: 1, intent_notes: '', valid: true }],
      } });
    });
    await fakeCamera(page, { left: 0.15, top: 0.1, right: 0.85, bottom: 0.9 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.getByRole('button', { name: 'Take a photo' }).click();

    await expect(page.getByTestId('live-polite')).toContainText('I will tell you how to move the phone');
    expect(uploads).toBe(0);
    await expect(page.getByRole('heading', { name: 'Your worksheet', exact: true })).toBeVisible({ timeout: 15000 });
    expect(uploads).toBe(1);
  });

  test('tells the student which way to move when the page is cut off', async ({ page }) => {
    let uploads = 0;
    await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true } }));
    await page.route('**/api/capture', (r) => { uploads += 1; return r.abort(); });
    await fakeCamera(page, { left: 0, top: 0.1, right: 0.55, bottom: 0.9 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.getByRole('button', { name: 'Take a photo' }).click();

    await expect(page.getByTestId('live-polite')).toHaveText('Move the phone left.', { timeout: 10000 });
    await page.waitForTimeout(1500);
    expect(uploads).toBe(0);
  });
});
