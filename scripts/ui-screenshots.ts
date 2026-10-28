/**
 * Dev-only visual check: screenshots every v2 mock state of /tv and /play into docs/screenshots/v2.
 * Also fails loudly on horizontal overflow (phones) and page errors.
 * Usage: npx next dev -p 3100 & ; npx tsx scripts/ui-screenshots.ts [tv|phone|all] [filter] [--reduced]
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = "docs/screenshots/v2";
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const reduced = process.argv.includes("--reduced");
const which = args[0] ?? "all";
const filter = args[1];

const TV_STATES = ["ambient", "intro", "intro-doubled",
  "q-calavera-write", "q-calavera-vote", "reveal-calavera",
  "q-line", "q-line-doubled", "reveal-line",
  "q-loteria", "q-loteria-9", "reveal-loteria",
  "q-room-answer", "q-room-guess", "reveal-room",
  "q-closest", "reveal-closest", "longnames",
  "q-case-clue", "q-case-answer", "reveal-case-mid", "reveal-case-final",
  "results", "results-doubled", "interval", "interval-tribute", "interval-slide", "interval-slide-portrait", "paused"];
const PHONE_STATES = ["intro-doubled",
  "q-calavera-write", "q-calavera-write-saved", "q-calavera-filtered", "q-calavera-vote", "q-calavera-vote-saved", "reveal-calavera",
  "q-line", "q-line-saved", "reveal-line",
  "q-loteria", "q-loteria-late", "reveal-loteria", "reveal-loteria-wrong",
  "q-room-answer", "q-room-guess", "q-room-guess-noanswer", "reveal-room",
  "q-closest", "q-closest-noncaptain", "reveal-closest",
  "q-case-clue", "q-case-answer", "q-case-locked", "reveal-case-mid", "reveal-case-final",
  "results", "practice", "away", "longnames"];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const shots: [string, string, number, number, number][] = [];
  if (which !== "phone") {
    for (const st of TV_STATES) shots.push([`tv-1080-${st}`, `/tv?mock=${st}`, 1920, 1080, 1]);
    for (const st of ["q-loteria", "reveal-closest", "q-case-answer", "reveal-calavera"]) shots.push([`tv-4k-${st}`, `/tv?mock=${st}`, 3840, 2160, 1]);
  }
  if (which !== "tv") {
    for (const st of PHONE_STATES) shots.push([`phone-375-${st}`, `/play?mock=${st}`, 375, 812, 2]);
    for (const st of ["q-line", "q-loteria", "q-closest", "q-room-guess", "q-case-answer", "q-calavera-vote", "longnames"]) shots.push([`phone-320-${st}`, `/play?mock=${st}`, 320, 640, 2]);
    for (const st of ["q-loteria", "q-case-answer", "reveal-line"]) shots.push([`phone-430-${st}`, `/play?mock=${st}`, 430, 932, 2]);
    for (const st of ["q-line", "q-case-answer", "q-closest"]) shots.push([`phone-landscape-${st}`, `/play?mock=${st}`, 844, 390, 2]);
    shots.push(["phone-375-landing", "/", 375, 812, 2]);
  }
  let overflow = 0;
  for (const [name, path, w, h, dpr] of shots) {
    if (filter && !name.includes(filter)) continue;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, reducedMotion: reduced ? "reduce" : "no-preference" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error(name, "pageerror:", e.message));
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(2600);
    const ow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (ow > 0) { overflow++; console.error(`✗ ${name}: horizontal overflow ${ow}px`); }
    await page.screenshot({ path: `${OUT}/${name}${reduced ? "-reduced" : ""}.png`, fullPage: name.startsWith("phone") && !name.includes("landscape") });
    console.log("✓", name);
    await ctx.close();
  }
  await browser.close();
  if (overflow) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exit(1); });
