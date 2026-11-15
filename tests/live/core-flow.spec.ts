import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

test.skip(!process.env.LIVE_FRONTEND_URL?.trim(), 'Set LIVE_FRONTEND_URL to opt in to the deployed smoke check.');

async function submitLine(page: Page, text: string) {
  await page.getByLabel('Or type your line').fill(text);
  await page.getByRole('button', { name: 'Add line', exact: true }).click();
}

test('Flow A on the deployment', async ({ page }) => {
  const live = page.getByTestId('live-polite');
  const readback = page.getByRole('region', { name: 'Confirm your line' });
  const clarify = page.getByRole('dialog');

  await test.step('A. Home and backend health', async () => {
    const [health] = await Promise.all([
      page.waitForEvent('requestfinished', {
        predicate: (request) => request.method() === 'GET' && new URL(request.url()).pathname === '/api/health',
        timeout: 20_000,
      }),
      page.goto('/', { waitUntil: 'domcontentloaded' }),
    ]);
    await expect(page.getByRole('heading', { name: 'Glance', exact: true })).toBeVisible();
    const response = await health.response();
    expect(response?.ok(), 'The browser must reach the backend health endpoint').toBe(true);
    expect(await response?.json()).toMatchObject({ ok: true });
    // A fresh browser should be in Homework mode so saving only uses the CAS.
    await expect(page.getByTestId('mode-badge')).toHaveText('Homework mode');
  });

  await test.step('B. Sample typesets and G announces structure', async () => {
    await page.getByRole('button', { name: 'Try a sample problem' }).click();
    await expect(page.locator('#L1 mjx-container')).toBeVisible();
    await page.locator('#L1').press('g');
    const summary = page.getByRole('region', { name: 'Structure summary' }).locator('p');
    await expect(summary).toContainText(/This is an (equation|expression|inequality)/);
    await expect(live).toHaveText((await summary.innerText()).trim());
  });

  await test.step('C. Typed line reaches readback and saves on Enter', async () => {
    await page.locator('#L1').press('s');
    await submitLine(page, 'two x equals eight');
    await expect(readback).toBeVisible();
    await expect(readback.getByRole('button', { name: 'Save', exact: true })).toBeFocused();

    // A fast step-check verdict can replace the save text before polling sees it.
    const announcements: string[] = [];
    await page.exposeFunction('rememberSaveAnnouncement', (message: string) => { announcements.push(message); });
    await live.evaluate((region) => {
      const report = (window as Window & { rememberSaveAnnouncement: (text: string) => void }).rememberSaveAnnouncement;
      new MutationObserver(() => report(region.textContent ?? '')).observe(region, {
        childList: true, characterData: true, subtree: true,
      });
    });

    await page.keyboard.press('Enter');
    await expect.poll(() => announcements).toContain('Saved as line 1.');
    await expect(page.getByRole('region', { name: 'Your lines' }).getByRole('group')).toHaveCount(1);
  });

  await test.step('D. Ambiguous fraction opens the clarification dialog', async () => {
    await submitLine(page, 'x plus one over two');
    // Export can still be checked using the first saved line if interpretation fails.
    await expect.soft(clarify).toBeVisible();
  });

  await test.step('E. X downloads a hand-in containing MathML', async () => {
    if (await clarify.isVisible() || await readback.isVisible()) {
      await page.keyboard.press('Escape');
      await expect(clarify).toBeHidden();
      await expect(readback).toBeHidden();
    }
    await page.getByRole('heading', { name: 'Your work', exact: true }).press('x');
    await expect(page.getByRole('heading', { name: 'Hand in your work', exact: true })).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20_000 }),
      page.getByRole('button', { name: 'Download accessible HTML', exact: true }).click(),
    ]);
    expect(await readFile(await download.path(), 'utf8')).toMatch(/<math\b/);
  });
});

// Capture starts independently so it can report a result if the scratchpad flow fails.
test('F. Worksheet upload announces at least one line', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Capture a problem' }).click();
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 160;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not draw the synthetic worksheet.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000';
    context.font = '48px sans-serif';
    context.fillText('2x + 3 = 11', 40, 94);
    return canvas.toDataURL('image/png').split(',', 2)[1];
  });
  await page.locator('input[type="file"]').setInputFiles({
    name: 'synthetic-worksheet.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await expect(page.getByTestId('live-polite')).toContainText(/\bFound [1-9]\d* lines?\b/);
});
