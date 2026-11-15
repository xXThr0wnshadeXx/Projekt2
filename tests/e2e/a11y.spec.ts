// axe-core on every screen, zero critical or serious violations — issue #31.
//
// Each screen is checked in the state a student actually meets it, including
// the transient ones (readback bar, clarify dialog, keyboard help, camera
// denied), in both the default dark theme and light mode. Model endpoints are
// stubbed; what is being checked is the page, not the model.

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PROBLEM = {
  instructions: 'Solve for x.',
  lines: [
    { id: 'L1', latex: '2x + 3 = 11', confidence: 1, intent_notes: '', valid: true },
    { id: 'L2', latex: 'x \\to 2', confidence: 0.4, intent_notes: 'unclear arrow', valid: false },
  ],
  diagrams: [{ id: 'D1', description: 'A number line from 0 to 10.' }],
  warnings: ['Bottom of the page is cut off — move the phone down.'],
  source: 'upload',
};
const WORK = [{ id: 'W1', latex: '2x = 8', readback: '2 x equals 8', valid: true }];

test.describe('@smoke progressive web app shell', () => {
  // The rest of the suite blocks service workers (playwright.config.ts).
  test.use({ serviceWorkers: 'allow' });

  test('publishes its manifest and explains the install fallback', async ({ page }) => {
    await page.addInitScript(() => {
      window.addEventListener('beforeinstallprompt', (event) => event.stopImmediatePropagation());
    });
    await page.goto('/');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
    await expect(page.getByTestId('install-status')).toContainText('Install app option');
    await expect
      .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL ?? ''))
      .toContain('/sw.js');
  });
});

test('@smoke skip link moves focus to main content', async ({ page, browserName }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Maths you can hear, explore and write' })).toBeVisible();
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  if (browserName === 'webkit') {
    // Safari leaves links out of the Tab order unless "Press Tab to highlight
    // each item" is on, so the walk is checked on Chromium. What matters on
    // both is what Enter on the link does.
    await skip.focus();
  } else {
    // The skip link is the first stop on the page.
    await page.keyboard.press('Tab');
  }
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
});

const SPOKEN_CLEAR = {
  latex: 'x = 4', ambiguous: false, clarifying_question: null, alternatives: [], readback: 'x equals 4', valid: true,
};
const SPOKEN_AMBIGUOUS = {
  latex: null, ambiguous: true, readback: null, valid: false,
  clarifying_question: 'Did you mean x plus one, all over two, or x plus one half?',
  alternatives: [
    { latex: '\\frac{x+1}{2}', readback: 'x plus one, all over two', valid: true },
    { latex: 'x + \\frac{1}{2}', readback: 'x plus one half', valid: true },
  ],
};

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
}

/** Fail with the rule ids and the first offending element of each. */
async function expectNoSeriousViolations(page: Page, screen: string) {
  // MathJax typesets asynchronously; scan the finished page.
  await page.waitForTimeout(300);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  const bad = results.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${screen}: ${v.id} (${v.impact}) — ${v.help} — ${v.nodes[0]?.target.join(' ')}`);
  expect(bad).toEqual([]);
}

/** The capture section is on the page already; with a worksheet loaded it
 * comes back through "Bring in a different worksheet". */
async function openCapture(page: Page) {
  await page.getByRole('button', { name: 'Bring in a different worksheet' }).click();
  await expect(page.getByRole('heading', { name: 'Bring in your problem' })).toBeFocused();
}

async function openProblem(page: Page) {
  await page.goto('/');
  await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
}

for (const scheme of ['dark', 'light'] as const) {
  test.describe(`@smoke axe (${scheme})`, () => {
    test.use({ colorScheme: scheme });
    test.beforeEach(async ({ page }) => seed(page));

    test('the whole page with a worksheet loaded', async ({ page }) => {
      await openProblem(page);
      await expect(page.getByRole('heading', { name: 'Your work', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Hand in your work' })).toBeVisible();
      await expectNoSeriousViolations(page, 'whole page');
    });

    test('the first visit, with nothing loaded yet', async ({ page }) => {
      await page.addInitScript(() => localStorage.clear());
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Try a sample problem' })).toBeVisible();
      await expectNoSeriousViolations(page, 'first visit');
    });

    test('page with keyboard help open', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Keys' }).click();
      await expectNoSeriousViolations(page, 'keyboard help');
    });

    test('capture, including a refused camera', async ({ page }) => {
      await page.goto('/');
      await openCapture(page);
      await expectNoSeriousViolations(page, 'capture');
      await page.getByRole('button', { name: 'Take a photo' }).click();
      await page.waitForTimeout(300);
      await expectNoSeriousViolations(page, 'capture after camera');
    });

    test('capture, asking which page of a PDF', async ({ page }) => {
      await page.route('**/api/pdf/pages', (r) =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pages: 3 }) }),
      );
      await page.goto('/');
      await openCapture(page);
      await page.locator('input[type=file]').setInputFiles({
        name: 'worksheet.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.7\n%stub\n'),
      });
      await expect(page.getByTestId('live-polite')).toContainText('This PDF has 3 pages');
      await expectNoSeriousViolations(page, 'capture PDF page choice');
    });

    test('problem, with an unsure line, a diagram and a photo warning', async ({ page }) => {
      await openProblem(page);
      await page.locator('#L1').focus();
      await page.keyboard.press('g');
      await expect(page.getByRole('region', { name: 'Structure summary' })).toBeVisible();
      await expectNoSeriousViolations(page, 'problem');
    });

    test('low-vision mode', async ({ page }) => {
      await openProblem(page);
      await page.getByRole('button', { name: 'Low-vision mode' }).click();
      const region = page.getByRole('region', { name: 'Low-vision mode' });
      const equation = region.getByRole('group', { name: 'Line 1' });
      await expect(equation.locator('mjx-container')).toBeVisible({ timeout: 15000 });
      await expect(equation).toHaveCSS('background-color', 'rgb(0, 0, 0)');
      await expectNoSeriousViolations(page, 'low-vision');
    });

    test('scratchpad, beside the worksheet', async ({ page }) => {
      await openProblem(page);
      await page.keyboard.press('s');
      await expect(page.getByRole('heading', { name: 'Your work', exact: true })).toBeFocused();
      await expectNoSeriousViolations(page, 'scratchpad');
    });

    test('scratchpad readback bar', async ({ page }) => {
      await page.route('**/api/spoken-to-latex', (r) =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SPOKEN_CLEAR) }),
      );
      await openProblem(page);
      await page.keyboard.press('s');
      await expect(page.getByRole('heading', { name: 'Your work', exact: true })).toBeFocused();
      await page.getByLabel('Or type your line').fill('x equals four');
      await page.getByRole('button', { name: 'Add line' }).click();
      await expect(page.getByRole('region', { name: 'Confirm your line' })).toBeVisible();
      await expectNoSeriousViolations(page, 'readback');
    });

    test('clarify dialog', async ({ page }) => {
      await page.route('**/api/spoken-to-latex', (r) =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SPOKEN_AMBIGUOUS) }),
      );
      await openProblem(page);
      await page.keyboard.press('s');
      await expect(page.getByRole('heading', { name: 'Your work', exact: true })).toBeFocused();
      await page.getByLabel('Or type your line').fill('x plus one over two');
      await page.getByRole('button', { name: 'Add line' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expectNoSeriousViolations(page, 'clarify dialog');
    });

    test('settings', async ({ page }) => {
      await page.goto('/');
      await page.getByText('More settings').click();
      await expect(page.getByRole('heading', { name: 'Mode' })).toBeVisible();
      await expectNoSeriousViolations(page, 'settings');
    });

    test('hand-in', async ({ page }) => {
      await openProblem(page);
      await page.locator('#L1').focus();
      await page.keyboard.press('x');
      await expect(page.getByRole('heading', { name: 'Hand in your work' })).toBeFocused();
      await expectNoSeriousViolations(page, 'hand-in');
    });
  });
}
