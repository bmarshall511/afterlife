/**
 * Loads every mock screen state at TV and phone sizes and reports text that does not fit its box
 * (horizontal or vertical clipping/overflow) and any page-level horizontal scroll.
 * Usage: npx tsx scripts/ui-overflow-audit.ts [baseUrl]   (needs `next dev` running; mocks are dev-only)
 */
import { chromium } from "@playwright/test";
import { MOCK_STATES } from "../src/client/mocks";

const BASE = process.argv[2] ?? "http://localhost:3000";
const VIEWS: [string, string, number, number][] = [
  ["tv-1080", "/tv", 1920, 1080],
  ["tv-4k", "/tv", 3840, 2160],
  ["tv-720", "/tv", 1280, 720],
  ["phone-320", "/play", 320, 640],
  ["phone-375", "/play", 375, 812],
  ["phone-land", "/play", 844, 390],
];

const PROBE = `(() => {
  const out = [];
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push({ sel: "PAGE", issue: "horizontal scroll " + document.documentElement.scrollWidth + ">" + innerWidth });
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || el.closest("[aria-hidden=true]")) continue;
    if (!el.textContent || !el.textContent.trim()) continue;
    const hasOwnText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!hasOwnText) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const name = el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\\s+/).join(".") : "");
    const text = el.textContent.trim().slice(0, 40);
    const clipped = cs.textOverflow === "ellipsis" || el.classList.contains("sr-only");
    if (!clipped && el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== "auto" && cs.overflowX !== "scroll") out.push({ sel: name, issue: "text wider than box (" + el.scrollWidth + ">" + el.clientWidth + ")", text });
    // text escaping an ancestor card/box with a border or background
    let p = el.parentElement;
    for (let i = 0; p && i < 4; i++, p = p.parentElement) {
      const pcs = getComputedStyle(p);
      const boxed = pcs.borderTopWidth !== "0px" || (pcs.backgroundColor !== "rgba(0, 0, 0, 0)" && pcs.backgroundColor !== "transparent");
      if (!boxed) continue;
      const pr = p.getBoundingClientRect();
      if (r.left < pr.left - 2 || r.right > pr.right + 2 || r.bottom > pr.bottom + 2) out.push({ sel: name, issue: "text spills outside its card", text });
      break;
    }
    if (r.right > innerWidth + 1 || r.left < -1) out.push({ sel: name, issue: "off-screen", text });
  }
  return out;
})()`;

const b = await chromium.launch();
let total = 0;
for (const [label, path, w, h] of VIEWS) {
  const page = await b.newPage({ viewport: { width: w, height: h }, reducedMotion: "reduce" }); // measure settled layout, not mid-animation
  for (const st of MOCK_STATES as readonly string[]) {
    await page.goto(`${BASE}${path}?mock=${st}`, { waitUntil: "load" });
    await page.waitForTimeout(700);
    const issues = (await page.evaluate(PROBE)) as { sel: string; issue: string; text?: string }[];
    const uniq = [...new Map(issues.map((i) => [i.sel + i.issue, i])).values()];
    for (const i of uniq) console.log(`${label}\t${st}\t${i.issue}\t${i.sel}\t${i.text ?? ""}`);
    total += uniq.length;
  }
  await page.close();
}
console.log(`TOTAL ${total}`);
await b.close();
