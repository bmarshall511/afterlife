/** Clicks every demo-bar control in a real browser from a freshly reset demo and checks the result of each. */
import { readFileSync as __r } from "node:fs";
const LOCAL_PW = process.env.ADMIN_PASSWORD ?? (() => { try { return __r(".env.local", "utf8").match(/^ADMIN_PASSWORD=(.*)$/m)?.[1]?.trim(); } catch { return undefined; } })() ?? "afterlife-dev";
import { chromium } from "@playwright/test";
const B = process.argv[2] ?? "http://localhost:3000";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
const errs: string[] = []; p.on("pageerror", (e) => errs.push(e.message));
await p.request.post(`${B}/api/admin/login`, { data: { password: LOCAL_PW } });
await p.request.post(`${B}/api/admin/party`, { data: { party: "demo", action: "reset", confirm: true } });
await p.goto(`${B}/tv?party=demo`); await p.waitForTimeout(3000);
const bar = p.locator(".demobar");
const st = async () => (await p.request.get(`${B}/api/state?party=demo`)).json();
const msg = async () => (await bar.locator(".demobar-msg, .demobar-wait").first().textContent().catch(() => ""))?.trim();
const fails: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); if (!ok) fails.push(what); };

await bar.getByRole("button", { name: /Start/ }).click(); await p.waitForTimeout(2500);
let s = await st();
check(s.status === "running", `Start → running (${s.status}/${s.phase.kind})`);
check(await bar.getByRole("button", { name: /Next step/ }).isDisabled(), "Next step disabled while no families");
await p.waitForTimeout(4000); // the "Demo started" confirmation fades, then the hint shows
check(/No families yet/.test((await msg()) ?? ""), `waiting hint shown: "${await msg()}"`);

await bar.getByRole("button", { name: "La Lotería", exact: true }).click(); await p.waitForTimeout(3500);
s = await st();
check(s.teams.filter((t: any) => t.bot).length === 3, `Play La Lotería with nobody joined → added ${s.teams.length} bot families`);
check(s.phase.family === "loteria" && ["intro", "question"].includes(s.phase.kind), `→ La Lotería started (${s.phase.kind} ${s.phase.family})`);
check(/Starting La Lotería/.test((await msg()) ?? ""), `confirmation: "${await msg()}"`);

const seq: string[] = [];
for (let i = 0; i < 4; i++) {
  await bar.getByRole("button", { name: /Next step/ }).click(); await p.waitForTimeout(2500);
  s = await st(); seq.push(`${s.phase.kind}${s.phase.stage ? ":" + s.phase.stage : ""}${s.phase.qIndex != null ? " q" + (s.phase.qIndex + 1) : ""}`);
}
console.log("      Next step ×4 →", seq.join(" → "));
check(new Set(seq).size >= 3, "Next step moves through different screens");

await p.keyboard.press("ArrowRight"); await p.waitForTimeout(2500);
const before = seq[seq.length - 1]; s = await st();
check(`${s.phase.kind}${s.phase.stage ? ":" + s.phase.stage : ""}${s.phase.qIndex != null ? " q" + (s.phase.qIndex + 1) : ""}` !== before, "→ key also advances");

await bar.getByRole("button", { name: "Read the Room", exact: true }).click(); await p.waitForTimeout(3500);
s = await st();
check(s.phase.family === "room", `Play Read the Room → ${s.phase.kind} ${s.phase.family}`);
await bar.getByRole("button", { name: /Next step/ }).click(); await p.waitForTimeout(6000);
s = await st();
check(s.phase.family === "room" && s.phase.kind === "question" && s.answeredCount >= 3, `Read the Room runs, bots answered (${s.phase.kind}:${s.phase.stage} ${s.phase.family}, ${s.answeredCount} locked in)`);

await bar.getByRole("button", { name: /Pause/ }).click(); await p.waitForTimeout(2000);
check((await st()).status === "paused", "Pause → paused");
await bar.getByRole("button", { name: /Resume/ }).click(); await p.waitForTimeout(2000);
check((await st()).status === "running", "Resume → running");

const n0 = (await st()).teams.length;
await bar.getByRole("button", { name: /Add 3 bot families/ }).click(); await p.waitForTimeout(2500);
check((await st()).teams.length === n0 + 3, `Add 3 bot families → ${n0} → ${(await st()).teams.length} teams`);
check(/\(6\)/.test(await bar.getByRole("button", { name: /Add 3 bot families/ }).textContent() ?? ""), "bot count shows (6)");

await bar.getByRole("button", { name: /Add sample party photos/ }).click(); await p.waitForTimeout(6000);
check(/Added 6 sample party photos/.test((await msg()) ?? ""), `sample photos: "${await msg()}"`);
await bar.getByRole("button", { name: /Show party photos/ }).click(); await p.waitForTimeout(3500);
s = await st();
check(!!s.phase.slide && s.phase.kind === "interval", `Show party photos → TV slide (${s.phase.kind}, slide ${s.phase.slide ? "yes" : "no"})`);
check(await p.locator(".slide-photo img, .tv-slide img").count() > 0, "photo visible on the TV page");
await p.screenshot({ path: "docs/screenshots/runthrough/tv-party-photo-slide.png" });
// phone: photos card during the break opens the album sheet with the photos
const { devices } = await import("@playwright/test");
const ph = await (await b.newContext({ ...devices["iPhone 13"] })).newPage();
await ph.goto(`${B}/join?party=demo`); await ph.locator("input").first().fill("Ben");
await ph.getByRole("button", { name: /^Join/ }).first().click(); await ph.waitForURL(/\/play/); await ph.waitForTimeout(3500);
check(await ph.locator(".ph-acard.photos").count() === 1, "phone shows the Party photos card during the break");
await ph.screenshot({ path: "docs/screenshots/runthrough/phone-break-photos-card.png" });
await ph.locator(".ph-acard.photos").click(); await ph.waitForTimeout(3500);
const thumbs = await ph.getByRole("dialog", { name: "Party photos" }).locator("img").count();
check(thumbs >= 6, `album sheet shows ${thumbs} photos`);
await ph.screenshot({ path: "docs/screenshots/runthrough/phone-album-sheet.png" });

await bar.getByRole("button", { name: "Mix", exact: true }).click(); await p.waitForTimeout(3000);
check(/normal mix/.test((await msg()) ?? ""), `Mix → "${await msg()}"`);
check(errs.length === 0, `no page errors ${errs.join("; ")}`);
console.log(fails.length ? `\n${fails.length} FAILED` : "\nALL PASSED");
await b.close();
