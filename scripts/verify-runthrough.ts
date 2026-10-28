/**
 * Full local run-through of every party game on the demo party, the way the host tests it:
 * TV (signed in to admin, demo bar) + one real phone + 3 bot families. For each game: checks stage timings
 * come from the casual defaults, that a step closes early once everyone has answered, that reveals render,
 * that The Ofrenda Case never appears, and runs the text-overflow probe on every real TV/phone screen.
 * Usage: npx tsx scripts/verify-runthrough.ts [baseUrl]   (resets the DEMO party only)
 */
import { readFileSync as __r } from "node:fs";
const LOCAL_PW = process.env.ADMIN_PASSWORD ?? (() => { try { return __r(".env.local", "utf8").match(/^ADMIN_PASSWORD=(.*)$/m)?.[1]?.trim(); } catch { return undefined; } })() ?? "afterlife-dev";
import { chromium, devices, type Page } from "@playwright/test";
import fs from "node:fs";

const B = process.argv[2] ?? "http://localhost:3000";
const OUT = "docs/screenshots/runthrough";
fs.mkdirSync(OUT, { recursive: true });
const EXPECT: Record<string, number> = { "line:answer": 300000, "loteria:answer": 240000, "closest:answer": 240000, "room:answer": 180000, "calavera:write": 360000 };
const problems: string[] = [];
const log = (...a: unknown[]) => console.log(...a);

const PROBE = fs.readFileSync("scripts/ui-overflow-audit.ts", "utf8").match(/const PROBE = `([\s\S]*?)`;/)![1];
async function audit(page: Page, label: string) {
  const issues = (await page.evaluate(PROBE)) as { sel: string; issue: string; text?: string }[];
  for (const i of issues) problems.push(`${label}: ${i.issue} ${i.sel} "${i.text ?? ""}"`);
}
const state = async (page: Page) => (await page.request.get(`${B}/api/state?party=demo&audience=tv`)).json();

const b = await chromium.launch();
const tvCtx = await b.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" });
const tv = await tvCtx.newPage();
tv.on("pageerror", (e) => problems.push("TV page error: " + e.message));
await tv.request.post(`${B}/api/admin/login`, { data: { password: LOCAL_PW } });
const adm = (body: object) => tv.request.post(`${B}/api/admin/party`, { data: { party: "demo", ...body } });
await adm({ action: "reset", confirm: true });

const phCtx = await b.newContext({ ...devices["iPhone 13"], reducedMotion: "reduce" });
const ph = await phCtx.newPage();
ph.on("pageerror", (e) => problems.push("phone page error: " + e.message));
await ph.goto(`${B}/join?party=demo`);
await ph.locator("input").first().fill("Ben");
await ph.getByRole("button", { name: /^Join/ }).first().click();
await ph.waitForURL(/\/play/);
await tv.goto(`${B}/tv?party=demo`);
await tv.waitForTimeout(2500);
const bar = tv.getByRole("region", { name: "Demo controls" });
await bar.getByRole("button", { name: /Add 3 bot families/ }).click();
await tv.waitForTimeout(1500);
await bar.getByRole("button", { name: /Start/ }).click();
await tv.waitForTimeout(2000);

const meSubmit = async (value: unknown) => ph.evaluate(async (v) => {
  const s = await (await fetch("/api/state?party=demo")).json();
  const r = await fetch("/api/answer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ party: "demo", questionId: s.question.id, stage: s.phase.stage, value: v, requestId: crypto.randomUUID() }) });
  return { status: r.status, body: await r.text() };
}, value);

function valueFor(input: any): unknown {
  switch (input.kind) {
    case "choice": return 0;
    case "order": return input.items.map((x: any) => x.id).reverse();
    case "number": return input.min + Math.round(((input.max - input.min) * 0.3) / input.step) * input.step;
    case "text": return "and asked where the good tamales were hidden.";
    case "percent": return 40;
  }
  return null;
}

const GAMES = [["line", "The Line"], ["loteria", "La Lotería"], ["closest", "Closest Without Going Over"], ["room", "Read the Room"], ["calavera", "La Calavera"]] as const;
for (const [fam, chip] of GAMES) {
  log(`\n=== ${chip}`);
  await bar.getByRole("button", { name: chip, exact: true }).click();
  await tv.waitForTimeout(2500);
  let shot = 0, guard = 0, reveals = 0;
  while (guard++ < 40) {
    const s = await state(tv);
    const k = s.phase.kind;
    if (s.phase.family === "case") problems.push(`Ofrenda Case appeared while testing ${chip}`);
    const label = `${fam}-${String(shot).padStart(2, "0")}-${k}${s.phase.stage ? "-" + s.phase.stage : ""}${s.phase.qIndex != null ? "-q" + (s.phase.qIndex + 1) : ""}`;
    await tv.waitForTimeout(600);
    await tv.screenshot({ path: `${OUT}/${label}-tv.png` });
    await audit(tv, label + " TV");
    await ph.waitForTimeout(1500);
    await ph.screenshot({ path: `${OUT}/${label}-phone.png` });
    await audit(ph, label + " phone");
    shot++;
    if (k === "question" && s.question?.input) {
      const key = `${fam}:${s.phase.stage}`;
      const dur = s.phase.endsAt - s.phase.startsAt;
      if (EXPECT[key] && Math.abs(dur - EXPECT[key]) > 2000) problems.push(`${key} lasts ${dur} ms, expected ${EXPECT[key]}`);
      for (let i = 0; i < 20; i++) { const x = await state(tv); if (x.answeredCount >= 3 || x.phase.kind !== "question") break; await tv.waitForTimeout(1000); }
      let v = valueFor(s.question.input);
      if (s.question.input.kind === "vote") {
        const me = await ph.evaluate(async () => (await fetch("/api/me?party=demo")).json());
        v = s.question.input.entries.find((e: any) => e.id !== me.current.ownEntryId)?.id;
      }
      const r = await meSubmit(v);
      if (r.status !== 200) problems.push(`${key} phone submit failed ${r.status} ${r.body.slice(0, 160)}`);
      const t0 = Date.now();
      let closed = false;
      for (let i = 0; i < 25; i++) {
        await tv.waitForTimeout(1000);
        const x = await state(tv);
        if (x.phase.stage !== s.phase.stage || x.phase.kind !== "question" || x.question?.id !== s.question.id) { closed = true; break; }
      }
      log(`  ${key} window ${Math.round(dur / 1000)}s; early close after everyone answered: ${closed ? Math.round((Date.now() - t0) / 1000) + "s" : "NO"}`);
      if (!closed) problems.push(`${key} did not close early after everyone answered`);
      continue;
    }
    if (k === "reveal") {
      reveals++;
      if (!s.reveal) problems.push(`${label}: reveal has no data`);
      log(`  reveal q${s.phase.qIndex + 1}: ${s.reveal?.void ? "VOID " + s.reveal.voidReason : (s.reveal?.outcomes?.length ?? 0) + " team outcomes"}`);
    }
    if (k === "results") { log(`  results: ${s.lastSet?.scores?.length} teams scored`); await adm({ action: "demo_next" }); await tv.waitForTimeout(1500); break; }
    await adm({ action: "demo_next" });
    await tv.waitForTimeout(2000);
  }
  if (reveals < 3) problems.push(`${chip}: only ${reveals} reveals seen`);
}

await bar.getByRole("button", { name: "Mix", exact: true }).click();
for (let i = 0; i < 6; i++) { const s = await state(tv); if (s.phase.family === "case") problems.push("Mix scheduled the Ofrenda Case"); await adm({ action: "demo_next" }); await tv.waitForTimeout(1500); }

log(`\nPROBLEMS (${problems.length}):`);
for (const p of problems) log(" - " + p);
await b.close();
