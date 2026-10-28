/**
 * Dev-only: drives the REAL API on party=demo (reset → 3 phones join → start) and screenshots TV + phones.
 * Usage: npx next dev -p 3100 ; ADMIN_PASSWORD=<dev pw> npx tsx scripts/ui-real-flow.ts
 */
import { chromium, type Page } from "@playwright/test";
const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = "docs/screenshots/real";
const PW = process.env.ADMIN_PASSWORD ?? "";

async function main() {
  const browser = await chromium.launch();
  const admin = await browser.newContext();
  const ar = admin.request;
  const login = await ar.post(`${BASE}/api/admin/login`, { data: { password: PW } });
  if (!login.ok()) throw new Error("admin login failed " + login.status());
  const ctl = async (data: Record<string, unknown>) => {
    const r = await ar.post(`${BASE}/api/admin/party`, { data: { party: "demo", ...data } });
    console.log("admin", data.action, r.status(), r.ok() ? "" : await r.text());
  };
  await ctl({ action: "reset", confirm: true });
  await ctl({ action: "settings", patch: { introMs: 6000, questionMs: 15000, memoryExposeMs: 6000, familyPreferMs: 8000, revealMs: 6000, resultsMs: 8000, intervalMs: 15000, minViewMs: 2000 } });

  const tvCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tv = await tvCtx.newPage();
  tv.on("pageerror", (e) => console.error("tv pageerror", e.message));
  await tv.goto(`${BASE}/tv?party=demo`);

  const phones: Page[] = [];
  for (const [i, name] of ["Ana", "Beto", "Carmen"].entries()) {
    const c = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
    const p = await c.newPage();
    p.on("pageerror", (e) => console.error("phone pageerror", e.message));
    await p.goto(`${BASE}/join?party=demo`);
    await p.fill("input", name);
    await p.click("button[type=submit]");
    await p.waitForURL(/\/play/);
    phones.push(p);
    if (i === 0) await p.screenshot({ path: `${OUT}/phone-ana-joined.png` });
  }
  await tv.waitForTimeout(2500);
  await tv.screenshot({ path: `${OUT}/tv-00-ambient.png` });
  await ctl({ action: "start" });

  const seen = new Set<string>();
  const t0 = Date.now();
  while (Date.now() - t0 < 150_000) {
    const phase = await tv.locator("main.tv").getAttribute("data-phase").catch(() => null);
    const stageKey = phase + ":" + (await tv.locator(".tv-fam").first().textContent().catch(() => "")) + ":" + (await tv.locator(".tv-eyebrow").first().textContent().catch(() => ""));
    if (phase && !seen.has(stageKey)) {
      seen.add(stageKey);
      const n = String(seen.size).padStart(2, "0");
      await tv.waitForTimeout(900);
      await tv.screenshot({ path: `${OUT}/tv-${n}-${phase}.png` });
      // phones answer when choices are enabled
      for (const [i, p] of phones.entries()) {
        const btn = p.locator(".ph-opt:not([disabled])").nth(i % 2);
        if (await btn.count()) await btn.click().catch(() => {});
      }
      await phones[0].waitForTimeout(1200);
      await phones[0].screenshot({ path: `${OUT}/phone-${n}-${phase}.png` });
      console.log("captured", n, stageKey.replace(/\s+/g, " "));
    }
    await tv.waitForTimeout(700);
    if (phase === "interval" && seen.size > 6) break;
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
