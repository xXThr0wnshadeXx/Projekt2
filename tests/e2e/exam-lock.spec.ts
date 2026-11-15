// Exam lock — issue #189.
//
// An instructor's link locks Glance to exam mode until it expires. The
// student cannot switch out of it, and every request carries the lock so the
// server enforces the same rule.

import { test, expect, type Page } from '@playwright/test';

const polite = (page: Page) => page.getByTestId('live-polite');
const inTwoHours = () => Math.floor(Date.now() / 1000) + 7200;

async function server(page: Page, valid = true) {
  const headers: (string | undefined)[] = [];
  let diffs = 0;
  await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true } }));
  await page.route('**/api/exam/check', (r) =>
    r.fulfill({ json: valid ? { valid: true, expires_at: inTwoHours() } : { valid: false, expires_at: null } }));
  await page.route('**/api/validate', (r) => {
    headers.push(r.request().headers()['x-glance-exam']);
    return r.fulfill({ json: { valid: true } });
  });
  await page.route('**/api/diff', (r) => { diffs += 1; return r.abort(); });
  await page.route('**/api/spoken-to-latex', (r) => r.abort());
  return { headers, diffs: () => diffs };
}

test.describe('@smoke exam lock', () => {
  test('an exam link locks exam mode, and the student cannot switch it off', async ({ page }) => {
    await server(page);
    await page.goto('/?exam=signed-token');

    await expect(polite(page)).toContainText('Exam mode is on, set by your instructor, until');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('mode-badge')).toContainText('Exam mode, set by your instructor until');

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByTestId('exam-locked')).toBeVisible();
    await expect(page.getByRole('radio', { name: /Exam/ })).toBeChecked();
    await page.getByRole('radio', { name: /Study/ }).click();
    await expect(polite(page)).toContainText('cannot be changed');
    await expect(page.getByRole('radio', { name: /Exam/ })).toBeChecked();

    // Still locked after a reload.
    await page.reload();
    await expect(page.getByTestId('mode-badge')).toContainText('set by your instructor');
  });

  test('locked work carries the lock to the server and asks for no step checks', async ({ page }) => {
    const s = await server(page);
    await page.goto('/?exam=signed-token');
    await expect(polite(page)).toContainText('Exam mode is on');
    await page.getByRole('button', { name: 'Try a sample problem' }).click();
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Start working' }).click();

    await page.getByLabel('Or type your line').fill('2x = 8');
    await page.keyboard.press('Enter');
    await expect(polite(page)).toContainText('I read:');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Your line 1', exact: true })).toBeVisible();

    expect(s.headers.length).toBeGreaterThan(0);
    expect(s.headers.every((h) => h === 'signed-token')).toBe(true);
    expect(s.diffs()).toBe(0);
  });

  test('an expired or forged link leaves the student their own settings', async ({ page }) => {
    await server(page, false);
    await page.goto('/?exam=forged');
    await expect(page.getByTestId('live-assertive')).toContainText('expired or is not valid');
    await expect(page.getByTestId('mode-badge')).toHaveText('Homework mode');
  });

  test('an instructor can make an exam link and copy it', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true } }));
    await page.route('**/api/exam/link', (r) => r.fulfill({ json: { token: 'abc.def', expires_at: inTwoHours() } }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByLabel('Exam length').selectOption('60');
    await page.getByRole('button', { name: 'Make exam link' }).click();

    await expect(page.getByLabel('Exam link', { exact: true })).toHaveValue(/\?exam=abc\.def$/);
    await expect(polite(page)).toContainText('Exam link ready.');
  });
});
