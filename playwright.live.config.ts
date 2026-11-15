import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/live',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'html',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.LIVE_FRONTEND_URL?.trim(),
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
  ],
});
