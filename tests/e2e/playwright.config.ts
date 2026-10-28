import { defineConfig, devices } from "@playwright/test";

// Server is started externally (production build): see verifier report.
// BASE_URL defaults to http://localhost:3200.
export default defineConfig({
  testDir: ".",
  outputDir: "../../.data/e2e-results",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:3200", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: /webkit\.spec/ },
    { name: "webkit-iphone", use: { ...devices["iPhone 13"] }, testMatch: /webkit\.spec/ },
  ],
});
