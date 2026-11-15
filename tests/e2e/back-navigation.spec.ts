// Going back (#257), on the one page. There is no screen stack to return
// through: the capture page is the only other place, and it has "Back to the
// start" (or "Keep my current problem") and the browser's Back button. Low-vision
// mode keeps a visible Back button for anyone who cannot press Escape.

import { test, expect } from '@playwright/test';

test.describe('going back', () => {
  test('the capture page is left by its Back button and by the browser Back', async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/');

    await page.getByRole('button', { name: 'Get started' }).click();
    await expect(page.getByRole('heading', { name: 'Bring in your problem' })).toBeFocused();
    await expect(page).toHaveURL(/#capture$/);

    await page.getByRole('button', { name: 'Back to the start' }).click();
    await expect(page.getByRole('heading', { name: 'Maths you can hear, explore and write' })).toBeVisible();
    await expect(page).not.toHaveURL(/#capture/);

    await page.getByRole('button', { name: 'Get started' }).click();
    await expect(page.getByRole('heading', { name: 'Bring in your problem' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Maths you can hear, explore and write' })).toBeVisible();
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
