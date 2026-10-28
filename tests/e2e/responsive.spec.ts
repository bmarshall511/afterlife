import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { admin, apiJoin, INVITE, resetDemo } from "./helpers";

const OUT = fileURLToPath(new URL("../../.data/e2e-shots", import.meta.url));
async function noOverflow(page: any, label: string) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, `${label}: scrollWidth ${sw} > innerWidth ${iw}`).toBeLessThanOrEqual(iw);
}

for (const [w, h] of [[1920, 1080], [3840, 2160]]) {
  test(`6. TV ${w}x${h}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto("/tv?party=demo");
    await page.waitForTimeout(2000);
    await noOverflow(page, `tv ${w}`);
    const vh = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1);
    expect(vh, "TV should not scroll vertically").toBe(true);
    await page.screenshot({ path: `${OUT}/tv-${w}.png` });
    await ctx.close();
  });
}

const PHONES: [number, number][] = [[320, 640], [375, 812], [430, 932], [844, 390]];
for (const [w, h] of PHONES) {
  test(`6. phone ${w}x${h}: join, play, remember`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, extraHTTPHeaders: { "x-forwarded-for": `10.77.${w % 250}.${h % 250}` } });
    const page = await ctx.newPage();
    await page.goto("/join?party=demo");
    await noOverflow(page, `join ${w}`);
    await page.screenshot({ path: `${OUT}/join-${w}x${h}.png`, fullPage: true });
    await apiJoin(ctx.request, "Maximiliana Guadalupe de la Concepción");
    await page.goto("/play?party=demo");
    await page.waitForTimeout(1500);
    await noOverflow(page, `play ${w}`);
    await page.screenshot({ path: `${OUT}/play-${w}x${h}.png`, fullPage: true });
    await page.goto(`/remember/${INVITE}?party=demo`);
    await noOverflow(page, `remember ${w}`);
    await page.screenshot({ path: `${OUT}/remember-${w}x${h}.png`, fullPage: true });
    await ctx.close();
  });
}

test("6. reduced motion removes backdrop drift and petals", async ({ browser }) => {
  await resetDemo(await admin()); // deterministic ambient state
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/tv?party=demo");
  await page.waitForTimeout(1500);
  const res = await page.evaluate(() => {
    const out: Record<string, string[]> = {};
    for (const sel of [".bd-drift .bd-layer.on img", ".petals", ".petals *", ".bd-accent"]) {
      out[sel] = Array.from(document.querySelectorAll(sel)).map((e) => { const cs = getComputedStyle(e); return `${cs.animationName}|${cs.display}`; });
    }
    return out;
  });
  const all = Object.values(res).flat();
  test.info().annotations.push({ type: "reduced-motion", description: JSON.stringify(res) });
  for (const v of all) expect(v.startsWith("none") || v.endsWith("|none"), v).toBe(true);
  // control: without reduced motion drift is animated
  const ctx2 = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const p2 = await ctx2.newPage();
  await p2.goto("/tv?party=demo");
  await p2.waitForTimeout(1500);
  const anim = await p2.evaluate(() => Array.from(document.querySelectorAll(".bd-drift .bd-layer.on img, .petals *")).map((e) => getComputedStyle(e).animationName));
  expect(anim.some((n) => n !== "none")).toBe(true);
  await ctx.close(); await ctx2.close();
});

test("7b. mocks not reachable in production (/tv?mock=intro shows real state)", async ({ page }) => {
  const real = await (await page.request.get("/api/state?party=live")).json();
  await page.goto("/tv?mock=intro");
  await page.waitForTimeout(2500);
  if (real.phase.kind !== "intro") await expect(page.locator(".tv-intro")).toHaveCount(0);
});
