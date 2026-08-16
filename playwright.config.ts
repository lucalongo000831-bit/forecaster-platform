import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const localChannel = process.platform === "darwin" ? "chrome" : undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure", video: "off" },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], channel: localChannel } },
    { name: "tablet-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 1366 }, channel: localChannel } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"], channel: localChannel } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
