// Issue #127 (keyless.spec.ts covers typing with no model; this covers which
// controls are offered): with no model on the server, or no server, recording and capture
// are not offered as if they worked. A student moving by Tab must never land
// on a control whose only outcome is an error.

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
  for (const state of ['no model key', 'no server'] as const) {
    test.describe(state, () => {
      test.beforeEach(async ({ page }) => {
        if (state === 'no model key') await stubHealth(page, { ok: true, models: false });
        else await page.route('**/api/health', (r) => r.abort('connectionrefused'));
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
        await expect(polite(page)).toContainText(
          state === 'no server'
            ? 'The server is not reachable.'
            : 'The server cannot read images or speech right now.',
        );
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
