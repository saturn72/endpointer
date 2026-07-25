import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'html',
  globalSetup: './tests/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: {
      MONGODB_URI: process.env.MONGODB_URI ?? 'mongodb://localhost:27017',
      MONGODB_DB: process.env.MONGODB_DB ?? 'endpointer_test',
      S3_ENDPOINT: process.env.S3_ENDPOINT ?? 'http://localhost:8333',
      S3_REGION: process.env.S3_REGION ?? 'us-east-1',
      S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? 'test-key',
      S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ?? 'test-secret',
      S3_RAW_BUCKET: process.env.S3_RAW_BUCKET ?? 'raw',
    },
  },
});
