import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  retries: process.env.CI ? 1 : 0,
  use: {
    trace: 'retain-on-failure',
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    url: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120_000,
  },
};

export default config;
