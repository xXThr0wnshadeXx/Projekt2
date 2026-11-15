import { test, expect } from '@playwright/test';

test.describe('top-left Back navigation', () => {
  test('returns through the Glance screens without leaving the app', async ({ page }) => {
    await page.goto('/');

    const homeBack = page.getByRole('button', { name: 'Back (no previous page)' });
    await expect(homeBack).toBeDisabled();

    await page.getByRole('button', { name: 'Try a sample problem' }).click();
    await expect(page.getByRole('button', { name: 'Back to previous page' })).toBeEnabled();

    await page.getByRole('button', { name: 'Back to previous page' }).click();
    await expect(page.getByRole('heading', { name: 'Math for students who are blind or have low vision' })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test('keeps Back in the top-left of low-vision mode', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Try a sample problem' }).click();
    await page.getByRole('button', { name: 'Low-vision mode' }).click();

    await expect(page.getByRole('region', { name: 'Low-vision mode' })).toBeVisible();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Low-vision mode' })).toBeHidden();
    await expect(page.locator('#L1')).toBeVisible();
  });
});
