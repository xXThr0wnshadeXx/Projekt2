// Issue #127 (keyless.spec.ts covers typing with no model; this covers which
// controls are offered): when the server says it has no model, recording and
// capture are not offered as if they worked. A student moving by Tab must never
// land on a control whose only outcome is an error. A server that did not
// answer proves nothing (it may be a cold start), so it is asked again.

import { test, expect, type Page } from '@playwright/test';
import { stubHealth, stubServerWithModels } from './server';

const polite = (page: Page) => page.getByTestId('live-polite');
const CAPTURE_UNAVAILABLE = 'Capture a problem - unavailable right now';

async function openScratchpad(page: Page) {
  await page.getByRole('button', { name: 'Try a sample problem' }).click();
  await expect(page.locator('#L1 mjx-container')).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Start working' }).click();
  await expect(page.getByRole('heading', { name: 'Your work', exact: true })).toBeFocused();
}

test.describe('@smoke without the model', () => {
  for (const state of ['no model key'] as const) {
    test.describe(state, () => {
      test.beforeEach(async ({ page }) => {
        await stubHealth(page, { ok: true, models: false });
        await page.goto('/');
      });

      test('capture stays in the tab order, says why, and does not open', async ({ page }) => {
        const button = page.getByRole('button', { name: CAPTURE_UNAVAILABLE });
        await expect(button).toBeVisible();
        await expect(button).toHaveAttribute('aria-disabled', 'true');
        // Not the `disabled` attribute: that would take it out of the tab order.
        await expect(button).not.toHaveAttribute('disabled');

        await button.focus();
        await expect(button).toBeFocused();
        await button.press('Enter');
        await expect(polite(page)).toContainText('Capture is unavailable right now.');
        await expect(polite(page)).toContainText('The server cannot read images or speech right now.');
        await expect(page.getByRole('heading', { name: /Math for students/ })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Capture a problem' })).toHaveCount(0);
      });

      test('the capture shortcut explains instead of opening', async ({ page }) => {
        await expect(page.getByRole('button', { name: CAPTURE_UNAVAILABLE })).toBeVisible();
        await page.keyboard.press('u');
        await expect(polite(page)).toContainText('Capture is unavailable right now.');
        await expect(page.getByRole('heading', { name: 'Capture a problem' })).toHaveCount(0);
      });

      test('the scratchpad offers typing only', async ({ page }) => {
        await expect(page.getByRole('button', { name: CAPTURE_UNAVAILABLE })).toBeVisible();
        await openScratchpad(page);
        await expect(polite(page)).toContainText('Type a line.');
        await expect(polite(page)).not.toContainText('Record');
        await expect(page.getByTestId('record-button')).toHaveCount(0);
        await expect(page.getByTestId('speech-unavailable')).toHaveText(
          'Speaking a line is unavailable right now. Type it instead.',
        );
      });
    });
  }
});

test.describe('@smoke with the model', () => {
  test.beforeEach(async ({ page }) => {
    await stubServerWithModels(page);
    await page.goto('/');
  });

  test('capture opens as before', async ({ page }) => {
    const button = page.getByRole('button', { name: 'Capture a problem', exact: true });
    await expect(button).not.toHaveAttribute('aria-disabled', /.*/);
    await button.click();
    await expect(page.getByRole('heading', { name: 'Capture a problem' })).toBeFocused();
  });

  test('the scratchpad offers recording', async ({ page }) => {
    await openScratchpad(page);
    await expect(polite(page)).toContainText('Record a line, or type one.');
    await expect(page.getByTestId('speech-unavailable')).toHaveCount(0);
  });
});

test.describe('@smoke health is asked again', () => {
  test('a server that did not answer leaves capture and recording offered', async ({ page }) => {
    await page.route('**/api/health', (r) => r.abort('connectionrefused'));
    await page.goto('/');
    await expect(page.getByText('Reading new problems is unavailable right now.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Capture a problem', exact: true })).toBeVisible();
    await openScratchpad(page);
    await expect(page.getByTestId('speech-unavailable')).toHaveCount(0);
  });

  test('a failed first check is retried without a reload', async ({ page }) => {
    let calls = 0;
    await page.route('**/api/health', (r) => {
      calls += 1;
      if (calls <= 2) return r.abort('connectionrefused');
      return r.fulfill({ json: { ok: true, models: true } });
    });
    await page.goto('/');
    await expect(page.getByText('Reading new problems is unavailable right now.')).toBeVisible();
    // Retried on its own after a couple of seconds, and the warning goes.
    await expect(page.getByText('Reading new problems is unavailable right now.')).toHaveCount(0, { timeout: 10_000 });
  });

  test('coming back to Home asks again, and capture returns once the model is there', async ({ page }) => {
    let models = false;
    await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true, models } }));
    await page.goto('/');
    await expect(page.getByRole('button', { name: CAPTURE_UNAVAILABLE })).toBeVisible();

    models = true;
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Back to the start' }).click();
    await expect(page.getByRole('button', { name: 'Capture a problem', exact: true })).toBeVisible();
  });

  test('opening the scratchpad asks again, and recording returns once the model is there', async ({ page }) => {
    let models = false;
    await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true, models } }));
    await page.goto('/');
    await expect(page.getByRole('button', { name: CAPTURE_UNAVAILABLE })).toBeVisible();

    models = true;
    await openScratchpad(page);
    await expect(page.getByTestId('record-button')).toBeVisible();
  });
});
