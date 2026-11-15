import { test, expect, type Page } from '@playwright/test';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const captured = {
  instructions: 'Solve for x.',
  lines: [{ id: 'L1', latex: '2x + 3 = 11', confidence: 1, intent_notes: '', valid: true }],
  diagrams: [], warnings: [],
};

async function openCapture(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Capture a problem', exact: true }).click();
  await page.clock.install();
}

test.describe('@smoke stalled browser requests', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/health', (route) => route.fulfill({ json: { ok: true } }));
    await page.addInitScript(() => localStorage.clear());
  });

  test('capture announces a timeout, restores controls and allows a manual retry', async ({ page }) => {
    let attempts = 0;
    await page.route('**/api/capture', (route) => {
      attempts += 1;
      if (attempts === 1) return; // Connection never returns headers.
      return route.fulfill({ json: captured });
    });
    await openCapture(page);
    const file = { name: 'problem.png', mimeType: 'image/png', buffer: PNG };
    await page.locator('input[type=file]').setInputFiles(file);
    await expect.poll(() => attempts).toBe(1);
    await expect(page.getByRole('button', { name: 'Upload a file' })).toBeDisabled();
    await page.clock.fastForward(12_100);
    await expect(page.getByTestId('live-assertive')).toContainText('took too long');
    await expect(page.getByRole('button', { name: 'Upload a file' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Back to the start' })).toBeEnabled();
    expect(attempts).toBe(1); // Never spend credit on an automatic retry.

    await page.locator('input[type=file]').setInputFiles(file);
    await expect(page.getByRole('heading', { name: 'Your problem', exact: true })).toBeVisible();
    expect(attempts).toBe(2);
  });

  test('a stalled PDF page returns to the page picker', async ({ page }) => {
    await page.route('**/api/pdf/pages', (route) => route.fulfill({ json: { pages: 3 } }));
    let requested = false;
    await page.route('**/api/pdf/page', () => { requested = true; });
    await openCapture(page);
    await page.locator('input[type=file]').setInputFiles({
      name: 'worksheet.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 stub'),
    });
    await page.getByRole('button', { name: 'Open this page' }).click();
    await expect.poll(() => requested).toBe(true);
    await page.clock.fastForward(12_100);
    await expect(page.getByTestId('live-assertive')).toContainText('took too long');
    await expect(page.getByRole('button', { name: 'Open this page' })).toBeEnabled();
    await expect(page.getByLabel('Which page is your problem on?')).toHaveValue('1');
  });

  test('stalled interpretation and validation still allow a typed line to be confirmed', async ({ page }) => {
    let spoken = 0;
    let validation = 0;
    await page.route('**/api/spoken-to-latex', () => { spoken += 1; });
    await page.route('**/api/validate', () => { validation += 1; });
    await page.route('**/api/diff', (route) => route.abort());
    await page.goto('/');
    await page.getByRole('button', { name: 'Try a sample problem' }).click();
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Start working' }).click();
    await page.clock.install();
    await page.getByLabel('Or type your line').fill('2x = 8');
    await page.getByLabel('Or type your line').press('Enter');
    await expect.poll(() => spoken).toBe(1);
    await page.clock.fastForward(6_100);
    await expect.poll(() => validation).toBe(1);
    await page.clock.fastForward(3_100);
    await expect(page.getByTestId('live-polite')).toContainText('I read: 2 x equals 8');
    await expect(page.getByRole('region', { name: 'Your lines' })).toContainText('Nothing yet');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Your line 1', exact: true })).toBeVisible();
    expect(spoken).toBe(1);
  });

  test('the deadline also covers a body that stalls after headers arrive', async ({ page }) => {
    await page.goto('/');
    // A streaming fetch has resolved, but JSON has not arrived. Aborting fetch
    // must still abort consumption; a header-only deadline misses this case.
    const result = await page.evaluate(async () => {
      const apiPath = '/src/api.ts';
      const api = await import(/* @vite-ignore */ apiPath);
      const originalFetch = window.fetch;
      const originalTimeout = window.setTimeout;
      window.setTimeout = ((callback: TimerHandler, ms?: number, ...args: any[]) =>
        originalTimeout(callback, ms === 5_000 ? 25 : ms, ...args)) as typeof window.setTimeout;
      window.fetch = async (_input, init) => new Response(new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener('abort', () =>
            controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
        },
      }));
      try {
        await api.health();
        return 'unexpected success';
      } catch (error: any) {
        return error.code;
      } finally {
        window.fetch = originalFetch;
        window.setTimeout = originalTimeout;
      }
    });
    expect(result).toBe('TIMEOUT');
  });

  test('an existing step-check cancellation still aborts the request', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const apiPath = '/src/api.ts';
      const api = await import(/* @vite-ignore */ apiPath);
      const original = window.fetch;
      let aborted = false;
      window.fetch = async (_input, init) => new Promise((_resolve, reject) => {
        const cancel = () => {
          aborted = true;
          reject(new DOMException('Aborted', 'AbortError'));
        };
        if (init?.signal?.aborted) cancel();
        else init?.signal?.addEventListener('abort', cancel, { once: true });
      });
      try {
        const caller = new AbortController();
        const request = api.diff('2x+3=11', '2x=8', 'homework', caller.signal).catch(() => null);
        caller.abort();
        await request;
        return aborted;
      } finally {
        window.fetch = original;
      }
    });
    expect(result).toBe(true);
  });
});
