/** Controller (/play) chrome screenshots: states × widths, plus each tab-bar sheet open. Usage: npx tsx scripts/ui-controller-shots.ts [baseUrl] */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = "docs/screenshots/v2/controller";
async function main() {
  await mkdir(OUT, { recursive: true });
  const b = await chromium.launch();
  const shots: [string, string, number, number][] = [];
  for (const w of [320, 375, 430]) for (const st of ["ambient", "interval", "q-loteria", "reveal-closest"]) shots.push([`phone-${w}-${st}`, `/play?mock=${st}`, w, w === 320 ? 640 : w === 375 ? 812 : 932]);
  for (const sh of ["photos", "remember", "history", "more"]) shots.push([`phone-375-sheet-${sh}`, `/play?mock=ambient&sheet=${sh}`, 375, 812]);
  let bad = 0;
  for (const [name, path, w, h] of shots) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => console.error(name, e.message));
    await p.goto(BASE + path, { waitUntil: "load", timeout: 30000 });
    await p.waitForTimeout(1800);
    const ow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (ow > 0) { bad++; console.error("overflow", name, ow); }
    await p.screenshot({ path: `${OUT}/${name}.png` });
    await ctx.close();
  }
  await b.close();
  if (bad) process.exitCode = 1;
}
main();
