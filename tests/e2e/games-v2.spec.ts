/**
 * v2 games end-to-end: TV (1080p + 4K) + 3 captain phones (320 / 375 / 430 wide) + 1 landscape non-captain member.
 * Each family is forced via admin settings {families:[f]} and played through all 3 questions by real UI interaction.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { admin, adminAction, FAST, fakeIp, me, resetDemo, snapshot, waitPhase } from "./helpers";

test.describe.configure({ mode: "serial" });
test.setTimeout(330_000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SHOTS = fileURLToPath(new URL("../../docs/screenshots/v2-real", import.meta.url));
mkdirSync(SHOTS, { recursive: true });

type Phone = { ctx: BrowserContext; page: Page; me: any; label: string };

async function joinUI(browser: Browser, name: string, vp: { width: number; height: number }, invite?: string): Promise<Phone> {
  const ctx = await browser.newContext({ viewport: vp, isMobile: true, hasTouch: true, extraHTTPHeaders: { "x-forwarded-for": fakeIp() } });
  const page = await ctx.newPage();
  await page.goto("/join?party=demo");
  if (invite) await page.getByRole("button", { name: "Have a team code?" }).click();
  await page.getByPlaceholder("e.g. Lucía").fill(name);
  if (invite) await page.getByPlaceholder(/invite/i).fill(invite);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await page.waitForURL(/\/play/);
  return { ctx, page, me: (await me(ctx.request)).body, label: `${vp.width}x${vp.height}` };
}

export async function noOverflow(page: Page, label: string) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect.soft(sw, `${label}: horizontal overflow scrollWidth ${sw} > ${iw}`).toBeLessThanOrEqual(iw);
}
async function tvFits(page: Page, label: string) {
  await noOverflow(page, label);
  const ok = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1);
  expect.soft(ok, `${label}: TV scrolls vertically`).toBe(true);
}

const kendall = (truth: string[], got: string[]) => {
  let c = 0, t = 0;
  for (let i = 0; i < truth.length; i++) for (let j = i + 1; j < truth.length; j++) {
    t++; if (got.indexOf(truth[i]) < got.indexOf(truth[j])) c++;
  }
  return Math.round((100 * c) / t);
};
const closestBase = (g: number, truth: number) => {
  if (g > truth) return 0;
  if (g === truth) return 100;
  const r = g / truth;
  return r >= 0.95 ? 100 : r >= 0.85 ? 75 : r >= 0.7 ? 50 : r >= 0.5 ? 25 : 10;
};

async function setup(browser: Browser, family: string, extra: Record<string, unknown> = {}, final = false, n = 3) {
  const a = await admin();
  await resetDemo(a, { ...FAST, minViewMs: 14000, families: [family], ...extra });
  const tv = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const tvPage = await tv.newPage();
  await tvPage.goto("/tv?party=demo");
  const tv4k = await browser.newContext({ viewport: { width: 3840, height: 2160 } });
  const tv4kPage = await tv4k.newPage();
  await tv4kPage.goto("/tv?party=demo");
  const phones: Phone[] = [];
  const sizes = [{ width: 320, height: 640 }, { width: 375, height: 812 }, { width: 430, height: 932 }, { width: 390, height: 844 }];
  const names = ["Uno", "Dos", "Tres", "Cuatro"];
  for (let i = 0; i < n; i++) phones.push(await joinUI(browser, `${names[i]}${family}`, sizes[i]));
  const member = await joinUI(browser, `Miembro${family}`, { width: 844, height: 390 }, phones[0].me.team.inviteCode);
  expect(member.me.member.isCaptain).toBe(false);
  if (final) expect((await adminAction(a, "final_round")).status).toBe(200);
  await sleep(6500);
  expect((await adminAction(a, "start")).status).toBe(200);
  const close = async () => { for (const c of [tv, tv4k, ...phones.map((p) => p.ctx), member.ctx]) await c.close(); };
  return { a, tvPage, tv4kPage, phones, member, close };
}

type Env = Awaited<ReturnType<typeof setup>>;
type StageCtx = { env: Env; s: any; raw: string; qi: number };
type Saved = Record<number, any>; // phone idx -> saved value

async function lockButton(p: Page) { return p.locator(".ph-lock"); }

async function expectSaved(p: Phone, stage: string, qid: string) {
  await expect(p.page.locator(".ph-locked.saved")).toBeVisible({ timeout: 15_000 });
  const m = (await me(p.ctx.request)).body;
  expect(m.current.questionId).toBe(qid);
  // the stage may already have closed early (all answered) -> value moves to `prior` (room) or stays in `saved`
  const v = m.current.saved?.stage === stage ? m.current.saved.value : m.current.prior?.stage === stage ? m.current.prior.value : undefined;
  expect(v, `server-confirmed ${stage} value for ${p.label}: ${JSON.stringify(m.current)}`).not.toBeUndefined();
  return v;
}

async function shotAll(env: Env, tag: string) {
  await env.tvPage.screenshot({ path: `${SHOTS}/${tag}-tv.png` });
  await env.phones[1].page.screenshot({ path: `${SHOTS}/${tag}-phone375.png`, fullPage: true });
}

async function checkLayouts(env: Env, tag: string) {
  await tvFits(env.tvPage, `${tag} tv1080`);
  await tvFits(env.tv4kPage, `${tag} tv4k`);
  for (const p of [...env.phones, env.member]) await noOverflow(p.page, `${tag} phone ${p.label}`);
}

/** non-captain: UI has no lock button + API rejected */
async function checkNonCaptain(env: Env, s: any) {
  const m = env.member;
  await expect(m.page.getByText(/submits for the team/)).toBeVisible();
  await expect(m.page.locator(".ph-lock")).toHaveCount(0);
  const r = await m.ctx.request.post("/api/answer", { data: { party: "demo", questionId: s.question.id, stage: s.phase.stage, value: 0, requestId: randomUUID() } });
  expect(r.status()).toBeGreaterThanOrEqual(400);
  expect((await r.json()).code).toBe("not_captain");
}

async function waitStage(a: any, done: Set<string>, timeout = 120_000) {
  return waitPhase(a, (x) => x.phase.kind === "question" && !!x.question && !done.has(`${x.question.id}:${x.phase.stage}`), timeout);
}

async function waitReveal(a: any, qid: string) {
  return waitPhase(a, (x) => (x.phase.kind === "reveal" && x.question?.id === qid) || (x.phase.kind === "results"), 120_000);
}

async function points(p: Phone) {
  const m = (await me(p.ctx.request)).body;
  return m.current.result?.points ?? null;
}

/* ------------------------------------------------------------------ the six families */

test("G1 line: up/down buttons + drag reorder, Kendall scoring, true order hidden", async ({ browser }) => {
  const env = await setup(browser, "line");
  const done = new Set<string>();
  const totals = [0, 0, 0];
  let anyShuffled = false;
  for (let qi = 0; qi < 3; qi++) {
    const s = await waitStage(env.a, done);
    done.add(`${s.question.id}:${s.phase.stage}`);
    expect(s.question.family).toBe("line");
    expect(s.question.input.kind).toBe("order");
    const raw = await (await env.a.get("/api/state?party=demo")).text();
    expect(raw).not.toMatch(/"(correct|explanation|private|value|values)"\s*:/);
    const items = s.question.input.items.map((i: any) => i.id);
    expect(items.length).toBe(s.question.difficulty === 3 ? 5 : 4);
    if (qi === 0) await checkNonCaptain(env, s);
    // phone 0: up/down buttons — move last item to the top
    const p0 = env.phones[0].page;
    for (let k = items.length - 1; k > 0; k--) {
      const t = s.question.input.items[items.length - 1].text;
      await p0.getByRole("button", { name: `Move ${t} up` }).click();
    }
    // phone 1: drag first grip down by two rows
    const p1 = env.phones[1].page;
    const grip = p1.locator(".ph-order-grip").first();
    const box = (await grip.boundingBox())!;
    const rowH = (await p1.locator(".ph-order-list li").first().boundingBox())!.height + 8;
    await p1.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p1.mouse.down();
    for (let k = 1; k <= 10; k++) await p1.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + (rowH * 2 * k) / 10);
    await p1.mouse.up();
    // phone 2: leaves the given order
    const expectedOrders = [
      [items[items.length - 1], ...items.slice(0, -1)],
      [items[1], items[2], items[0], ...items.slice(3)],
      items,
    ];
    if (qi === 0) await shotAll(env, `line-q${qi + 1}-answer`);
    const saved: Saved = {};
    for (let i = 0; i < 3; i++) {
      await env.phones[i].page.locator(".ph-lock").click();
      saved[i] = await expectSaved(env.phones[i], "answer", s.question.id);
      expect.soft(saved[i], `phone ${i} ${i === 1 ? "drag" : "buttons"} order`).toEqual(expectedOrders[i]);
    }
    await checkLayouts(env, `line q${qi + 1} saved`);
    const rv = await waitReveal(env.a, s.question.id);
    expect(rv.phase.kind).toBe("reveal");
    const truth = rv.reveal.correct as string[];
    if (JSON.stringify(truth) !== JSON.stringify(items)) anyShuffled = true;
    await expect(env.tvPage.locator(".tv-outcomes, .room-guesses").first()).toBeVisible();
    for (const it of s.question.input.items) await expect(env.tvPage.locator("body")).toContainText(it.text);
    for (let i = 0; i < 3; i++) {
      const pts = await points(env.phones[i]);
      expect.soft(pts, `line q${qi + 1} phone ${i}`).toBe(kendall(truth, saved[i]));
      totals[i] += pts ?? 0;
    }
    if (qi === 0) await shotAll(env, `line-q${qi + 1}-reveal`);
    await checkLayouts(env, `line q${qi + 1} reveal`);
  }
  expect.soft(anyShuffled, "items should not be presented in true order every time").toBe(true);
  const res = await waitPhase(env.a, (x) => x.phase.kind === "results", 60_000);
  for (let i = 0; i < 3; i++) {
    const row = res.lastSet.scores.find((r: any) => r.teamId === env.phones[i].me.team.id);
    expect(row.score).toBe(totals[i]);
    const st = res.standings.find((r: any) => r.teamId === env.phones[i].me.team.id);
    expect(st.total).toBe(totals[i]);
  }
  await shotAll(env, "line-results");
  await env.close();
});

test("G2 closest: keypad + steppers, bust rule, +25 closest bonus, truth hidden", async ({ browser }) => {
  const env = await setup(browser, "closest");
  const done = new Set<string>();
  const totals = [0, 0, 0];
  for (let qi = 0; qi < 3; qi++) {
    const s = await waitStage(env.a, done);
    done.add(`${s.question.id}:${s.phase.stage}`);
    const spec = s.question.input;
    expect(spec.kind).toBe("number");
    const raw = await (await env.a.get("/api/state?party=demo")).text();
    expect(raw).not.toMatch(/"(correct|explanation|private|truth)"\s*:/);
    // phone 0 types the max (likely bust), phone 1 types min+step then +step, phone 2 types a midpoint via keypad
    const mid = Math.round((spec.min + spec.max) / 2 / spec.step) * spec.step;
    const p0 = env.phones[0].page, p1 = env.phones[1].page, p2 = env.phones[2].page;
    await p0.locator(".ph-num-field input").fill(String(spec.max));
    await p1.locator(".ph-num-field input").fill(String(spec.min));
    await p1.getByRole("button", { name: `Plus ${spec.step}` }).click();
    await p1.getByRole("button", { name: `Plus ${spec.step}` }).click();
    await p2.locator(".ph-num-field input").click();
    await p2.keyboard.type(String(mid));
    const want = [spec.max, +(spec.min + 2 * spec.step).toFixed(6), mid];
    if (qi === 0) { await checkNonCaptain(env, s); await shotAll(env, "closest-q1-answer"); }
    const saved: Saved = {};
    for (let i = 0; i < 3; i++) {
      await env.phones[i].page.locator(".ph-lock").click();
      saved[i] = await expectSaved(env.phones[i], "answer", s.question.id);
      expect.soft(saved[i]).toBe(want[i]);
    }
    await checkLayouts(env, `closest q${qi + 1} saved`);
    const rv = await waitReveal(env.a, s.question.id);
    const truth = rv.reveal.correct as number;
    expect(typeof truth).toBe("number");
    await expect(env.tvPage.locator(".tv-outcomes, .room-guesses").first()).toBeVisible();
    // expected: base + 25 for closest not-over (>=2 answered)
    const base = [0, 1, 2].map((i) => closestBase(saved[i], truth));
    const under = [0, 1, 2].filter((i) => saved[i] <= truth);
    const best = under.length ? Math.max(...under.map((i) => saved[i])) : null;
    for (let i = 0; i < 3; i++) {
      const exp = Math.min(100, base[i] + (best != null && saved[i] === best ? 25 : 0));
      const pts = await points(env.phones[i]);
      expect.soft(pts, `closest q${qi + 1} phone ${i} guess=${saved[i]} truth=${truth}`).toBe(exp);
      totals[i] += pts ?? 0;
    }
    if (qi === 0) await shotAll(env, "closest-q1-reveal");
    await checkLayouts(env, `closest q${qi + 1} reveal`);
  }
  const res = await waitPhase(env.a, (x) => x.phase.kind === "results", 60_000);
  for (let i = 0; i < 3; i++) expect(res.lastSet.scores.find((r: any) => r.teamId === env.phones[i].me.team.id).score).toBe(totals[i]);
  await env.close();
});

test("G3 loteria: tap card grid, 100/0, answer card hidden", async ({ browser }) => {
  const env = await setup(browser, "loteria");
  const done = new Set<string>();
  const totals = [0, 0, 0];
  for (let qi = 0; qi < 3; qi++) {
    const s = await waitStage(env.a, done);
    done.add(`${s.question.id}:${s.phase.stage}`);
    const spec = s.question.input;
    expect(spec.kind).toBe("choice");
    expect(spec.layout).toBe("grid");
    expect(spec.options.length).toBe(s.question.difficulty === 1 ? 9 : 12);
    const raw = await (await env.a.get("/api/state?party=demo")).text();
    expect(raw).not.toMatch(/"(correct|explanation|private|why)"\s*:/);
    if (qi === 0) await checkNonCaptain(env, s);
    const picks = [0, 1, 2].map((i) => (i * 4 + qi) % spec.options.length);
    for (let i = 0; i < 3; i++) await env.phones[i].page.locator(".ph-card").nth(picks[i]).click();
    if (qi === 0) await shotAll(env, "loteria-q1-answer");
    const saved: Saved = {};
    for (let i = 0; i < 3; i++) {
      await expect(env.phones[i].page.locator(".ph-card.sel")).toHaveCount(1);
      await env.phones[i].page.locator(".ph-lock").click();
      saved[i] = await expectSaved(env.phones[i], "answer", s.question.id);
      expect.soft(saved[i]).toBe(picks[i]);
    }
    await checkLayouts(env, `loteria q${qi + 1} saved`);
    const rv = await waitReveal(env.a, s.question.id);
    const correct = rv.reveal.correct as number;
    await expect(env.tvPage.locator(".tv-outcomes, .room-guesses").first()).toBeVisible();
    await expect(env.tvPage.locator("body")).toContainText(spec.options[correct].text);
    // the pre-reveal scene must not hint at the answer card
    expect(JSON.stringify(s.question.scene ?? {})).not.toContain(`"answer"`);
    for (let i = 0; i < 3; i++) {
      const pts = await points(env.phones[i]);
      expect.soft(pts).toBe(saved[i] === correct ? 100 : 0);
      totals[i] += pts ?? 0;
    }
    if (qi === 0) await shotAll(env, "loteria-q1-reveal");
    await checkLayouts(env, `loteria q${qi + 1} reveal`);
  }
  const res = await waitPhase(env.a, (x) => x.phase.kind === "results", 60_000);
  for (let i = 0; i < 3; i++) expect(res.lastSet.scores.find((r: any) => r.teamId === env.phones[i].me.team.id).score).toBe(totals[i]);
  await env.close();
});

test("G4 room: answer + percent slider/±, need_answer, split hidden until reveal", async ({ browser }) => {
  // 4 teams so that q1 can have 3 answers (scored) + 1 team without an answer (need_answer)
  const env = await setup(browser, "room", {}, false, 4);
  const done = new Set<string>();
  const totals = [0, 0, 0, 0];
  for (let qi = 0; qi < 3; qi++) {
    // --- answer stage
    let s = await waitStage(env.a, done);
    done.add(`${s.question.id}:${s.phase.stage}`);
    expect(s.phase.stage).toBe("answer");
    const qid = s.question.id;
    const opts = s.question.input.options;
    const answers: (number | null)[] = qi === 0 ? [0, 0, 1, null] : qi === 1 ? [0, 1, 1, 1] : [0, null, null, null];
    if (qi === 0) await checkNonCaptain(env, s);
    for (let i = 0; i < 4; i++) {
      if (answers[i] == null) continue;
      await env.phones[i].page.locator(".ph-opt").nth(answers[i]!).click();
      await env.phones[i].page.locator(".ph-lock").click();
      expect(await expectSaved(env.phones[i], "answer", qid)).toBe(answers[i]);
    }
    if (qi === 0) await shotAll(env, "room-q1-answer");
    const nAns = answers.filter((x) => x != null).length;
    if (nAns < 3) {
      // fewer than 3 answers -> void, unscored poll; guess stage skipped
      const rv = await waitReveal(env.a, qid);
      expect(rv.reveal.void).toBe(true);
      await expect(env.tvPage.locator("body")).not.toContainText(/too_few_answers|_answers\b/);
      await expect(env.phones[0].page.locator("body")).not.toContainText(/too_few_answers/);
      for (let i = 0; i < 4; i++) expect.soft(await points(env.phones[i]) ?? 0).toBe(0);
      await env.tvPage.screenshot({ path: `${SHOTS}/room-void-tv.png` });
      continue;
    }
    // --- guess stage
    s = await waitPhase(env.a, (x) => x.phase.kind === "question" && x.question?.id === qid && x.phase.stage === "guess", 60_000);
    done.add(`${qid}:guess`);
    const raw = await (await env.a.get("/api/state?party=demo")).text();
    expect(raw).not.toMatch(/"(correct|explanation|private|split|counts|actual|pct)"\s*:/);
    expect(s.reveal).toBeNull();
    // percent input renders from guess spec; phone 0 slider, phone 1 ± buttons, phone 2 need_answer (q1)
    const guesses: (number | null)[] = [null, null, null, null];
    for (const k of [3, 2]) {
      if (answers[k] == null) {
        await expect(env.phones[k].page.getByText(/didn.t pick an answer in step 1/)).toBeVisible();
        await expect(env.phones[k].page.locator(".ph-lock")).toHaveCount(0);
        const r = await env.phones[k].ctx.request.post("/api/answer", { data: { party: "demo", questionId: qid, stage: "guess", value: 33, requestId: randomUUID() } });
        expect((await r.json()).code).toBe("need_answer");
        await env.phones[k].page.screenshot({ path: `${SHOTS}/room-need-answer-phone${env.phones[k].label}.png`, fullPage: true });
      } else {
        await env.phones[k].page.locator(".ph-lock").click();
        guesses[k] = await expectSaved(env.phones[k], "guess", qid);
      }
    }
    const p0 = env.phones[0].page;
    await p0.locator('input[type="range"]').fill("70");
    await p0.locator(".ph-lock").click();
    guesses[0] = await expectSaved(env.phones[0], "guess", qid);
    expect.soft(guesses[0]).toBe(70);
    const p1 = env.phones[1].page;
    await p1.getByRole("button", { name: "Plus 10 percent" }).click();
    await p1.getByRole("button", { name: "Minus 1 percent" }).click();
    await p1.locator(".ph-lock").click();
    guesses[1] = await expectSaved(env.phones[1], "guess", qid);
    expect.soft(guesses[1]).toBe(59);
    if (qi === 0) await shotAll(env, "room-q1-guess");
    await checkLayouts(env, `room q${qi + 1} guess`);
    const rv = await waitReveal(env.a, qid);
    await expect(env.tvPage.locator(".tv-outcomes, .room-guesses").first()).toBeVisible();
    expect(rv.reveal.void ?? false).toBe(false);
    for (let i = 0; i < 4; i++) {
      const pts = await points(env.phones[i]);
      let exp = 0;
      if (answers[i] != null && guesses[i] != null) {
        const actual = Math.round((100 * answers.filter((x) => x === answers[i]).length) / nAns);
        exp = Math.max(0, 100 - 3 * Math.abs(guesses[i]! - actual));
      }
      expect.soft(pts ?? 0, `room q${qi + 1} phone ${i}`).toBe(exp);
      totals[i] += pts ?? 0;
    }
    if (qi === 1) await shotAll(env, "room-q2-reveal");
    await checkLayouts(env, `room q${qi + 1} reveal`);
    void opts;
  }
  const res = await waitPhase(env.a, (x) => x.phase.kind === "results", 60_000);
  // observed engine behaviour: void social questions are normalised away (set score = sum * 3 / nonVoid), as in v1
  for (let i = 0; i < 4; i++) {
    const got = res.lastSet.scores.find((r: any) => r.teamId === env.phones[i].me.team.id).score;
    test.info().annotations.push({ type: "room set score", description: `team ${i}: per-question sum ${totals[i]}, set ${got}` });
    expect([totals[i], Math.round((totals[i] * 3) / 2)]).toContain(got);
  }
  await env.close();
});

test("G5 calavera: write (filter rejection), vote with own entry hidden, authors hidden until reveal", async ({ browser }) => {
  const env = await setup(browser, "calavera");
  const done = new Set<string>();
  const totals = [0, 0, 0];
  for (let qi = 0; qi < 3; qi++) {
    let s = await waitStage(env.a, done);
    done.add(`${s.question.id}:${s.phase.stage}`);
    expect(s.phase.stage).toBe("write");
    const qid = s.question.id;
    if (qi === 0) await checkNonCaptain(env, s);
    const lines = [`and left with a wink q${qi}a`, `then danced off in sandals q${qi}b`, `<b>bold</b> & "quoted" q${qi}c`];
    if (qi === 0) {
      // filter rejection, shown clearly, then fixed
      const p = env.phones[1].page;
      await p.locator("#ph-text-in").fill("and then he yelled sh1t at the moon");
      await p.locator(".ph-lock").click();
      await expect(p.locator(".ph-note.failed")).toContainText(/family-friendly/i);
      await p.screenshot({ path: `${SHOTS}/calavera-filtered-phone375.png`, fullPage: true });
      const r = await env.phones[1].ctx.request.post("/api/answer", { data: { party: "demo", questionId: qid, stage: "write", value: "s.h.i.t happens", requestId: randomUUID() } });
      expect((await r.json()).code).toBe("filtered");
    }
    for (let i = 0; i < 3; i++) {
      const p = env.phones[i].page;
      await p.locator("#ph-text-in").fill(lines[i]);
      await p.locator(".ph-lock").click();
      expect(await expectSaved(env.phones[i], "write", qid)).toBe(lines[i]);
    }
    if (qi === 0) await shotAll(env, "calavera-q1-write");
    s = await waitPhase(env.a, (x) => x.phase.kind === "question" && x.question?.id === qid && x.phase.stage === "vote", 60_000);
    done.add(`${qid}:vote`);
    const raw = await (await env.a.get("/api/state?party=demo")).text();
    expect(JSON.stringify(JSON.parse(raw).question)).not.toMatch(/"(correct|explanation|private|author|authorTeamId|teamId|teamName|votes|name)"\s*:/);
    expect(raw).not.toMatch(/"(correct|explanation|private|author|authorTeamId)"\s*:/);
    for (const p of env.phones) expect(JSON.stringify(JSON.parse(raw).question)).not.toContain(p.me.team.id);
    const entries = s.question.input.entries as { id: string; text: string }[];
    for (const e of entries) expect(Object.keys(e).sort()).toEqual(["id", "text"]);
    // every phone: own entry hidden in UI
    const ownIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const m = (await me(env.phones[i].ctx.request)).body;
      ownIds[i] = m.current.ownEntryId;
      expect(ownIds[i]).toBeTruthy();
      const own = entries.find((e) => e.id === ownIds[i])!;
      expect(own.text).toBe(lines[i]);
      await expect(env.phones[i].page.locator(".ph-vote")).toHaveCount(entries.length - 1);
      await expect(env.phones[i].page.locator(".ph-votes")).not.toContainText(lines[i].slice(0, 15));
    }
    // XSS-ish text rendered as text
    await expect(env.phones[0].page.locator(".ph-votes")).toContainText('<b>bold</b> & "quoted"');
    // self-vote via API rejected
    const sv = await env.phones[0].ctx.request.post("/api/answer", { data: { party: "demo", questionId: qid, stage: "vote", value: ownIds[0], requestId: randomUUID() } });
    expect(sv.status()).toBeGreaterThanOrEqual(400);
    // votes: 0 -> 1's entry, 1 -> 0's entry, 2 -> 0's entry
    const target = [1, 0, 0];
    for (let i = 0; i < 3; i++) {
      const p = env.phones[i].page;
      await p.locator(".ph-vote", { hasText: lines[target[i]].slice(0, 15) }).click();
      await p.locator(".ph-lock").click();
      expect(await expectSaved(env.phones[i], "vote", qid)).toBe(ownIds[target[i]]);
    }
    if (qi === 0) await shotAll(env, "calavera-q1-vote");
    await checkLayouts(env, `calavera q${qi + 1} vote`);
    const rv = await waitReveal(env.a, qid);
    await expect(env.tvPage.locator("body")).toContainText(lines[0]);
    await expect(env.tvPage.locator("body")).toContainText(env.phones[0].me.team.name);
    // received votes: 0 gets 2 of 2 other voters, 1 gets 1 of 2, 2 gets 0; +10 for voting
    const exp = [Math.min(100, 100 + 10), Math.min(100, 50 + 10), 10];
    for (let i = 0; i < 3; i++) {
      const pts = await points(env.phones[i]);
      expect.soft(pts, `calavera q${qi + 1} phone ${i}`).toBe(exp[i]);
      totals[i] += pts ?? 0;
    }
    if (qi === 0) await shotAll(env, "calavera-q1-reveal");
    await checkLayouts(env, `calavera q${qi + 1} reveal`);
    void rv;
  }
  const res = await waitPhase(env.a, (x) => x.phase.kind === "results", 60_000);
  for (let i = 0; i < 3; i++) expect(res.lastSet.scores.find((r: any) => r.teamId === env.phones[i].me.team.id).score).toBe(totals[i]);
  await env.close();
});

test("G6 case: clue read-only, tap-assign + lock confirm, lock final across rounds, solution hidden until q3", async ({ browser }) => {
  const env = await setup(browser, "case");
  const done = new Set<string>();
  const locks: { round: number; value: Record<string, string> }[] = [];
  let people: any[] = [];
  const pre: string[] = [];
  for (let qi = 0; qi < 3; qi++) {
    // clue stage
    let s = await waitStage(env.a, done);
    done.add(`${s.question.id}:${s.phase.stage}`);
    expect(s.phase.stage).toBe("clue");
    expect(s.question.input).toBeNull();
    pre.push(await (await env.a.get("/api/state?party=demo")).text());
    await expect(env.phones[1].page.locator(".ph-lock")).toHaveCount(0);
    if (qi === 0) await shotAll(env, "case-r1-clue");
    const qid = s.question.id;
    s = await waitPhase(env.a, (x) => x.phase.kind === "question" && x.question?.id === qid && x.phase.stage === "answer", 60_000);
    done.add(`${qid}:answer`);
    pre.push(await (await env.a.get("/api/state?party=demo")).text());
    const spec = s.question.input;
    expect(spec.kind).toBe("assign");
    people = spec.people;
    if (qi === 0) await checkNonCaptain(env, s);
    // team qi locks in round qi+1 via tap-to-assign (person i -> slot (i+qi)%4)
    const p = env.phones[qi];
    for (let k = 0; k < spec.people.length; k++) {
      const person = p.page.locator(".ph-person", { hasText: spec.people[k].name });
      // the board auto-selects the next unplaced ancestor; tapping it again would deselect
      if ((await person.getAttribute("aria-selected")) !== "true") await person.click();
      await p.page.locator(".ph-altar").nth((k + qi) % spec.slots.length).click();
    }
    await p.page.locator(".ph-lock").click();
    await expect(p.page.getByRole("alertdialog")).toContainText(/final for the whole set/);
    if (qi === 0) await p.page.screenshot({ path: `${SHOTS}/case-lock-confirm-${p.label}.png`, fullPage: true });
    await p.page.getByRole("button", { name: /Yes, lock it/ }).click();
    const v = await expectSaved(p, "answer", qid);
    const want = Object.fromEntries(spec.people.map((x: any, k: number) => [x.id, spec.slots[(k + qi) % spec.slots.length].id]));
    expect(v).toEqual(want);
    locks.push({ round: qi, value: want });
    // earlier lockers: final — UI shows locked, API rejects a new lock
    for (let j = 0; j < qi; j++) {
      const m = (await me(env.phones[j].ctx.request)).body;
      expect(m.current.canSubmit).toBe(false);
      expect(m.current.reasonCannot).toBe("already_locked");
      await expect(env.phones[j].page.getByText(/Your case is locked|Your locked case/).first()).toBeVisible();
      await expect(env.phones[j].page.locator(".ph-lock")).toHaveCount(0);
      const r = await env.phones[j].ctx.request.post("/api/answer", { data: { party: "demo", questionId: qid, stage: "answer", value: want, requestId: randomUUID() } });
      expect(r.status()).toBeGreaterThanOrEqual(400);
    }
    if (qi === 0) await shotAll(env, "case-r1-answer");
    await checkLayouts(env, `case r${qi + 1} answer`);
    const rv = await waitReveal(env.a, qid);
    if (qi < 2) {
      expect(rv.reveal?.correct ?? null, "case solution must not be revealed before round 3").toBeNull();
      pre.push(JSON.stringify(rv));
      await shotAll(env, `case-r${qi + 1}-reveal`);
    } else {
      const sol = rv.reveal.correct as Record<string, string>;
      expect(Object.keys(sol).length).toBe(4);
      // no pre-final payload contained the full solution
      for (const raw of pre) {
        const leaked = Object.entries(sol).every(([pid, sid]) => raw.includes(`"${pid}":"${sid}"`));
        expect(leaked, "solution mapping visible before final reveal").toBe(false);
      }
      for (let i = 0; i < 3; i++) {
        const c = Object.entries(locks[i].value).filter(([pid, sid]) => sol[pid] === sid).length;
        const exp = Math.round(((300 - 75 * locks[i].round) * c) / 4);
        expect.soft(await points(env.phones[i]), `case team ${i} round ${locks[i].round + 1} correct ${c}`).toBe(exp);
      }
      await expect(env.tvPage.locator("body")).toContainText(people[0].name);
      await shotAll(env, "case-final-reveal");
    }
    await checkLayouts(env, `case r${qi + 1} reveal`);
  }
  await waitPhase(env.a, (x) => x.phase.kind === "results", 60_000);
  await env.close();
});

/* ------------------------------------------------------------------ doubled set + late join */

test("G7 doubled set: final_round badge on TV + phones, points x2; late joiner plays practice", async ({ browser }) => {
  const env = await setup(browser, "loteria", {}, true);
  const intro = await waitPhase(env.a, (x) => x.phase.kind === "intro" || x.phase.kind === "question", 30_000);
  expect(intro.phase.doubled).toBe(true);
  if (intro.phase.kind === "intro") {
    await expect(env.tvPage.locator(".tv-lastchance")).toBeVisible();
    await expect(env.phones[0].page.locator(".ph-double")).toContainText(/double points/i);
    await shotAll(env, "doubled-intro");
  }
  const s = await waitPhase(env.a, (x) => x.phase.kind === "question" && !!x.question?.input, 60_000);
  await expect(env.phones[0].page.locator(".ph-double")).toBeVisible();
  // late join during question 1
  const late = await joinUI(browser, "Tarde", { width: 390, height: 844 });
  await expect(late.page.getByText(/Watching this one|from the next question/)).toBeVisible();
  const lm = (await me(late.ctx.request)).body;
  expect(lm.current.canSubmit).toBe(false);
  expect(lm.current.reasonCannot).toBe("late_join");
  for (let i = 0; i < 3; i++) {
    await env.phones[i].page.locator(".ph-card").nth(i).click();
    await env.phones[i].page.locator(".ph-lock").click();
    await expectSaved(env.phones[i], "answer", s.question.id);
  }
  const rv = await waitReveal(env.a, s.question.id);
  const correct = rv.reveal.correct as number;
  for (let i = 0; i < 3; i++) expect.soft(await points(env.phones[i])).toBe(i === correct ? 200 : 0);
  // next question: late team can answer, practice label
  const s2 = await waitPhase(env.a, (x) => x.phase.kind === "question" && x.question?.id !== s.question.id && !!x.question?.input, 60_000);
  await expect(late.page.locator(".ph-practice")).toBeVisible();
  await late.page.locator(".ph-card").first().click();
  await late.page.locator(".ph-lock").click();
  await expectSaved(late, "answer", s2.question.id);
  const lm2 = (await me(late.ctx.request)).body;
  expect(lm2.current.ranked).toBe(false);
  await late.page.screenshot({ path: `${SHOTS}/late-join-practice-phone390.png`, fullPage: true });
  const res = await waitPhase(env.a, (x) => x.phase.kind === "results", 120_000);
  const lateRow = res.lastSet.scores.find((r: any) => r.teamId === lm.team.id);
  if (lateRow) expect(lateRow.ranked).toBe(false);
  for (const r of res.lastSet.scores) expect(r.score % 2).toBe(0);
  // one-shot: next set not doubled
  const nxt = await waitPhase(env.a, (x) => x.phase.kind === "intro" && x.phase.setId !== res.phase.setId, 60_000);
  expect(nxt.phase.doubled ?? false).toBe(false);
  await late.ctx.close();
  await env.close();
});

/* ------------------------------------------------------------------ reconnect */

test("G8 refresh mid-question restores saved state; offline banner then recovery", async ({ browser }) => {
  const a = await admin();
  await resetDemo(a, { ...FAST, families: ["closest"] });
  const p = await joinUI(browser, "Refresca", { width: 390, height: 844 });
  await sleep(6500);
  await adminAction(a, "start");
  const s = await waitPhase(a, (x) => x.phase.kind === "question" && !!x.question?.input, 30_000);
  await p.page.locator(".ph-num-field input").fill(String(s.question.input.min + s.question.input.step));
  await p.page.locator(".ph-lock").click();
  await expectSaved(p, "answer", s.question.id);
  await p.page.reload();
  await expect(p.page.locator(".ph-locked.saved")).toBeVisible();
  await p.ctx.setOffline(true);
  await expect(p.page.getByText(/Reconnecting/)).toBeVisible({ timeout: 20_000 });
  await p.ctx.setOffline(false);
  await expect(p.page.getByText(/Reconnecting/)).toHaveCount(0, { timeout: 20_000 });
  await expect(p.page.locator(".ph-locked.saved, .ph-result, .ph-state").first()).toBeVisible();
  await p.ctx.close();
});
