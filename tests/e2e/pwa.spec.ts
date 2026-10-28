import { devices, expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SHOTS = fileURLToPath(new URL("../../docs/screenshots/v2-real", import.meta.url));
mkdirSync(SHOTS, { recursive: true });

test("P1 manifest valid: name, standalone, 192/512 icons reachable", async ({ request }) => {
  const r = await request.get("/manifest.webmanifest");
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toMatch(/manifest\+json|application\/json/);
  const m = await r.json();
  expect(m.name).toBeTruthy();
  expect(m.short_name ?? m.name).toBeTruthy();
  expect(m.display).toBe("standalone");
  expect(m.start_url).toBeTruthy();
  for (const size of ["192x192", "512x512"]) {
    const icon = (m.icons as any[]).find((i) => String(i.sizes).split(" ").includes(size));
    expect(icon, `icon ${size}`).toBeTruthy();
    const ir = await request.get(icon.src);
    expect(ir.status(), icon.src).toBe(200);
    expect(ir.headers()["content-type"]).toMatch(/image\//);
  }
});

test("P2 Android (Pixel 7): /install shows Android steps; no horizontal overflow", async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await ctx.newPage();
  await page.goto("/install?party=demo");
  await expect(page.getByRole("heading", { name: "Android phone" })).toBeVisible();
  await expect(page.locator(".ig-card").first()).toContainText(/Install app|Add to Home screen/);
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw).toBeLessThanOrEqual(iw);
  await page.screenshot({ path: `${SHOTS}/install-pixel7.png`, fullPage: true });
  await ctx.close();
});

test("P3 landing 'Install app' opens the guide in an in-app sheet; join form has no install step", async ({ page }) => {
  await page.goto("/?party=demo");
  await page.getByRole("button", { name: /Install app/i }).click();
  await expect(page.getByRole("dialog", { name: "Install the app" })).toBeVisible();
  await expect(page).toHaveURL(/\/\?party=demo$/); // stayed on the page: no navigation
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/join?party=demo");
  await expect(page.locator("main")).not.toContainText(/home screen|install/i);
});
