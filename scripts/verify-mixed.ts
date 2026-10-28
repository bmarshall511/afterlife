/** Plays mixed rounds on the demo party (TV + phone + bots) and checks games vary per question, never repeat back to back, no Case. */
import { chromium, devices } from "@playwright/test";
import fs from "node:fs";
const B = process.argv[2] ?? "http://localhost:3000";
const OUT = "docs/screenshots/runthrough"; fs.mkdirSync(OUT, { recursive: true });
const PROBE = fs.readFileSync("scripts/ui-overflow-audit.ts", "utf8").match(/const PROBE = `([\s\S]*?)`;/)![1];
const b = await chromium.launch();
const tv = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: "reduce" })).newPage();
const ph = await (await b.newContext({ ...devices["iPhone 13"], reducedMotion: "reduce" })).newPage();
const problems: string[] = []; for (const pg of [tv, ph]) pg.on("pageerror", (e) => problems.push(e.message));
const adm = (body: object) => tv.request.post(`${B}/api/admin/party`, { data: { party: "demo", ...body } });
const st = async () => (await tv.request.get(`${B}/api/state?party=demo&audience=tv`)).json();
await tv.request.post(`${B}/api/admin/login`, { data: { password: "afterlife-dev" } });
await adm({ action: "reset", confirm: true });
await ph.goto(`${B}/join?party=demo`); await ph.locator("input").first().fill("Ben");
await ph.getByRole("button", { name: /^Join/ }).first().click(); await ph.waitForURL(/\/play/);
await tv.goto(`${B}/tv?party=demo`); await tv.waitForTimeout(2500);
await adm({ action: "demo_bots" });
await adm({ action: "demo_game", family: null }); // Mix
const seq: string[] = []; let prev = "";
for (let i = 0; i < 40 && seq.length < 9; i++) {
  await tv.waitForTimeout(2200);
  const s = await st();
  const k = s.phase.kind;
  if (k === "intro") {
    const fams = s.phase.setFamilies ?? [];
    console.log(`intro set ${s.phase.setSeq}: ${fams.join(" > ")}`);
    if (fams.includes("case")) problems.push("Case in a mixed set");
    for (let j = 1; j < fams.length; j++) if (fams[j] === fams[j - 1]) problems.push(`same game twice in a row: ${fams.join(">")}`);
    await tv.screenshot({ path: `${OUT}/mixed-intro-tv.png` }); await ph.waitForTimeout(1200); await ph.screenshot({ path: `${OUT}/mixed-intro-phone.png` });
    for (const [pg, l] of [[tv, "TV"], [ph, "phone"]] as const) for (const x of (await pg.evaluate(PROBE)) as any[]) problems.push(`intro ${l}: ${x.issue} ${x.sel} "${x.text ?? ""}"`);
  }
  if (k === "question" && s.question?.input && `${s.question.id}` !== prev) {
    prev = s.question.id; seq.push(s.phase.family);
    if (s.phase.stage === (s.question.family === "calavera" ? "write" : "answer")) {
      await tv.screenshot({ path: `${OUT}/mixed-q${seq.length}-${s.phase.family}-tv.png` }); await ph.waitForTimeout(1200); await ph.screenshot({ path: `${OUT}/mixed-q${seq.length}-${s.phase.family}-phone.png` });
      for (const [pg, l] of [[tv, "TV"], [ph, "phone"]] as const) for (const x of (await pg.evaluate(PROBE)) as any[]) problems.push(`q${seq.length} ${l}: ${x.issue} ${x.sel} "${x.text ?? ""}"`);
      const how = await ph.locator(".ph-qhow").textContent().catch(() => null);
      if (!how) problems.push(`phone missing how-to on ${s.phase.family}`);
    }
  }
  if (k === "results") { const r = s.lastSet; console.log(`results: mixed=${r?.mixed}`); await tv.screenshot({ path: `${OUT}/mixed-results-tv.png` }); }
  await adm({ action: "demo_next" });
}
console.log("question games in order:", seq.join(" > "));
for (let j = 1; j < seq.length; j++) if (seq[j] === seq[j - 1]) problems.push(`back-to-back ${seq[j]} across questions ${j}/${j + 1}`);
if (new Set(seq).size < 3) problems.push(`only ${new Set(seq).size} distinct games in ${seq.length} questions`);
console.log(`PROBLEMS (${problems.length})`); for (const p of problems) console.log(" - " + p);
await b.close();
