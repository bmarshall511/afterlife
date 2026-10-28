import { expect, request, test } from "@playwright/test";
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { admin, adminAction, ALBUM, apiGuest, BASE, fakeIp, INVITE, resetDemo, snapshot } from "./helpers";

test.describe.configure({ mode: "serial" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SHOTS = fileURLToPath(new URL("../../docs/screenshots/v2-real", import.meta.url));
mkdirSync(SHOTS, { recursive: true });

/** EXIF GPS IFD pointer tag 0x8825, either endianness */
const hasGpsTag = (b: Buffer) => b.includes(Buffer.from([0x88, 0x25])) || b.includes(Buffer.from([0x25, 0x88]));

async function gpsJpeg(w = 1200, h = 900, color = "#336699") {
  const b = await sharp({ create: { width: w, height: h, channels: 3, background: color } })
    .jpeg()
    .withExif({ IFD0: { Make: "TestCam" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "19/1 25/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "99/1 8/1 0/1" } })
    .toBuffer();
  expect(hasGpsTag(b)).toBe(true);
  return b;
}

/** local-mode API upload: multipart raw -> finalize */
async function apiUpload(party: "demo" | "live", caption: string, takenBy: string) {
  const g = await apiGuest();
  const pathname = `album-raw/${party}/${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}.jpg`;
  const u = await g.post("/api/album/upload", { multipart: { token: ALBUM, party, pathname, photo: { name: "x.jpg", mimeType: "image/jpeg", buffer: await gpsJpeg(640, 480, "#aa5500") } } });
  expect(u.status(), await u.text()).toBe(201);
  const f = await g.post("/api/album/finalize", { data: { token: ALBUM, party, pathname, caption, takenBy } });
  expect(f.status(), await f.text()).toBeLessThan(300);
  return f.json();
}

const CAPTION = `<img src=x onerror="window.__xss=1"> Abuela's "mole" & co`;
const TAKEN = `<script>window.__xss=2</script>Tía Lú`;

test("A1 album: bad token page; local multipart upload via UI; caption/taken-by escaped; full download has no GPS", async ({ browser }) => {
  const a = await admin();
  await resetDemo(a);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, extraHTTPHeaders: { "x-forwarded-for": fakeIp() } });
  const page = await ctx.newPage();
  // bad token
  await page.goto("/album/not-the-token?party=demo");
  await expect(page.getByRole("heading", { name: /isn.t working/ })).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  expect((await page.request.get(`/api/album/photos?token=nope&party=demo`)).status()).toBeGreaterThanOrEqual(400);
  // good token
  await page.goto(`/album/${ALBUM}?party=demo`);
  await expect(page.getByRole("heading", { name: "Tonight, in pictures" })).toBeVisible();
  await expect(page.getByText("No photos yet.")).toBeVisible();
  const uploads: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/album/")) uploads.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  await page.locator('input[type="file"]').setInputFiles({ name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: await gpsJpeg() });
  await page.getByPlaceholder("Your name or team").fill(TAKEN);
  await page.getByLabel("Caption for IMG_0001.jpg").fill(CAPTION);
  await page.getByRole("button", { name: /Upload 1 photo/ }).click();
  await expect(page.locator(".al-grid .al-cell")).toHaveCount(1, { timeout: 30_000 });
  expect(uploads).toContain("POST /api/album/upload"); // multipart fallback used (no Blob configured)
  expect(uploads).toContain("POST /api/album/finalize");
  await noOverflow(page, "album 390");
  await page.screenshot({ path: `${SHOTS}/album-phone390.png`, fullPage: true });
  // open lightbox: caption + taken by rendered as text
  await page.locator(".al-tile").first().click();
  await expect(page.locator(".al-lb-cap")).toHaveText(CAPTION);
  await expect(page.locator(".al-lb-by")).toHaveText(`Taken by ${TAKEN}`);
  expect(await page.evaluate(() => (window as any).__xss ?? null)).toBeNull();
  // full download via the lightbox link
  const href = await page.locator(".al-lb-tools a", { hasText: "Download" }).getAttribute("href");
  const full = await page.request.get(href!);
  expect(full.status()).toBe(200);
  const buf = await full.body();
  expect((await sharp(buf).metadata()).format).toBe("jpeg");
  expect(hasGpsTag(buf), "full download must not contain GPS EXIF").toBe(false);
  // full without token is refused
  const list = await (await page.request.get(`/api/album/photos?token=${ALBUM}&party=demo`)).json();
  const p = list.photos[0];
  expect(JSON.stringify(list)).not.toContain(ALBUM); // listing does not echo the token
  const noTok = await (await request.newContext({ baseURL: BASE })).get(p.fullUrl, { maxRedirects: 0 });
  expect(noTok.status()).toBeGreaterThanOrEqual(400);
  for (const size of ["thumb", "display"]) {
    const r = await page.request.get(`/api/album/photo/${p.id}?size=${size}`);
    expect(r.status()).toBe(200);
    expect(hasGpsTag(await r.body()), `${size} has GPS`).toBe(false);
  }
  await ctx.close();
});

test("A2 album slide on TV during interval, never together with a tribute; admin hide removes it; demo reset clears demo album only", async ({ browser }) => {
  const a = await admin();
  // interval: tributes first (14 s), then album slides
  await resetDemo(a, { intervalMs: 60000, intervalTributeMs: 14000, tributeDwellMinMs: 6000, tributeDwellMaxMs: 7000 });
  // live photo must survive the demo reset
  const live = await apiUpload("live", "live keepsake photo", "Host");
  const demo = await apiUpload("demo", "demo slide caption", "Slide Family");
  const demoId = demo.photo?.id ?? demo.id;
  expect(demoId).toBeTruthy();
  // one tribute so slides and tributes alternate
  const g = await apiGuest();
  const tb = await sharp({ create: { width: 600, height: 800, channels: 3, background: "#663322" } }).jpeg().toBuffer();
  const t = await g.post("/api/tributes", { multipart: { token: INVITE, party: "demo", personName: "Tía Abuela Slide", remembrance: "Loved photos.", attribution: "Us", consent: "true", photo: { name: "t.jpg", mimeType: "image/jpeg", buffer: tb } } });
  expect(t.status()).toBe(201);
  await adminAction(a, "start");
  await adminAction(a, "mode", { mode: "tribute_only" });
  const tv = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await tv.newPage();
  await page.goto("/tv?party=demo");
  const seq: string[] = [];
  let both = 0, domBoth = 0, sawSlide = false;
  const end = Date.now() + 70_000;
  while (Date.now() < end) {
    const s = await snapshot(a);
    if (s.phase.tribute && s.phase.slide) both++;
    const k = s.phase.tribute ? "T" : s.phase.slide ? "S" : "-";
    if (seq[seq.length - 1] !== k) seq.push(k);
    const d = await page.evaluate(() => [!!document.querySelector(".tv-tribute-wrap"), !!document.querySelector(".tv-slide-wrap")]);
    if (d[0] && d[1]) domBoth++;
    if (s.phase.slide && !sawSlide) {
      sawSlide = true;
      expect(s.phase.slide.caption).toBe("demo slide caption");
      expect(s.phase.slide.url).not.toContain(ALBUM);
      await expect(page.locator(".tv-slide-wrap")).toBeVisible();
      await expect(page.locator(".slide-caption").last()).toHaveText("demo slide caption");
      await page.screenshot({ path: `${SHOTS}/album-slide-tv.png` });
    }
    if (seq.includes("T") && seq.includes("S") && seq.length >= 4) break;
    await sleep(700);
  }
  test.info().annotations.push({ type: "tv sequence", description: seq.join(" ") });
  expect(sawSlide, `slide never shown; seq=${seq.join(" ")}`).toBe(true);
  expect(both, "tribute and slide simultaneously in state").toBe(0);
  expect(domBoth, "tribute and slide simultaneously on TV").toBe(0);
  const firstT = seq.indexOf("T"), firstS = seq.indexOf("S");
  expect.soft(firstT >= 0 && firstT < firstS, `slides come after tributes: ${seq.join(" ")}`).toBe(true);
  // admin hide -> disappears from album + TV
  const h = await a.patch(`/api/admin/album/${demoId}`, { data: { status: "hidden" } });
  expect(h.status(), await h.text()).toBe(200);
  const list = await (await a.get(`/api/album/photos?token=${ALBUM}&party=demo`)).json();
  expect(list.photos.find((p: any) => p.id === demoId)).toBeUndefined();
  expect((await (await request.newContext({ baseURL: BASE })).get(`/api/album/photo/${demoId}?size=display`)).status()).toBe(404);
  await sleep(9000);
  const s2 = await snapshot(a);
  expect(s2.phase.slide?.id ?? null).not.toBe(demoId);
  await page.goto(`/album/${ALBUM}?party=demo`);
  await expect(page.getByText("demo slide caption")).toHaveCount(0);
  // demo reset removes demo album; live untouched
  await apiUpload("demo", "second demo", "X");
  await resetDemo(a);
  const demoAdm = await (await a.get("/api/admin/album?party=demo")).json();
  expect(demoAdm.photos.length).toBe(0);
  const liveList = await (await a.get(`/api/album/photos?token=${ALBUM}&party=live`)).json();
  expect(liveList.photos.some((p: any) => p.caption === "live keepsake photo")).toBe(true);
  void live;
  await tv.close();
});

async function noOverflow(page: any, label: string) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect.soft(sw, `${label}: scrollWidth ${sw} > ${iw}`).toBeLessThanOrEqual(iw);
}
