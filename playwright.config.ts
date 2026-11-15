import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'html',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    // A service worker controlling the page hides its requests from
    // page.route on WebKit, so every stubbed API call in the suite would go to
    // the real network instead. Only the test that checks the worker itself
    // turns it back on (a11y.spec.ts, "progressive web app shell").
    serviceWorkers: 'block',
    // Every test starts as a returning visitor, past the first-visit welcome
    // (#200). tests/e2e/welcome.spec.ts clears this to test the welcome itself.
    storageState: 'tests/e2e/welcomed.json',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
  ],
});
