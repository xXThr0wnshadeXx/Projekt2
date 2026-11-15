// Smoke coverage for the critical path, tagged @smoke so CI runs it on every
// pull request. Issue #31 adds the full suite; these are the few checks that,
// if they break, mean the demo is dead.
//
// Everything here is asserted the way a screen-reader user experiences it —
// accessible names, focus position, live-region text — not by pixel position.
//
// These run without a back end, so they go through the sample problem rather
// than a capture. That is not a test-only shortcut: the sample is the cached
// demo input DESIGN.md 27 asks for, and it is exactly what we fall back to if
// the venue Wi-Fi dies during judging. Capture itself needs model credentials
// and is covered by the back-end tests.

import { test, expect, type Page } from '@playwright/test';

/** Open the sample problem and wait for MathJax to typeset it. */
async function openSample(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample problem' }).click();
  await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
}

test.describe('@smoke critical path', () => {
  test('the first screen offers a way in by keyboard', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Glance', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Get started' })).toBeVisible();
    const capture = page.getByRole('button', { name: 'Capture a problem' });
    await expect(capture).toBeVisible();
    await expect(capture).toHaveAttribute('aria-controls', 'capture-choices');
    await expect(page.getByRole('button', { name: 'Try a sample problem' })).toBeVisible();
    // The three ways in appear when the one button is pressed.
    await capture.click();
    await expect(page.getByRole('button', { name: 'Upload a file' })).toBeVisible();
  });

  test('an equation renders and is reachable by keyboard', async ({ page }) => {
    await openSample(page);

    // MathJax has to typeset, or a blind user gets raw LaTeX read aloud.
    const line = page.locator('#L1 mjx-container');
    await expect(line).toBeVisible();
    await expect(page.locator('#L1')).not.toContainText('\[');

    // One tab stop per line, not two. MathJax puts containers in the tab order
    // by default; if that regresses, every line is announced twice.
    await expect(line).toHaveAttribute('tabindex', '-1');
  });

  test('each line is a single focusable group with an accessible name', async ({ page }) => {
    await openSample(page);

    const l1 = page.getByRole('group', { name: 'Line 1', exact: true });
    await expect(l1).toBeVisible();
    await l1.focus();
    await expect(l1).toBeFocused();

    // Enter hands control to the explorer, where arrow keys walk the tree.
    // Assert focus moved *into* the equation rather than onto one particular
    // element: once speech is attached MathJax focuses its own speech node
    // inside the container, and which node holds focus is its business, not
    // ours. What matters to a student is that they are now inside the maths.
    await page.keyboard.press('Enter');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const container = document.querySelector('#L1 mjx-container');
          return !!container && container.contains(document.activeElement);
        }),
      )
      .toBe(true);
  });

  test('capture results move focus to the first line and are announced', async ({ page }) => {
    // The sample takes the same path a real capture does, so this covers the
    // two things that matter: a student is never left on the old screen, and
    // never arrives on a new one in silence.
    await openSample(page);
    await expect(page.locator('#L1')).toBeFocused();
    await expect(page.getByTestId('live-polite')).toContainText('Solve for x.');
    await expect(page.getByTestId('live-polite')).toContainText('2 lines');
  });

  test('a student can discard an inaccurate captured line', async ({ page }) => {
    await openSample(page);
    await page.getByRole('button', { name: 'Discard problem line 1' }).click();

    await expect(page.getByTestId('math-line-L1')).toHaveCount(0);
    await expect(page.getByTestId('math-line-L2')).toBeVisible();
    await expect(page.getByTestId('live-polite')).toContainText('Discarded line 1. 1 line remains.');
  });

  test('state changes are announced to screen readers', async ({ page }) => {
    await openSample(page);

    const polite = page.getByTestId('live-polite');
    await page.getByRole('button', { name: 'Low-vision mode' }).click();

    // Wait for the mode to actually mount before leaving it: its key handler
    // binds on mount, so an Escape sent sooner lands nowhere.
    await expect(page.getByRole('region', { name: 'Low-vision mode' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(polite).toHaveText('Left low-vision mode.');
    await expect(page.locator('#L1')).toBeFocused();
  });

  test('the glance describes structure and never solves', async ({ page }) => {
    await openSample(page);

    const polite = page.getByTestId('live-polite');
    // Line 2 is the fraction with a root on top — the case the product is
    // named after.
    await page.getByRole('group', { name: 'Line 2', exact: true }).focus();
    await page.keyboard.press('g');

    const summary = page.getByRole('region', { name: 'Structure summary' });
    await expect(summary).toBeVisible({ timeout: 15000 });
    await expect(summary).toContainText('equation');
    await expect(summary).toContainText('fraction');
    await expect(summary).toContainText('square root');

    // The glance is spoken, not only shown.
    await expect(polite).toContainText('fraction');

    // Hard rule in AGENTS.md: nothing in this app ever solves. x = 4 is the
    // answer to line 1, and 99 to line 2; neither may appear.
    await expect(summary).not.toContainText('x = 4');
    await expect(summary).not.toContainText('99');
  });

  test('a line says its number once, then how to explore it', async ({ page }) => {
    // #133: the number was in the group's label and again in hidden text, so
    // a screen reader said "Line 1, group. Line 1. Press Enter to explore."
    await openSample(page);
    const line = page.getByRole('group', { name: 'Line 1', exact: true });
    await expect(line).toHaveAccessibleName('Line 1');
    await expect(line).toHaveAccessibleDescription('Press Enter to explore.');
    await expect(page.locator('#L1 mjx-container')).toBeVisible();
    // Nothing a reader would speak inside the line repeats the number.
    const spokenInside = await line.evaluate((el) =>
      Array.from(el.querySelectorAll('*'))
        .filter((child) => !child.closest('[hidden]') && child.children.length === 0)
        .map((child) => child.textContent ?? '')
        .join(' '),
    );
    expect(spokenInside).not.toContain('Line 1');
  });

  test('N and P move between lines and announce the position', async ({ page }) => {
    await openSample(page);

    const polite = page.getByTestId('live-polite');
    await page.getByRole('group', { name: 'Line 1', exact: true }).focus();

    await page.keyboard.press('n');
    await expect(polite).toHaveText('Line 2 of 2.');
    await expect(page.locator('#L2')).toBeFocused();

    await page.keyboard.press('p');
    await expect(polite).toHaveText('Line 1 of 2.');
    await expect(page.locator('#L1')).toBeFocused();
  });

  test('low-vision mode opens with high-contrast type', async ({ page }) => {
    await openSample(page);

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
    await openSample(page);

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

  test('the capture section offers every input from the start', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Get started' })).toBeVisible();
    await page.getByRole('button', { name: 'Capture a problem' }).click();
    const choices = page.getByRole('group', { name: 'How to bring in your problem' });
    await expect(choices.getByRole('button', { name: 'Upload a file' })).toBeVisible();
    await expect(choices.getByRole('button', { name: 'Take a photo' })).toBeVisible();
    await expect(choices.getByRole('button', { name: 'Live board' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try a sample problem' })).toBeVisible();
  });

  test('a problem survives a reload', async ({ page }) => {
    // Re-photographing a worksheet is expensive for someone who had to line a
    // phone up over it, so the problem is cached in the browser.
    await openSample(page);
    await page.reload();
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
  });

  test('no horizontal scrolling at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openSample(page);

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);
  });
});
