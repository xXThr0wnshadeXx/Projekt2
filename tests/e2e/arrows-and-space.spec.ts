// Issue #236: there is no scrolling. Up and Down (or Left and Right) walk the
// whole page one line at a time: headings, text, maths lines, buttons and text
// boxes. The line you are on is highlighted and said. Space presses a button,
// or reads anything else aloud. Holding Space still records on the scratchpad.

import { test, expect, type Page } from '@playwright/test';

const polite = (page: Page) => page.getByTestId('live-polite');
const current = (page: Page) => page.locator('.glance-current');

/** Record what Glance's own voice says, before the app loads. */
async function recordSpeech(page: Page) {
  await page.addInitScript(() => {
    const said: string[] = [];
    (window as unknown as { __said: string[] }).__said = said;
    const proto = Object.getPrototypeOf(window.speechSynthesis);
    Object.defineProperty(proto, 'speak', {
      value: (u: SpeechSynthesisUtterance) => said.push(u.text),
      configurable: true,
    });
    Object.defineProperty(proto, 'cancel', { value: () => {}, configurable: true });
  });
}
const said = (page: Page) =>
  page.evaluate(() => (window as unknown as { __said: string[] }).__said.join(' | '));

/** The live region's text once it has settled (it clears before each message). */
async function heard(page: Page) {
  await page.waitForTimeout(200);
  return (await polite(page).textContent()) ?? '';
}

/** Press Down until the announcement matches, or fail after `max` presses. */
async function downTo(page: Page, wanted: RegExp, max = 20) {
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('ArrowDown');
    if (wanted.test(await heard(page))) return;
  }
  throw new Error(`never reached ${wanted}`);
}

async function openSample(page: Page) {
  await page.addInitScript(() => window.localStorage.clear());
  await recordSpeech(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample problem' }).click();
  await expect(page.locator('#L2 mjx-container')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#L1')).toBeFocused();
}

test.describe('@smoke the whole page by arrows and space', () => {
  // One page holds every step now, so a full walk is a few hundred presses.
  test.setTimeout(120_000);
  test('Down and Up walk the page line by line, said and highlighted', async ({ page }) => {
    await openSample(page);
    await page.keyboard.press('ArrowDown');
    expect(await heard(page)).toBe('Discard problem line 1, button.');
    await expect(current(page)).toHaveCount(1);
    await page.keyboard.press('ArrowDown');
    expect(await heard(page)).toBe('Line 2 of 2.');
    await expect(page.locator('#L2')).toBeFocused();
    await expect(page.locator('#L2')).toHaveClass(/glance-current/);
    await page.keyboard.press('ArrowRight');
    expect(await heard(page)).toBe('Discard problem line 2, button.');
    await page.keyboard.press('ArrowLeft');
    expect(await heard(page)).toBe('Line 2 of 2.');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    expect(await heard(page)).toBe('Line 1 of 2.');
  });

  test('the top and the end of the page are said', async ({ page }) => {
    await openSample(page);
    for (let i = 0; i < 25; i += 1) await page.keyboard.press('ArrowUp');
    expect(await heard(page)).toBe('Top of the page.');
    await downTo(page, /^End of the page\.$/, 400);
  });

  test('the current line is always in view, with no scrolling', async ({ page, isMobile }) => {
    await openSample(page);
    if (!isMobile) {
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden');
    }
    await downTo(page, /^End of the page\.$/, 400);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(200);
    const inView = await current(page).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight;
    });
    expect(inView).toBe(true);
  });

  test('Space reads a maths line aloud', async ({ page }) => {
    await openSample(page);
    await downTo(page, /^Line 2 of 2\.$/);
    await page.keyboard.press(' ');
    await expect.poll(() => said(page)).toContain('Line 2. the fraction');
  });

  test('Space reads text aloud, and presses a button', async ({ page }) => {
    await openSample(page);
    await downTo(page, /^Heading\. Ways to read this$/);
    await page.keyboard.press(' ');
    await expect.poll(() => said(page)).toContain('Heading. Ways to read this');
    await page.keyboard.press('ArrowDown');
    expect(await heard(page)).toBe('Glance, button.');
    await page.keyboard.press(' ');
    await expect(page.getByRole('region', { name: 'Structure summary' })).toBeVisible({ timeout: 15000 });
  });
});

/** Every visible piece of text, except inside maths lines (those are read by
 *  Space in their spoken form, not as their raw characters). */
async function visibleTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const SKIP = '[hidden], [aria-hidden="true"], .sr-only, .skip-link, [data-testid^="live-"], script, style, mjx-container, [data-testid^="math-line-"]';
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.nodeValue?.replace(/\s+/g, ' ').trim();
      const el = n.parentElement;
      if (!text || !el || el.closest(SKIP)) continue;
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) continue;
      // A labelled control is announced by its name ("Smaller text"), not by
      // its face ("A−"), as a screen reader does.
      const control = el.closest('button, a[href], summary, [role="button"]');
      out.push(control?.getAttribute('aria-label') || text);
    }
    return out;
  });
}

/** Walk from the top of the page to the end, collecting what is said. */
async function walkAll(page: Page): Promise<string> {
  for (let i = 0; i < 400; i += 1) await page.keyboard.press('ArrowUp');
  const heardAll: string[] = [];
  for (let i = 0; i < 400; i += 1) {
    await page.keyboard.press('ArrowDown');
    const t = await heard(page);
    if (t === 'End of the page.') break;
    heardAll.push(t);
  }
  return heardAll.join(' | ').replace(/\s+/g, ' ');
}

test.describe('@smoke every line of text is a stop', () => {
  test.setTimeout(180_000);
  for (const where of ['home', 'problem'] as const) {
    test(`on the ${where} screen, the walk reaches every piece of visible text`, async ({ page }) => {
      await page.addInitScript(() => window.localStorage.clear());
      await page.goto('/');
      if (where === 'problem') {
        await page.getByRole('button', { name: 'Try a sample problem' }).click();
        await expect(page.locator('#L2 mjx-container')).toBeVisible({ timeout: 15000 });
      }
      const texts = await visibleTexts(page);
      const said = await walkAll(page);
      const missed = texts.filter((t) => !said.includes(t));
      expect(missed, `never reached: ${JSON.stringify(missed)}`).toEqual([]);
    });
  }
});

test.describe('@smoke arrows and space on the scratchpad', () => {
  test('Space on the heading reads it', async ({ page }) => {
    await openSample(page);
    await page.keyboard.press('s');
    await expect(page.getByRole('heading', { name: 'Your work', exact: true })).toBeFocused();
    await page.keyboard.press(' ');
    await expect.poll(() => said(page)).toContain('Heading. Your work');
  });

  test('your saved lines are lines on the page, and Space reads one', async ({ page }) => {
    await page.route('**/api/**', (r) => r.abort());
    await openSample(page);
    await page.keyboard.press('s');
    for (const line of ['2x = 8', 'x = 4']) {
      await page.getByLabel('Or type your line').fill(line);
      await page.keyboard.press('Enter');
      await expect(polite(page)).toContainText('I read:');
      await page.keyboard.press('Enter');
      await expect(polite(page)).toContainText('Saved as line');
    }
    await page.getByRole('heading', { name: 'Your work', exact: true }).focus();
    await downTo(page, /^Your line 1 of 2\.$/);
    await page.keyboard.press(' ');
    await expect.poll(() => said(page)).toContain('Your line 1.');
  });

  test('Up and Down leave the text box, Left and Right stay in it', async ({ page }) => {
    await openSample(page);
    await page.keyboard.press('s');
    // Focus lands on the heading a moment after S; click the box only after.
    await expect(page.getByRole('heading', { name: 'Your work', exact: true })).toBeFocused();
    const box = page.getByLabel('Or type your line');
    await box.click();
    await page.keyboard.type('x = 4');
    await page.keyboard.press('ArrowLeft');
    await expect(box).toBeFocused();
    await expect(box).toHaveValue('x = 4');
    await page.keyboard.press('ArrowDown');
    await expect(box).not.toBeFocused();
  });

  test('holding Space still records', async ({ page, browserName, isMobile }) => {
    test.skip(isMobile, 'Touch devices record with tap-to-start, not a held key.');
    test.skip(browserName === 'webkit', 'Covered on desktop browsers.');
    await page.addInitScript(() => {
      Object.defineProperty(MediaDevices.prototype, 'getUserMedia', {
        value: () => new Promise<MediaStream>(() => {}),
        configurable: true,
      });
    });
    await openSample(page);
    await page.keyboard.press('s');
    await page.getByRole('heading', { name: 'Your work', exact: true }).focus();
    await page.keyboard.down(' ');
    await page.waitForTimeout(700);
    await page.keyboard.up(' ');
    // Held past the threshold: it went to the microphone, not to reading.
    expect(await said(page)).not.toContain('Heading. Your work');
  });
});
