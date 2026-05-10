import { defineConfig, devices } from "@playwright/test";

/**
 * Placeholder Playwright config for task 22.1. Real end-to-end suites are
 * added in task 29. Dev server runs on 3001 to leave port 3000 free for the
 * backend (see .env.example → NEXT_PUBLIC_BACKEND_URL).
 */
export default defineConfig({
  testDir: "./tests-e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
