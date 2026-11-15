// PDF worksheets on the capture screen — the front-end half of issue #26.
//
// Most real course math arrives as a scanned PDF, and only one of its pages is
// the problem, so DESIGN.md F1 asks for the page number rather than guessing.
// The back end turns that page into an image; capture then treats it like any
// other photo.
//
// The two PDF endpoints are stubbed: what is under test is the front end's
// flow — that a multi-page file asks, a single-page file does not, and the
// question is operable by keyboard.

import { test, expect, type Page } from '@playwright/test';
import { stubServerWithModels } from './server';

// Capture is offered only when the server says it has its model (#127).
test.beforeEach(async ({ page }) => stubServerWithModels(page));

const CAPTURED = {
  instructions: 'Solve for x.',
  lines: [
    { id: 'L1', latex: '2x + 3 = 11', confidence: 0.97, intent_notes: '', valid: true },
  ],
  diagrams: [],
  warnings: [],
};

/** A 1x1 PNG, enough to stand in for a rendered page. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function stubPdf(page: Page, pages: number) {
  await page.route('**/api/pdf/pages', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pages }) }),
  );
  await page.route('**/api/pdf/page', (r) =>
    r.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
  );
  await page.route('**/api/capture', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CAPTURED) }),
  );
}

async function uploadPdf(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'worksheet.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7 stub'),
  });
}

test.describe('@smoke pdf worksheets', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
  });

  test('a multi-page PDF asks which page, by keyboard', async ({ page }) => {
    await stubPdf(page, 12);
    await uploadPdf(page);

    const picker = page.getByRole('region', { name: 'Choose a page' });
    await expect(picker).toBeVisible();
    await expect(picker).toContainText('12 pages');

    // The question is spoken, and focus lands on the field to answer it.
    await expect(page.getByTestId('live-polite')).toContainText('Which page');
    await expect(page.getByLabel('Which page is your problem on?')).toBeFocused();

    // The field already holds 1, so replace rather than append.
    await page.getByLabel('Which page is your problem on?').fill('4');
    await page.keyboard.press('Enter');

    await expect(page.getByRole('heading', { name: 'Your worksheet' })).toBeVisible();
    await expect(page.locator('#L1')).toBeFocused();
  });

  test('a one-page PDF is not worth a question', async ({ page }) => {
    await stubPdf(page, 1);
    await uploadPdf(page);

    await expect(page.getByRole('region', { name: 'Choose a page' })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Your worksheet' })).toBeVisible();
  });

  test('a page number out of range is refused, not sent', async ({ page }) => {
    await stubPdf(page, 3);
    await uploadPdf(page);

    const field = page.getByLabel('Which page is your problem on?');
    await field.fill('9');
    // Enter, not a click: on CI's Linux WebKit phone emulation the page cannot
    // be scrolled to its last ~100px after a screen change, so a click on a
    // control at the bottom never lands. A real phone is not affected.
    await page.getByRole('button', { name: 'Open this page' }).press('Enter');

    await expect(page.getByTestId('live-assertive')).toContainText('between 1 and 3');
    await expect(page.getByRole('region', { name: 'Choose a page' })).toBeVisible();
  });
});
