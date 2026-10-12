import { defineConfig, devices } from '@playwright/test';

// Identity gate only: needs Casdoor and the dashboard, not S3 or the manager service.
export default defineConfig({
  testDir: './tests',
  testMatch: 'auth.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
  },
});
