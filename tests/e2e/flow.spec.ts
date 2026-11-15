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

  test('low-vision mode opens with high-contrast type', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Low-vision mode' }).click();
    const stage = page.getByRole('region', { name: 'Low-vision mode' });
    await expect(stage).toBeVisible();

    // White on black is the default pairing; AAA ratios are asserted in the
    // unit test for the theme table.
    await expect(stage).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(stage).toHaveCSS('color', 'rgb(255, 255, 255)');

    await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('button', { name: 'Previous' })).toBeEnabled();
  });

  test('low-vision mode is driven entirely from the keyboard', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });

    // L enters the mode. A low-vision user is often not using a pointer at all.
    await page.keyboard.press('l');
    const stage = page.getByRole('region', { name: 'Low-vision mode' });
    await expect(stage).toBeVisible();
    await expect(stage.getByText('Line 1 of 2')).toBeVisible();

    const math = page.locator('[id^="lv-"]').first();
    const sizeOf = async () =>
      parseFloat(
        await math.evaluate((el) => getComputedStyle(el.parentElement as HTMLElement).fontSize),
      );

    const start = await sizeOf();
    await page.keyboard.press('+');
    expect(await sizeOf()).toBeGreaterThan(start);
    await page.keyboard.press('-');
    expect(await sizeOf()).toBeCloseTo(start, 1);

    // Arrows step between lines.
    await page.keyboard.press('ArrowRight');
    await expect(stage.getByText('Line 2 of 2')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(stage.getByText('Line 1 of 2')).toBeVisible();

    // T cycles the three pairings; the second is black on white.
    await page.keyboard.press('t');
    await expect(stage).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(stage).toHaveCSS('color', 'rgb(0, 0, 0)');

    // Escape leaves and puts focus back where the student was.
    await page.keyboard.press('Escape');
    await expect(stage).toBeHidden();
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
