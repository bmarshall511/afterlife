import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { admin, adminAction, apiGuest, BASE, INVITE, resetDemo, snapshot, waitPhase } from "./helpers";

test.describe.configure({ mode: "serial" });

async function jpeg(w: number, h: number, orientation?: number) {
  let img = sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg({ quality: 80 });
  if (orientation) img = img.withMetadata({ orientation });
  return img.toBuffer();
}

async function upload(ctx: any, file: { name: string; mimeType: string; buffer: Buffer }, fields: Record<string, string> = {}) {
  const r = await ctx.post("/api/tributes", {
    multipart: { token: INVITE, party: "demo", personName: "Abuela Rosa", remembrance: "She sang every morning.", attribution: "The test family", consent: "true", ...fields, photo: file },
  });
  return { status: r.status(), body: await r.json().catch(() => null) };
}

test("4a. tribute API: format handling, consent required, edit token scope, deleted photo not served", async () => {
  const a = await admin();
  await resetDemo(a);
  const g = await apiGuest();
  const portrait = await upload(g, { name: "p.jpg", mimeType: "image/jpeg", buffer: await jpeg(600, 900) });
  expect(portrait.status, JSON.stringify(portrait.body)).toBe(201);
  const t = portrait.body.tribute;
  expect(t.width).toBeLessThan(t.height);
  const land = await upload(g, { name: "l.jpg", mimeType: "image/jpeg", buffer: await jpeg(1200, 600) });
  expect(land.status).toBe(201);
  expect(land.body.tribute.width).toBeGreaterThan(land.body.tribute.height);
  // EXIF orientation 6 (rotate 90) on an 800x400 raw image -> displayed 400x800 portrait
  const ex = await upload(g, { name: "e.jpg", mimeType: "image/jpeg", buffer: await jpeg(800, 400, 6) });
  expect(ex.status).toBe(201);
  expect(ex.body.tribute.width, "EXIF rotation applied").toBeLessThan(ex.body.tribute.height);
  const png = await upload(g, { name: "x.png", mimeType: "image/png", buffer: await sharp({ create: { width: 500, height: 500, channels: 4, background: "#336699" } }).png().toBuffer() });
  expect(png.status).toBe(201);
  // re-encoded derivative strips metadata
  const photo = await g.get(`/api/tributes/photo/${ex.body.id}?size=display`);
  expect(photo.status()).toBe(200);
  const meta = await sharp(await photo.body()).metadata();
  expect(meta.exif, "EXIF stripped").toBeFalsy();
  expect(meta.orientation ?? 1).toBe(1);

  const corrupt = await upload(g, { name: "c.jpg", mimeType: "image/jpeg", buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(5000, 7)]) });
  expect(corrupt.status).toBeGreaterThanOrEqual(400);
  expect(corrupt.body.error).toBeTruthy();
  const txt = await upload(g, { name: "notes.jpg", mimeType: "image/jpeg", buffer: Buffer.from("<script>alert(1)</script> just text") });
  expect(txt.status).toBeGreaterThanOrEqual(400);
  const big = await upload(g, { name: "big.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(16 * 1024 * 1024, 1) });
  expect(big.status).toBe(413);
  const noConsent = await upload(g, { name: "p.jpg", mimeType: "image/jpeg", buffer: await jpeg(300, 400) }, { consent: "" });
  expect(noConsent.status).toBeGreaterThanOrEqual(400);
  const badTok = await g.post("/api/tributes", { multipart: { token: "nope-nope", party: "demo", personName: "X", consent: "true", photo: { name: "p.jpg", mimeType: "image/jpeg", buffer: await jpeg(300, 400) } } });
  expect(badTok.status()).toBe(404);
  // markup stays plain text
  const xss = await upload(g, { name: "p.jpg", mimeType: "image/jpeg", buffer: await jpeg(300, 400) }, { personName: "<img src=x onerror=alert(1)>" });
  expect(xss.status).toBe(201);

  // edit token scope: token of A cannot edit B
  const A = portrait.body, B = land.body;
  const cross = await g.patch(`/api/tributes/${B.id}`, { headers: { authorization: `Bearer ${A.editToken}` }, data: { personName: "Hijacked" } });
  expect(cross.status()).toBeGreaterThanOrEqual(400);
  const own = await g.patch(`/api/tributes/${A.id}`, { headers: { authorization: `Bearer ${A.editToken}` }, data: { personName: "Abuela Rosa M." } });
  expect(own.status()).toBe(200);
  const noAuth = await g.delete(`/api/tributes/${B.id}`);
  expect(noAuth.status()).toBeGreaterThanOrEqual(400);
  const del = await g.delete(`/api/tributes/${A.id}`, { headers: { authorization: `Bearer ${A.editToken}` } });
  expect(del.status()).toBe(200);
  const gone = await g.get(`/api/tributes/photo/${A.id}?size=display`);
  expect(gone.status()).toBeGreaterThanOrEqual(400);
});

test("4b. /remember UI: no team needed, consent unchecked by default & required, publish then edit link", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`/remember/${INVITE}?party=demo`);
  const consent = page.locator('input[type="checkbox"]');
  await expect(consent).not.toBeChecked();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "p.jpg", mimeType: "image/jpeg", buffer: await jpeg(600, 900) });
  await page.locator("input.rm-input").first().fill("Tío Pepe");
  const publish = page.getByRole("button", { name: /Publish tribute/ });
  await expect(publish).toBeDisabled();
  await consent.check();
  await expect(publish).toBeEnabled();
  const [resp] = await Promise.all([page.waitForResponse((r) => r.url().includes("/api/tributes") && r.request().method() === "POST"), publish.click()]);
  expect(resp.status()).toBe(201);
  await page.getByRole("link", { name: "Edit now" }).click();
  await page.waitForURL(/\/remember\/edit\//);
  await expect(page.locator("input.rm-input").first()).toHaveValue("Tío Pepe");
  // invalid token page
  const p2 = await ctx.newPage();
  await p2.goto(`/remember/definitely-wrong-token?party=demo`);
  await expect(p2.locator("body")).toContainText(/isn.t valid|not valid|invalid|ask the host/i);
  await expect(p2.locator('input[type="file"]')).toHaveCount(0);
  await ctx.close();
});

test("4c. tribute on TV in interval without scores/timers; admin hide removes it", async ({ browser }) => {
  const a = await admin();
  await resetDemo(a);
  const g = await apiGuest();
  const t = await upload(g, { name: "p.jpg", mimeType: "image/jpeg", buffer: await jpeg(600, 900) }, { personName: "Bisabuelo Ramón" });
  expect(t.status).toBe(201);
  await adminAction(a, "start");
  await adminAction(a, "mode", { mode: "tribute_only" });
  const tv = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await tv.newPage();
  await page.goto("/tv?party=demo");
  await expect(page.getByText("Bisabuelo Ramón")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".tv-count, .tv-count-sm, .countdown, .tv-board, .st-row")).toHaveCount(0);
  await page.screenshot({ path: fileURLToPath(new URL("../../.data/e2e-shots/tv-tribute.png", import.meta.url)) });
  const h = await a.patch(`/api/admin/tributes/${t.body.id}`, { data: { status: "hidden" } });
  expect(h.status(), await h.text()).toBe(200);
  await expect(page.getByText("Bisabuelo Ramón")).toHaveCount(0, { timeout: 15_000 });
  const s = await snapshot(a);
  expect(JSON.stringify(s)).not.toContain("Bisabuelo Ramón");
  await tv.close();
});
