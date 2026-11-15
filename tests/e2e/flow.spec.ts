// Smoke coverage for the critical path, tagged @smoke so CI runs it on every
// pull request. Issue #31 adds the full suite; these are the few checks that,
// if they break, mean the demo is dead.
//
// Everything here is asserted the way a screen-reader user experiences it —
// accessible names, focus position, live-region text — not by pixel position.

import { test, expect } from '@playwright/test';

test.describe('@smoke critical path', () => {
  test('an equation renders and is reachable by keyboard', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Glance', level: 1 })).toBeVisible();

    // MathJax has to typeset, or a blind user gets raw LaTeX read aloud.
    const line = page.locator('#L1 mjx-container');
    await expect(line).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#L1')).not.toContainText('\[');

    // One tab stop per line, not two. MathJax puts containers in the tab order
    // by default; if that regresses, every line is announced twice.
    await expect(line).toHaveAttribute('tabindex', '-1');
  });

  test('each line is a single focusable group with an accessible name', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });

    const l1 = page.getByRole('group', { name: 'Line 1' });
    await expect(l1).toBeVisible();
    await l1.focus();
    await expect(l1).toBeFocused();

    // Enter hands control to the explorer, where arrow keys walk the tree.
    await page.keyboard.press('Enter');
    await expect(page.locator('#L1 mjx-container')).toBeFocused();
  });

  test('state changes are announced to screen readers', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });

    const polite = page.getByTestId('live-polite');
    await page.getByRole('button', { name: 'Focus line 1' }).click();
    await expect(polite).toHaveText('Moved to line 1.');
    await expect(page.locator('#L1')).toBeFocused();
  });

  test('no horizontal scrolling at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);
  });
});
