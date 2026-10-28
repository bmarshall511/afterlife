import { defineConfig, devices } from "@playwright/test";
// Tributes "Your tributes" flows against an already-running server (default dev server :3000).
export default defineConfig({
  testDir: ".",
  testMatch: /tributes-manage\.spec\.ts/,
  outputDir: "../../.data/e2e-results-tributes-manage",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "webkit-iphone", use: { ...devices["iPhone 13"] } },
  ],
});
