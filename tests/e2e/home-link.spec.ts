// The Glance logo in the top left goes home, as on any site.

import { test, expect } from '@playwright/test';

test.describe('@smoke the logo goes home', () => {
  test('from the capture page it returns to the start', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
    await page.goto('/');
    await page.getByRole('button', { name: 'Get started' }).press('Enter');
    await expect(page.getByRole('heading', { name: 'Bring in your problem' })).toBeFocused();

    const home = page.getByRole('link', { name: 'Glance', exact: true });
    await expect(home).toHaveAttribute('href', '/');
    await home.press('Enter');
    await expect(page.getByRole('heading', { name: 'Maths you can hear, explore and write' })).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Bring in your problem' })).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe('');
  });

  test('with a worksheet open it returns to the worksheet', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear());
    await page.goto('/');
    await page.getByRole('button', { name: 'Try a sample problem' }).press('Enter');
    await expect(page.locator('#L1')).toBeFocused({ timeout: 15000 });
    await page.getByRole('button', { name: 'Bring in a different worksheet' }).press('Enter');
    await expect(page.getByRole('heading', { name: 'Bring in your problem' })).toBeFocused();

    await page.getByRole('link', { name: 'Glance', exact: true }).press('Enter');
    await expect(page.getByRole('heading', { name: 'Your worksheet' })).toBeVisible();
    await expect(page.locator('#L1')).toBeFocused();
  });
});
