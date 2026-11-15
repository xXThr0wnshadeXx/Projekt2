// Export: PDF + accessible HTML — issue #22.
//
// Acceptance: the HTML passes axe with no critical issues. Beyond that, what is
// asserted is what makes it a usable hand-in: real MathML a screen reader can
// read, the student's own numbered lines, and nothing that could run code or
// phone home when an instructor opens it.

import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PROBLEM = {
  instructions: 'Solve for x.',
  lines: [{ id: 'L1', latex: '2x + 3 = 11', confidence: 1, intent_notes: '', valid: true }],
  diagrams: [],
  warnings: [],
  source: 'sample',
};

const WORK = [
  { id: 'W1', latex: '2x = 8', readback: '2 x equals 8', valid: true },
  { id: 'W2', latex: 'x = 4', readback: 'x equals 4', valid: true },
];

/** Start with a saved problem and saved work, as after a reload. */
async function seed(page: Page, work: unknown[] = WORK, problem: unknown = PROBLEM) {
  await page.addInitScript(
    ([problem, lines]) => {
      localStorage.setItem('glance.problem.v1', JSON.stringify(problem));
      localStorage.setItem('glance.work.v1', JSON.stringify(lines));
    },
    [problem, work] as const,
  );
}

type ShareCall = { title: string; saidBefore: string; files: { name: string; type: string; text: string }[] };

/** Stand in for the phone's share sheet. 'ok' resolves, 'cancel' rejects as
 *  the browser does when the sheet is dismissed, 'none' removes sharing. */
async function stubShare(page: Page, behaviour: 'ok' | 'cancel' | 'none') {
  await page.addInitScript((b) => {
    const w = window as unknown as { shared: unknown[] };
    w.shared = [];
    if (b === 'none') {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
      return;
    }
    Object.defineProperty(navigator, 'canShare', {
      value: (data?: { files?: File[] }) => !!data?.files?.length,
      configurable: true,
    });
    Object.defineProperty(navigator, 'share', {
      value: async (data: { title: string; files: File[] }) => {
        const saidBefore = document.querySelector('[data-testid="live-polite"]')?.textContent ?? '';
        const files = await Promise.all(
          data.files.map(async (f) => ({ name: f.name, type: f.type, text: await f.text() })),
        );
        w.shared.push({ title: data.title, saidBefore, files });
        if (b === 'cancel') throw new DOMException('Share canceled', 'AbortError');
      },
      configurable: true,
    });
  }, behaviour);
}

function shareCalls(page: Page): Promise<ShareCall[]> {
  return page.evaluate(() => (window as unknown as { shared: ShareCall[] }).shared ?? []);
}

async function openExport(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Back to your problem' }).click();
  await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
  await page.keyboard.press('x');
  await expect(page.getByRole('heading', { name: 'Hand in your work' })).toBeFocused();
}

async function downloadHtml(page: Page): Promise<string> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download accessible HTML' }).click();
  const file = await download;
  return readFileSync((await file.path())!, 'utf8');
}

test.describe('@smoke export date', () => {
  // Pinned, so the result is the same on a laptop and on CI (which runs in UTC).
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('the filename uses the student\'s local date, like the file itself', async ({ page }) => {
    // 10 pm on 14 November in Los Angeles is already the 15th in UTC.
    await page.clock.setFixedTime(new Date('2026-11-14T22:00:00-08:00'));
    await seed(page);
    await openExport(page);
    await downloadHtml(page);
    await expect(page.getByTestId('live-polite')).toContainText('math-work-2026-11-14.html');
  });

});

test.describe('@smoke export', () => {
  test('X opens the hand-in, announced with the number of lines', async ({ page }) => {
    await seed(page);
    await openExport(page);
    await expect(page.getByTestId('live-polite')).toContainText('2 lines of your work');
    const preview = page.getByRole('region', { name: 'Math work' });
    await expect(preview.getByRole('group', { name: 'My line 1' })).toBeVisible();
    await expect(preview.getByRole('group', { name: 'My line 2' })).toBeVisible();
  });

  test('the HTML file is a real accessible document with MathML', async ({ page }) => {
    await seed(page);
    await openExport(page);
    await page.getByLabel(/Your name/).fill('Sam Example');
    const html = await downloadHtml(page);

    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<title>Math work — Sam Example</title>');
    expect(html).toContain('<h1>Math work — Sam Example</h1>');
    expect(html).toContain('<h2>My work</h2>');
    // One <math> per line: 1 problem line + 2 work lines.
    expect(html.match(/<math /g)).toHaveLength(3);
    expect(html).toContain('alttext="2 x equals 8"');
    // Clean MathML: no MathJax internals, no scripts, no network.
    expect(html).not.toContain('data-semantic');
    // The MathML namespace is an identifier, not a request; any other URL fails.
    const withoutNamespace = html.replaceAll('xmlns="http://www.w3.org/1998/Math/MathML"', '');
    expect(withoutNamespace).not.toMatch(/<script|https?:\/\//i);
    await expect(page.getByTestId('live-polite')).toContainText(/Downloaded math-work-sam-example-\d{4}-\d{2}-\d{2}\.html/);
  });

  test('the exported file has no axe critical or serious violations', async ({ page }) => {
    await seed(page);
    await openExport(page);
    const html = await downloadHtml(page);

    await page.setContent(html);
    const results = await new AxeBuilder({ page }).analyze();
    const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(bad.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('LaTeX links and anything that could run code are stripped', async ({ page }) => {
    await seed(page, [
      { id: 'W1', latex: '\\href{javascript:alert(1)}{x} = 1', readback: 'x equals 1', valid: true },
    ]);
    await openExport(page);
    const html = await downloadHtml(page);
    expect(html).not.toMatch(/javascript:|href=|onclick/i);
    expect(html).toContain('<math');
  });

  test('the file contains no wording that judges the student\'s lines', async ({ page }) => {
    await seed(page, [
      { id: 'W1', latex: 'x \\to 2', readback: 'x goes to 2', valid: false, confirmed: true },
      { id: 'W2', latex: 'x = 4', readback: 'x equals 4', valid: true },
    ]);
    await openExport(page);
    const html = await downloadHtml(page);
    // Lines are kept, never dropped, and nothing marks them.
    expect(html.match(/<math /g)).toHaveLength(3);
    const words = /checks? out|verified|correct|couldn.?t confirm|could not be (?:checked|confirmed)|not confirmed|wrong|incorrect|unsure|error/i;
    expect(html.replace(/<style[\s\S]*?<\/style>/, '')).not.toMatch(words);
  });

  test('the file says only what happened: how many lines were confirmed', async ({ page }) => {
    await seed(page, [
      { id: 'W1', latex: '2x = 8', readback: '2 x equals 8', valid: true, confirmed: true },
      { id: 'W2', latex: 'x = 4', readback: 'x equals 4', valid: true },
    ]);
    await openExport(page);
    const html = await downloadHtml(page);
    expect(html).toContain('1 of 2 lines were read back and confirmed by the student.');
    expect(html).not.toContain('All 2 lines');

  });

  test('when every line was confirmed the file says all of them were', async ({ page }) => {
    await seed(page, [
      { id: 'W1', latex: '2x = 8', readback: '2 x equals 8', valid: true, confirmed: true },
      { id: 'W2', latex: 'x = 4', readback: 'x equals 4', valid: true, confirmed: true },
    ]);
    await openExport(page);
    const html = await downloadHtml(page);
    expect(html).toContain('All 2 lines were read back and confirmed by the student.');
  });

  test('lines saved in the scratchpad are recorded as confirmed', async ({ page }) => {
    await seed(page, []);
    await page.route('**/api/validate', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"valid":true}' }),
    );
    await page.route('**/api/spoken-to-latex', (route) => route.abort());
    await page.goto('/');
    await page.getByRole('button', { name: 'Back to your problem' }).click();
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
    await page.keyboard.press('s');
    await page.getByLabel('Or type your line').fill('2x = 8');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('readback-bar')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('live-polite')).toContainText('Saved as line 1');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('glance.work.v1')!));
    expect(saved).toHaveLength(1);
    expect(saved[0].confirmed).toBe(true);
  });

  test('with no work yet, the file still says so plainly', async ({ page }) => {
    await seed(page, []);
    await openExport(page);
    await expect(page.getByTestId('live-polite')).toContainText('0 lines of your work');
    const html = await downloadHtml(page);
    expect(html).toContain('No lines written yet.');
    expect(html).not.toMatch(/read back and confirmed/);
  });

  test('hand in announces a summary, then shares the HTML file', async ({ page }) => {
    await stubShare(page, 'ok');
    await seed(page);
    await openExport(page);
    await page.getByRole('button', { name: 'Hand in my work' }).click();
    await expect.poll(() => shareCalls(page)).toHaveLength(1);
    const [call] = await shareCalls(page);
    expect(call.files).toHaveLength(1);
    expect(call.files[0].name).toMatch(/^math-work-\d{4}-\d{2}-\d{2}\.html$/);
    expect(call.files[0].type).toBe('text/html');
    expect(call.files[0].text).toContain('<h2>My work</h2>');
    expect(call.title).toBe('Math work');
    // The summary was said before the sheet opened.
    expect(call.saidBefore).toBe('Handing in. 2 lines of work, for the sample problem.');
    await expect(page.getByTestId('live-polite')).toContainText(/Shared math-work-.*\.html/);
  });

  test('the summary names the problem, trimmed, when it is not the sample', async ({ page }) => {
    await stubShare(page, 'ok');
    const long = 'Find the values of x and y that satisfy both of these equations at the same time, showing all of your steps.';
    await seed(page, WORK, { ...PROBLEM, source: 'upload', instructions: long });
    await openExport(page);
    await page.getByRole('button', { name: 'Hand in my work' }).click();
    await expect.poll(() => shareCalls(page)).toHaveLength(1);
    const [call] = await shareCalls(page);
    expect(call.saidBefore).toBe(`Handing in. 2 lines of work, for problem: ${long.slice(0, 60).trimEnd()}….`);
  });

  test('a cancelled share says nothing was sent and keeps the work', async ({ page }) => {
    await stubShare(page, 'cancel');
    await seed(page);
    await openExport(page);
    await page.getByRole('button', { name: 'Hand in my work' }).click();
    await expect(page.getByTestId('live-polite')).toHaveText('Not sent. Your work is still here.');
    await expect(page.getByRole('heading', { name: 'Hand in your work' })).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('glance.work.v1')!))).toHaveLength(2);
  });

  test('without share support it downloads and says the file name and where it is', async ({ page }) => {
    await stubShare(page, 'none');
    await seed(page);
    await openExport(page);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Hand in my work' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^math-work-\d{4}-\d{2}-\d{2}\.html$/);
    await expect(page.getByTestId('live-polite')).toContainText(
      `Downloaded ${file.suggestedFilename()}. It is in your browser's Downloads folder.`,
    );
  });

  test('saying "hand in" in the scratchpad shares the file', async ({ page }) => {
    await stubShare(page, 'ok');
    await seed(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Back to your problem' }).click();
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
    await page.keyboard.press('s');
    await page.getByLabel('Or type your line').fill('hand in');
    await page.keyboard.press('Enter');
    await expect.poll(() => shareCalls(page)).toHaveLength(1);
    const [call] = await shareCalls(page);
    expect(call.saidBefore).toContain('Handing in. 2 lines of work');
  });

  test('"Read my hand-in" reads the same lines the file has', async ({ page }) => {
    await seed(page, [
      { id: 'W1', latex: '2x = 8', readback: '2 x equals 8', valid: true, confirmed: true },
      { id: 'W2', latex: 'x = 4', readback: 'x equals 4', valid: true },
    ]);
    await openExport(page);
    await page.getByLabel(/Your name/).fill('Sam Example');
    const html = await downloadHtml(page);
    await page.getByRole('button', { name: 'Read my hand-in' }).click();
    await expect(page.getByTestId('live-polite')).toContainText('Math work — Sam Example.');
    const said = (await page.getByTestId('live-polite').textContent()) ?? '';

    const meta = /<p class="meta">(.*?)<\/p>/.exec(html)![1];
    const alts = [...html.matchAll(/alttext="([^"]*)"/g)].map((m) => m[1]);
    expect(said).toContain('Math work — Sam Example.');
    expect(said).toContain(meta);
    expect(said).toContain('Solve for x.');
    // Every line in the file, in the same order, as the read-out has it.
    let at = 0;
    for (const alt of alts) {
      const found = said.indexOf(alt, at);
      expect(found, `"${alt}" in the read-out`).toBeGreaterThanOrEqual(at);
      at = found + alt.length;
    }
    expect(said).toContain('Line 1. 2 x equals 8.');
    expect(said).toContain('Line 2. x equals 4.');
  });

  test('saying "read my hand-in" in the scratchpad reads it', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Back to your problem' }).click();
    await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
    await page.keyboard.press('s');
    await page.getByLabel('Or type your line').fill('read my hand-in');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('live-polite')).toContainText('Line 2. x equals 4.');
  });

  test('print opens the print dialog and prints only the hand-in', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { printed: number }).printed = 0;
      window.print = () => {
        (window as unknown as { printed: number }).printed += 1;
      };
    });
    await seed(page);
    await openExport(page);
    await page.getByRole('button', { name: 'Print or save as PDF' }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
    await expect(page.getByTestId('live-polite')).toContainText('Save as PDF');

    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('heading', { name: 'Glance', level: 1 })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Download accessible HTML' })).toBeHidden();
    await expect(page.locator('#export-preview')).toBeVisible();
  });

  test('the scratchpad has a Hand in button', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Back to your problem' }).click();
    await page.keyboard.press('s');
    await page.getByRole('button', { name: 'Hand in my work' }).click();
    await expect(page.getByRole('heading', { name: 'Hand in your work' })).toBeFocused();
  });
});
