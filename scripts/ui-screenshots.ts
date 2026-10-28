/**
 * Dev-only visual check: screenshots every mock state of /tv and /play.
 * Usage: npx next dev -p 3100 & ; npx tsx scripts/ui-screenshots.ts [tv|phone|all] [filter]
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = "docs/screenshots";
const which = process.argv[2] ?? "all";
const filter = process.argv[3];

const TV_STATES = ["ambient", "intro", "q-memory-expose", "q-memory", "q-truth", "q-difference", "q-reveal", "q-altar", "q-family-prefer",
  "q-family-predict", "reveal", "reveal-truth", "reveal-family", "results", "interval", "interval-tribute", "interval-tribute-wide", "paused", "longnames"];
const PHONE_STATES = ["ambient", "intro", "q-memory-expose", "q-memory", "q-truth", "q-truth-saved", "q-truth-noncaptain", "q-truth-late",
  "q-family-predict", "practice", "reveal", "reveal-wrong", "results", "interval-tribute", "away", "paused", "longnames"];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const shots: [string, string, number, number, number][] = [];
  if (which !== "phone") {
    for (const st of TV_STATES) shots.push([`tv-1080-${st}`, `/tv?mock=${st}`, 1920, 1080, 1]);
    for (const st of ["ambient", "q-truth", "interval-tribute", "results"]) shots.push([`tv-4k-${st}`, `/tv?mock=${st}`, 3840, 2160, 1]);
  }
  if (which !== "tv") {
    for (const st of PHONE_STATES) shots.push([`phone-375-${st}`, `/play?mock=${st}`, 375, 812, 2]);
    for (const st of ["q-memory", "q-truth-noncaptain", "longnames"]) shots.push([`phone-320-${st}`, `/play?mock=${st}`, 320, 640, 2]);
    for (const st of ["q-memory", "results"]) shots.push([`phone-430-${st}`, `/play?mock=${st}`, 430, 932, 2]);
    shots.push(["phone-landscape-q-memory", "/play?mock=q-memory", 844, 390, 2]);
    shots.push(["phone-375-join", "/join", 375, 812, 2]);
    shots.push(["phone-375-join-code", "/join?code=MARI-7Q", 375, 812, 2]);
    shots.push(["phone-375-landing", "/", 375, 812, 2]);
    shots.push(["desktop-landing", "/", 1440, 900, 1]);
  }
  for (const [name, path, w, h, dpr] of shots) {
    if (filter && !name.includes(filter)) continue;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error(name, "pageerror:", e.message));
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log("✓", name);
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
