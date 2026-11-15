// Voice and typed commands in the scratchpad — issue #24.
//
// /api/command is stubbed: the rule parser behind it has its own back-end
// tests (tests/test_command.py). What is tested here is what the app does with
// each intent, that math is never mistaken for a command, and the acceptance
// criterion: an unknown command says "I didn't catch that."

import { test, expect, type Page } from '@playwright/test';

const PROBLEM = {
  instructions: 'Solve for x.',
  lines: [{ id: 'L1', latex: '3x + 3 = 12', confidence: 1, intent_notes: '', valid: true }],
  diagrams: [],
  warnings: [],
  source: 'sample',
};

const WORK = [
  { id: 'W101', latex: '3x = 9', readback: '3 x equals 9', valid: true },
  { id: 'W102', latex: 'x = 3', readback: 'x equals 3', valid: true },
  { id: 'W103', latex: 'x = 3', readback: 'x equals 3 again', valid: true },
];

type Reply = { intent: string; target_line: string | null; instruction: string | null };

/** Seed saved work, stub the command route, and open the scratchpad. */
async function open(page: Page, reply: Reply, spoken?: unknown) {
  const calls = { command: [] as unknown[], spoken: 0 };
  await page.addInitScript(
    ([problem, work]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('glance.problem.v1', JSON.stringify(problem));
      localStorage.setItem('glance.work.v1', JSON.stringify(work));
    },
    [PROBLEM, WORK] as const,
  );
  await page.route('**/api/command', async (route) => {
    calls.command.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) });
  });
  await page.route('**/api/spoken-to-latex', async (route) => {
    calls.spoken += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        spoken ?? { latex: '2x = 8', ambiguous: false, clarifying_question: null, alternatives: [], readback: '2 x equals 8', valid: true },
      ),
    });
  });
  await page.route('**/api/diff', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ verified: true, method: 'ratio_constant', message: 'This step checks out.' }) }),
  );
  await page.goto('/');
  await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
  await page.locator('#L1').focus();
  await page.keyboard.press('s');
  await expect(page.getByRole('heading', { name: 'Your work', exact: true })).toBeFocused();
  return calls;
}

async function say(page: Page, text: string) {
  await page.getByLabel('Or type your line').fill(text);
  await page.getByRole('button', { name: 'Add line' }).click();
}

const polite = (page: Page) => page.getByTestId('live-polite');
const workLines = (page: Page) => page.getByRole('region', { name: 'Your lines' }).getByRole('listitem');

test.describe('@smoke commands', () => {
  test('"delete line two" deletes that line, with undo, and is not written as math', async ({ page }) => {
    const calls = await open(page, { intent: 'delete', target_line: 'W2', instruction: null });
    await say(page, 'delete line two');
    await expect(polite(page)).toHaveText('Deleted line 2. Press U to undo.');
    await expect(workLines(page)).toHaveCount(2);
    expect(calls.command).toEqual([{ text: 'delete line two', current_line: null, line_count: 3 }]);
    expect(calls.spoken).toBe(0);
  });

  test('an unknown command says "I didn\'t catch that."', async ({ page }) => {
    await open(page, { intent: 'unknown', target_line: null, instruction: null });
    await say(page, 'read the weather');
    await expect(polite(page)).toContainText("I didn't catch that.");
    await expect(workLines(page)).toHaveCount(3);
  });

  test('math is still math: it never goes to the command route', async ({ page }) => {
    const calls = await open(page, { intent: 'unknown', target_line: null, instruction: null });
    await say(page, 'two x equals eight');
    await expect(page.getByRole('region', { name: 'Confirm your line' })).toBeVisible();
    expect(calls.command).toHaveLength(0);
    expect(calls.spoken).toBe(1);
  });

  test('navigate moves focus to the line and reads it', async ({ page }) => {
    await open(page, { intent: 'navigate', target_line: 'W3', instruction: null });
    await say(page, 'go to line three');
    await expect(page.locator('#W103')).toBeFocused();
    await expect(polite(page)).toHaveText('Line 3. x equals 3 again');
  });

  test('a line that does not exist is named, not guessed', async ({ page }) => {
    await open(page, { intent: 'navigate', target_line: 'W9', instruction: null });
    await say(page, 'go to line nine');
    await expect(polite(page)).toHaveText('There is no line 9. You have 3 lines.');
  });

  test('read all reads the student\'s work', async ({ page }) => {
    await open(page, { intent: 'read', target_line: null, instruction: 'all' });
    await say(page, 'read my work');
    await expect(polite(page)).toHaveText('Line 1. 3 x equals 9. Line 2. x equals 3. Line 3. x equals 3 again.');
  });

  test('an edit lands in the box, is read back, and replaces the line once confirmed', async ({ page }) => {
    await open(
      page,
      { intent: 'edit', target_line: 'W1', instruction: 'replace three with four' },
      { latex: '4x = 9', ambiguous: false, clarifying_question: null, alternatives: [], readback: '4 x equals 9', valid: true },
    );
    // This test is about the edit, not the step check that follows it.
    await page.route('**/api/diff', (route) => route.abort());
    await say(page, 'change the three to a four');
    const box = page.getByLabel('Or type your line');
    await expect(box).toBeFocused();
    await expect(box).toHaveValue('4x = 9');
    await expect(polite(page)).toHaveText('Line 1 is in the edit box with that change. Press Add line to hear it back.');
    // Nothing changed yet: the student has not confirmed.
    await expect(page.getByRole('group', { name: 'Your line 1', exact: true })).toContainText('3');

    await page.getByRole('button', { name: 'Add line' }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(polite(page)).toHaveText('Updated line 1.');
    await expect(workLines(page)).toHaveCount(3);
    // Replaced in place, not appended: line 1 is now 4x = 9.
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('glance.work.v1') ?? '[]').map((l: { latex: string }) => l.latex),
    );
    expect(saved).toEqual(['4x = 9', 'x = 3', 'x = 3']);
  });

  test('check is off in exam mode', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem('glance.settings.v1', JSON.stringify({ mode: 'exam', selfVoicing: false })),
    );
    await open(page, { intent: 'check', target_line: 'W1', instruction: null });
    await say(page, 'check this step');
    await expect(polite(page)).toHaveText('Step checking is off in exam mode.');
  });

  test('check reads the verdict for that line', async ({ page }) => {
    await open(page, { intent: 'check', target_line: 'W1', instruction: null });
    await say(page, 'check line one');
    await expect(polite(page)).toHaveText('Line 1. This step checks out.');
  });

  test('"hand in" moves to the hand-in section', async ({ page }) => {
    await open(page, { intent: 'export', target_line: null, instruction: null });
    await say(page, 'hand in my work');
    await expect(page.getByRole('heading', { name: 'Hand in your work' })).toBeFocused();
  });

  test('"help" lists what can be said', async ({ page }) => {
    await open(page, { intent: 'help', target_line: null, instruction: null });
    await say(page, 'help');
    await expect(polite(page)).toContainText('Say or type a command');
  });
});
