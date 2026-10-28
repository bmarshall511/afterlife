import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SHOTS = fileURLToPath(new URL("../../docs/screenshots/v2-real", import.meta.url));
mkdirSync(SHOTS, { recursive: true });
const noOverflow = async (page: any) => {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, `scrollWidth ${sw} > ${iw}`).toBeLessThanOrEqual(iw);
};

// iPhone 13 (WebKit) — join to controller and no horizontal overflow
test("webkit iPhone: join -> controller (no install step), refresh restores", async ({ page }) => {
  await page.goto("/join?party=demo");
  await expect(page.getByText(/home screen/i)).toHaveCount(0);
  await page.getByPlaceholder("e.g. Lucía").fill("Safari");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await page.waitForURL(/\/play/); // straight to the controller, no install interstitial
  await expect(page.getByText("Safari's Family").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Safari's Family").first()).toBeVisible();
  await noOverflow(page);
  await expect(page.getByRole("link", { name: /Install app/i })).toHaveAttribute("href", /\/install/);
  const ok = await page.evaluate(() => { try { (navigator as any).vibrate?.(50); return true; } catch { return false; } });
  expect(ok).toBe(true);
});

test("webkit iPhone: /install shows iPhone Safari steps", async ({ page }) => {
  await page.goto("/install?party=demo");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/home screen/i);
  await expect(page.getByRole("heading", { name: "iPhone or iPad" })).toBeVisible();
  await expect(page.locator(".ig-card").first()).toContainText("Add to Home Screen");
  await expect(page.locator(".ig-card").first()).toContainText("Share");
  await noOverflow(page);
  await page.screenshot({ path: `${SHOTS}/install-iphone13.png`, fullPage: true });
});
