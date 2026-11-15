import { expect, test } from '@playwright/test';

test('Space opens the control chooser and activates a named essential button', async ({ page }) => {
  await page.goto('/');
  // Wait for the app's global keyboard listener to mount.
  await expect(page.getByRole('button', { name: 'Capture a problem' })).toBeVisible();
  await page.waitForTimeout(150);
  await page.keyboard.press('Space');
  const chooser = page.getByRole('dialog', { name: 'Choose a control' });
  await expect(chooser).toBeVisible();
  await page.getByLabel('Button to press').fill('Try a sample problem');
  await page.getByRole('button', { name: 'Go' }).click();
  await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
});

test('Space remains available for scratchpad push-to-talk', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample problem' }).click();
  await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Start working' }).click();
  await page.keyboard.press('Space');
  await expect(page.getByRole('dialog', { name: 'Choose a control' })).toHaveCount(0);
});
