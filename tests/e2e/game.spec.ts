import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { admin, adminAction, adminTeams, apiGuest, apiJoin, isAnswerStage, me, newPhone, resetDemo, snapshot, waitPhase } from "./helpers";

test.describe.configure({ mode: "serial" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("1. join: QR URL -> name -> controller in one submit; refresh restores; invite member is not captain; captain transfer", async ({ browser }) => {
  const a = await admin();
  await resetDemo(a);
  const snap = await snapshot(a);
  // QR target from snapshot
  const joinUrl: string = snap.joinUrl;
  expect(joinUrl).toContain("/join");
  test.info().annotations.push({ type: "joinUrl", description: joinUrl });

  const c1 = await newPhone(browser);
  const p1 = await c1.newPage();
  await p1.goto(joinUrl.startsWith("http") ? joinUrl : "/join?party=demo");
  await p1.getByPlaceholder("e.g. Lucía").fill("Ana");
  await p1.getByRole("button", { name: "Join", exact: true }).click(); // single primary submission
  await p1.waitForURL(/\/play/);
  await expect(p1.getByText(/Ana/).first()).toBeVisible();
  await p1.reload();
  await expect(p1.getByText("Ana's Family").first()).toBeVisible();
  const m1 = (await me(c1.request)).body;
  expect(m1.member.isCaptain).toBe(true);

  // second device joins via invite code
  const c2 = await newPhone(browser);
  const p2 = await c2.newPage();
  await p2.goto("/join?party=demo");
  await p2.getByRole("button", { name: "Join an existing team" }).click();
  await p2.getByPlaceholder("e.g. Lucía").fill("Beto");
  await p2.getByPlaceholder(/invite/i).fill(m1.team.inviteCode);
  await p2.getByRole("button", { name: "Join", exact: true }).click();
  await p2.waitForURL(/\/play/);
  const m2 = (await me(c2.request)).body;
  expect(m2.team.id).toBe(m1.team.id);
  expect(m2.member.isCaptain).toBe(false);

  await sleep(5500); // see defect: touch() throttle vs. intro start
  expect((await adminAction(a, "start")).status).toBe(200);
  const s = await waitPhase(a, isAnswerStage, 30_000);
  // UI disabled for non-captain
  await expect(p2.locator(".ph-opt").first()).toBeVisible();
  const opts = p2.locator(".ph-opt");
  for (let i = 0; i < (await opts.count()); i++) await expect(opts.nth(i)).toBeDisabled();
  // direct POST rejected
  const r = await c2.request.post("/api/answer", { data: { party: "demo", questionId: s.question.id, stage: "answer", choice: 0, requestId: randomUUID() } });
  expect(r.status()).toBeGreaterThanOrEqual(400);
  expect((await r.json()).code).toBe("not_captain");

  // captain transfer
  const t = await c2.request.post("/api/team", { data: { party: "demo", action: "claim_captain", confirm: true } });
  expect(t.status()).toBe(200);
  const old = await c1.request.post("/api/answer", { data: { party: "demo", questionId: s.question.id, stage: "answer", choice: 0, requestId: randomUUID() } });
  expect((await old.json()).code).toBe("not_captain");
  const nw = await c2.request.post("/api/answer", { data: { party: "demo", questionId: s.question.id, stage: "answer", choice: 1, requestId: randomUUID() } });
  expect(nw.status(), await nw.text()).toBe(200);
  await c1.close(); await c2.close();
});

test("2. TV + 3 teams: synced phases, one score change per correct team, no duplicates, concurrent tick", async ({ browser }) => {
  const a = await admin();
  await resetDemo(a, { introMs: 8000, questionMs: 20000, revealMs: 4000, resultsMs: 3000, intervalMs: 8000, minViewMs: 1500, memoryExposeMs: 3000, memoryAnswerMs: 20000 });
  const tv = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tvPage = await tv.newPage();
  await tvPage.goto("/tv?party=demo");
  const teams = [] as { ctx: any; page: any; me: any }[];
  for (const n of ["Uno", "Dos", "Tres"]) {
    const ctx = await newPhone(browser);
    const page = await ctx.newPage();
    await page.goto("/join?party=demo");
    await page.getByPlaceholder("e.g. Lucía").fill(n);
    await page.getByRole("button", { name: "Join", exact: true }).click();
    await page.waitForURL(/\/play/);
    teams.push({ ctx, page, me: (await me(ctx.request)).body });
  }
  await sleep(6500);
  await adminAction(a, "start");
  const s = await waitPhase(a, isAnswerStage, 30_000);
  expect.soft(s.eligibleCount, "all 3 polling teams should be eligible").toBe(3);
  // synchronized: TV and each phone show the question prompt
  await expect(tvPage.getByText(s.question.prompt).first()).toBeVisible();
  for (const t of teams) await expect(t.page.locator(".ph-opt").first()).toBeVisible();

  // correct answer must not be in the payload before reveal
  const raw = await (await a.get("/api/state?party=demo")).text();
  expect(raw).not.toMatch(/"answer"\s*:|"correct"\s*:|"explanation"\s*:|"private"\s*:/);

  const n = s.question.options.length;
  const choices = teams.map((_, i) => i % n);
  // Team 0 double-taps in the UI; others answer via UI too
  await teams[0].page.locator(".ph-opt").nth(choices[0]).dblclick();
  for (let i = 1; i < 3; i++) await teams[i].page.locator(".ph-opt").nth(choices[i]).click();
  await expect(teams[0].page.locator(".ph-opt[aria-pressed=true]")).toHaveCount(1);
  // replayed request with same requestId (via API) and a different choice
  const rid = randomUUID();
  const body = { party: "demo", questionId: s.question.id, stage: "answer", choice: choices[1], requestId: rid };
  const reps = await Promise.all([1, 2, 3].map(() => teams[1].ctx.request.post("/api/answer", { data: body })));
  for (const r of reps) expect(r.status()).toBe(200);
  const other = await teams[1].ctx.request.post("/api/answer", { data: { ...body, choice: (choices[1] + 1) % n, requestId: randomUUID() } });
  expect((await other.json()).code).toBe("already");

  // concurrent transition callers
  const before = await snapshot(a);
  await Promise.all([
    ...Array.from({ length: 10 }, () => a.get("/api/tick")),
    ...Array.from({ length: 10 }, () => a.get("/api/state?party=demo")),
  ]);
  const rv = await waitPhase(a, (x) => x.phase.kind === "reveal", 30_000);
  // stray concurrent hammering during the transition
  await Promise.all(Array.from({ length: 20 }, () => a.get("/api/state?party=demo")));
  const correct = rv.reveal.correct as number;
  // the pre-reveal payload must not hint at the correct option (e.g. via scene seed)
  const icon = s.question.options[correct].icon;
  expect(JSON.stringify(s.question.scene ?? {})).toMatch(/"seed":"[0-9a-f]{12}"/); // seeds are opaque hex hashes
  if (icon) expect(JSON.stringify(s.question.scene ?? {})).not.toContain(`"seed":"${icon}`);
  expect(rv.version).toBeGreaterThanOrEqual(before.version);
  // TV shows reveal
  await expect(tvPage.locator("body")).toContainText(s.question.options[correct].text);

  for (let i = 0; i < 3; i++) {
    const m = (await me(teams[i].ctx.request)).body;
    expect(m.current.result, `team ${i}`).toBeTruthy();
    expect(m.current.result.points).toBe(choices[i] === correct ? 100 : 0);
  }
  // after the set completes, standings/set scores: each team at most 100 for one correct answer
  await waitPhase(a, (x) => x.phase.kind === "results" || x.phase.kind === "interval", 90_000);
  const st = await snapshot(a);
  for (const r of st.lastSet?.scores ?? []) expect(r.score % 100).toBe(0);
  const audit = await (await a.get("/api/admin/diagnostics?party=demo")).json();
  test.info().annotations.push({ type: "version", description: String(st.version) });
  expect(audit.party).toBeTruthy();
  await tv.close();
  for (const t of teams) await t.ctx.close();
});

test("3a. late join mid-question cannot answer current, can answer next, practice label", async ({ browser }) => {
  const a = await admin();
  await resetDemo(a, { introMs: 8000, questionMs: 12000, revealMs: 2000, resultsMs: 2000, intervalMs: 6000, minViewMs: 1500, memoryExposeMs: 2000, memoryAnswerMs: 12000 });
  const g = await apiGuest();
  await apiJoin(g, "Early");
  await sleep(5500);
  await adminAction(a, "start");
  const s = await waitPhase(a, isAnswerStage, 30_000);
  const ctx = await newPhone(browser);
  const page = await ctx.newPage();
  await page.goto("/join?party=demo");
  await page.getByPlaceholder("e.g. Lucía").fill("Tarde");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await page.waitForURL(/\/play/);
  const r = await ctx.request.post("/api/answer", { data: { party: "demo", questionId: s.question.id, stage: "answer", choice: 0, requestId: randomUUID() } });
  expect((await r.json()).code).toBe("late_join");
  await expect(page.getByText(/Practice set/)).toBeVisible();
  const next = await waitPhase(a, (x) => isAnswerStage(x) && x.question.id !== s.question.id, 60_000);
  const r2 = await ctx.request.post("/api/answer", { data: { party: "demo", questionId: next.question.id, stage: "answer", choice: 0, requestId: randomUUID() } });
  expect(r2.status(), await r2.text()).toBe(200);
  const m = (await me(ctx.request)).body;
  expect(m.current.ranked).toBe(false);
  await ctx.close();
});

test("3b. away/resume; zero active teams -> ambient", async () => {
  const a = await admin();
  await resetDemo(a, { introMs: 2000, questionMs: 4000, revealMs: 1500, resultsMs: 1500, intervalMs: 2000, minViewMs: 1000, memoryExposeMs: 1500, memoryAnswerMs: 4000, familyPreferMs: 3000 });
  const g = await apiGuest();
  await apiJoin(g, "Solo");
  let r = await g.post("/api/team", { data: { party: "demo", action: "away" } });
  expect(r.status()).toBe(200);
  expect((await me(g)).body.team.status).toBe("away");
  await adminAction(a, "start");
  // no active teams -> stays ambient (no scored empty sets)
  await sleep(4000);
  let s = await snapshot(a);
  expect(s.phase.kind).toBe("ambient");
  r = await g.post("/api/team", { data: { party: "demo", action: "resume" } });
  expect((await me(g)).body.team.status).toBe("active");
  s = await waitPhase(a, (x) => x.phase.kind === "intro" || x.phase.kind === "question", 20_000);
  expect(s.phase.kind).not.toBe("ambient");
  // go away again; after the running set finishes, the party returns to ambient
  await g.post("/api/team", { data: { party: "demo", action: "away" } });
  s = await waitPhase(a, (x) => x.phase.kind === "ambient", 90_000);
  expect(s.phase.kind).toBe("ambient");
});

test("3c. KNOWN DEFECT (low): short intro (<~6.5s) makes actively-polling teams practice", async () => {
  const a = await admin();
  await resetDemo(a, { introMs: 3000, questionMs: 15000, minViewMs: 1500, revealMs: 2000 });
  const g = await apiGuest();
  await apiJoin(g, "Quick");
  await adminAction(a, "start");
  await waitPhase(a, (x) => x.phase.kind === "intro", 10_000);
  await me(g); // phone fetches /api/me on version change, as the client does
  await waitPhase(a, isAnswerStage, 20_000);
  expect((await me(g)).body.current.ranked).toBe(true);
});


test("0. KNOWN DEFECT (high): QR/join URL is absolute public URL when PUBLIC_BASE_URL is set", async ({ page }) => {
  const s = await (await page.request.get("/api/state?party=live")).json();
  await page.goto("/tv");
  const alt = await page.locator(".qr img").first().getAttribute("alt");
  test.info().annotations.push({ type: "joinUrl", description: `${s.joinUrl} | alt=${alt}` });
  expect(s.joinUrl).toMatch(/^https?:\/\//);
});
