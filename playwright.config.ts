import { defineConfig, devices } from '@playwright/test';

// Provide a minimal declaration for `process` to satisfy TypeScript when
// @types/node is not installed. For a proper fix, install @types/node and
// add "node" to the "types" in your tsconfig.json.
declare const process: any;

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

/**
 * Determine target environment from CLI args (--env=uat|dev|demo), process.env.ENV, or fallback to 'dev'
 */
function resolveSelectedEnv(): string {
  if (process.env.ENV) return process.env.ENV.toLowerCase();
  if (process.env.TEST_ENV) return process.env.TEST_ENV.toLowerCase();
  const envArg = process.argv.find(arg => arg.toLowerCase().startsWith('--env='));
  if (envArg) return envArg.split('=')[1].toLowerCase();
  return 'dev';
}

const selectedEnv = resolveSelectedEnv();
const envFileName = `.env.${selectedEnv}`;
const envFilePath = path.resolve(__dirname, envFileName);

if (fs.existsSync(envFilePath)) {
  dotenv.config({ path: envFilePath, override: !process.env.BASE_URL });
} else {
  dotenv.config({ path: path.resolve(__dirname, '.env') });
}

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['html']],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: process.env.BASE_URL || 'https://lockerdev.glcredentials.com/',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure', // capture screenshot on failure
    video: 'retain-on-failure', // capture video on failure
    //navigationTimeout: 60000 // if my application is taking more time to load, then we can increase the timeout value

  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    /*{
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },*/

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

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
