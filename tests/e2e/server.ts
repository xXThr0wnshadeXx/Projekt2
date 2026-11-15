// The suite runs with no back end. Recording and capture are only offered when
// /api/health says the server can use its model (#127), so a test that needs
// either says so here instead of depending on whatever is on port 8000.

import type { Page } from '@playwright/test';

export async function stubHealth(page: Page, health: { ok: boolean; models?: boolean }) {
  await page.route('**/api/health', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(health) }),
  );
}

/** A server with its model configured: capture and recording are offered. */
export function stubServerWithModels(page: Page) {
  return stubHealth(page, { ok: true, models: true });
}
