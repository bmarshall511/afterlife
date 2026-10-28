import { expect, test } from "@playwright/test";

// iPhone 13 (WebKit) — join to controller and no horizontal overflow
test("webkit iPhone: join -> controller, refresh restores", async ({ page }) => {
  await page.goto("/join?party=demo");
  await page.getByPlaceholder("e.g. Lucía").fill("Safari");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await page.waitForURL(/\/play/);
  await expect(page.getByText("Safari's Family").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Safari's Family").first()).toBeVisible();
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw).toBeLessThanOrEqual(iw);
  // vibration API absent/unsupported must not throw
  const ok = await page.evaluate(() => { try { (navigator as any).vibrate?.(50); return true; } catch { return false; } });
  expect(ok).toBe(true);
});
