// 400% zoom and the clarify dialog's focus trap — DESIGN.md 13.
//
// WCAG 1.4.10 (Reflow): at 400% zoom on a 1280px screen the page is 320 CSS px
// wide, and nothing may need sideways scrolling except content that needs two
// dimensions to make sense — here, a long equation, which may scroll inside
// its own box. So the *page* must never be wider than the viewport.

import { test, expect, type Page } from '@playwright/test';

const PROBLEM = {
  instructions: 'Solve for x, then check your answer by substituting it back into the original equation.',
  lines: [
    { id: 'L1', latex: '2x + 3 = 11', confidence: 1, intent_notes: '', valid: true },
    {
      id: 'L2',
      latex: '\\frac{\\sqrt{x + 1}}{2} + \\frac{3x^{2} - 4x + 7}{x - 1} = 5x + \\frac{1}{3}',
      confidence: 1, intent_notes: '', valid: true,
    },
  ],
  diagrams: [{ id: 'D1', description: 'A number line from 0 to 10 with an open circle at 4.' }],
  warnings: ['Bottom of the page is cut off — move the phone down and try again.'],
  source: 'upload',
};
const WORK = [{ id: 'W1', latex: '2x = 8', readback: '2 x equals 8', valid: true }];

async function seed(page: Page) {
  await page.addInitScript(
    ([problem, work]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('glance.problem.v1', JSON.stringify(problem));
      localStorage.setItem('glance.work.v1', JSON.stringify(work));
    },
    [PROBLEM, WORK] as const,
  );
  await page.route('**/api/diff', (r) => r.abort());
}

/** The page itself must not scroll sideways at 320px. */
async function expectNoSidewaysScroll(page: Page, screen: string) {
  await page.waitForTimeout(400); // MathJax typesets asynchronously
  const { scroll, view, widest } = await page.evaluate(() => {
    const doc = document.documentElement;
    // Name the widest element that sticks out, to make a failure actionable.
    let widest = '';
    let max = doc.clientWidth;
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      const r = el.getBoundingClientRect();
      if (r.right > max + 1 && !el.closest('mjx-container')) {
        max = r.right;
        widest = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).slice(0, 40)}`;
      }
    }
    return { scroll: doc.scrollWidth, view: doc.clientWidth, widest };
  });
  expect(scroll, `${screen}: page is ${scroll}px wide in a ${view}px viewport (widest: ${widest})`).toBeLessThanOrEqual(view);
}

async function openProblem(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Back to your problem' }).click();
  await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
}

test.describe('@smoke reflow at 400% zoom (320px)', () => {
  test.use({ viewport: { width: 320, height: 640 } });
  test.beforeEach(async ({ page }) => seed(page));

  test('home and keyboard help', async ({ page }) => {
    await page.goto('/');
    await expectNoSidewaysScroll(page, 'home');
    await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
    await expectNoSidewaysScroll(page, 'keyboard help');
  });

  test('capture', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Capture a problem' }).click();
    await expectNoSidewaysScroll(page, 'capture');
  });

  test('problem with a long equation, a diagram and a warning', async ({ page }) => {
    await openProblem(page);
    await page.keyboard.press('g');
    await expectNoSidewaysScroll(page, 'problem');
  });

  test('scratchpad with the problem shown', async ({ page }) => {
    await openProblem(page);
    await page.keyboard.press('s');
    await page.getByRole('button', { name: 'Show the problem' }).click();
    await expectNoSidewaysScroll(page, 'scratchpad');
  });

  test('settings', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    await expectNoSidewaysScroll(page, 'settings');
  });

  test('hand-in', async ({ page }) => {
    await openProblem(page);
    await page.keyboard.press('x');
    await expect(page.getByRole('heading', { name: 'Hand in your work' })).toBeVisible();
    await expectNoSidewaysScroll(page, 'hand-in');
  });

  test('low-vision mode at its largest size', async ({ page }) => {
    await openProblem(page);
    await page.keyboard.press('l');
    for (let i = 0; i < 8; i += 1) await page.keyboard.press('+');
    await expectNoSidewaysScroll(page, 'low-vision');
  });
});

test.describe('@smoke clarify dialog focus trap', () => {
  test('Tab and Shift+Tab cycle through the options and never leave the dialog', async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.route('**/api/spoken-to-latex', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          latex: null, ambiguous: true, readback: null, valid: false,
          clarifying_question: 'Did you mean x plus one, all over two, or x plus one half?',
          alternatives: [
            { latex: '\\frac{x+1}{2}', readback: 'x plus one, all over two', valid: true },
            { latex: 'x + \\frac{1}{2}', readback: 'x plus one half', valid: true },
          ],
        }),
      }),
    );
    await page.goto('/');
    await page.getByRole('button', { name: 'Try a sample problem' }).click();
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
    await page.keyboard.press('s');
    await page.getByLabel('Or type your line').fill('x plus one over two');
    await page.getByRole('button', { name: 'Add line' }).click();

    const dialog = page.getByRole('dialog');
    const first = dialog.getByRole('button', { name: /x plus one, all over two/ });
    const second = dialog.getByRole('button', { name: /x plus one half/ });
    await expect(first).toBeFocused();

    // Forward: first option → second option (Safari's default Tab would skip
    // buttons and land in the typing box behind the dialog).
    await page.keyboard.press('Tab');
    await expect(second).toBeFocused();

    // Backward from the first control wraps to the last one inside the dialog.
    await first.focus();
    await page.keyboard.press('Shift+Tab');
    const inside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
    expect(inside).toBe(true);
    await expect(first).not.toBeFocused();

    // Many presses later, still inside.
    for (let i = 0; i < 9; i += 1) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  });
});
