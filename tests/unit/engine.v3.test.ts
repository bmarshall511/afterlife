import { describe, expect, it, beforeEach } from "vitest";
import type { Db } from "@/server/db";
import { buildMe, buildSnapshot } from "@/server/engine";
import * as C from "@/server/engine/control";
import { runDemoBots } from "@/server/engine/demobots";
import { scoreFib } from "@/server/engine/scoring";
import { validateValue } from "@/server/engine/validate";
import { P, T0, families, itemOf, newTeam, phase, runUntil, setup, submit } from "./engine-helpers";

let d: Db;
beforeEach(async () => {
  d = await setup();
});
async function teams(n: number) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(await newTeam(`T${i}`));
  return out;
}
async function open(fam: string, n: number) {
  const ts = await teams(n);
  await families(d, [fam]);
  await C.startParty(P, "test", T0);
  const t = await runUntil(d, T0, (x) => x.kind === "question");
  expect((await phase(d)).family).toBe(fam);
  return { ts, t };
}
const snap = (t: number) => buildSnapshot(d, P, t);
const ledger = async (qid: string) =>
  Object.fromEntries((await d.query("SELECT team_id, points FROM score_ledger WHERE question_id=$1 AND kind='question'", [qid])).map((r) => [r.team_id, r.points]));
const fibVal = (k: number, fib = 2) => ({ statements: [`truth one ${k}`, `truth two ${k}`, `the fib ${k}`], fib });

describe("dichos & price", () => {
  it("dichos 100/0; price uses closest scoring", async () => {
    const { ts, t } = await open("dichos", 2);
    const it0 = await itemOf(d, (await phase(d)).questionId!);
    expect((await snap(t)).question!.input).toMatchObject({ kind: "choice" });
    await submit(d, ts[0].memberId, it0.answer, t + 100);
    await submit(d, ts[1].memberId, (it0.answer + 1) % 4, t + 100);
    await runUntil(d, t, (x) => x.kind === "reveal", 1000);
    expect(await ledger((await phase(d)).questionId!)).toEqual({ [ts[0].teamId]: 100, [ts[1].teamId]: 0 });
  });
  it("price: over busts, closest bonus", async () => {
    const { ts, t } = await open("price", 2);
    const truth = (await itemOf(d, (await phase(d)).questionId!)).answer as number;
    await submit(d, ts[0].memberId, truth + 1, t + 100);
    await submit(d, ts[1].memberId, Math.round(truth * 0.9), t + 100);
    await runUntil(d, t, (x) => x.kind === "reveal", 1000);
    expect(await ledger((await phase(d)).questionId!)).toEqual({ [ts[0].teamId]: 0, [ts[1].teamId]: 100 });
  });
});

describe("two truths and a fib", () => {
  it("scoring math", () => {
    const r = scoreFib("F", 1, [{ teamId: "A", choice: 1 }, { teamId: "B", choice: 0 }, { teamId: "C", choice: 2 }, { teamId: "F", choice: 1 }]);
    expect(Object.fromEntries(r.points)).toEqual({ A: 100, B: 0, C: 0, F: 67 });
    expect(r.voters).toBe(3);
  });
  it("validation: 3 non-empty statements ≤80, fib 0..2", () => {
    const spec = { kind: "fib", maxLength: 80, prompt: "" } as any;
    expect(validateValue(spec, { statements: [" a ", "b", "c"], fib: 0 })).toEqual({ statements: ["a", "b", "c"], fib: 0 });
    for (const bad of [{ statements: ["a", "b"], fib: 0 }, { statements: ["a", "", "c"], fib: 0 }, { statements: ["a", "b", "x".repeat(81)], fib: 0 }, { statements: ["a", "b", "c"], fib: 3 }, ["a", "b", "c"]])
      expect(() => validateValue(spec, bad)).toThrow();
  });

  it("write → feature → vote; self_vote; filter; no leak; scoring; next question skips write with unshown entry", async () => {
    const { ts, t } = await open("fib", 4);
    expect((await phase(d)).stage).toBe("write");
    expect((await snap(t)).question!.input).toMatchObject({ kind: "fib", maxLength: 80 });
    await expect(submit(d, ts[0].memberId, { statements: ["ok", "fine", "what the fuck"], fib: 1 }, t + 50)).rejects.toMatchObject({ code: "filtered" });
    for (let i = 0; i < 4; i++) await submit(d, ts[i].memberId, fibVal(i), t + 100);
    const tv = await runUntil(d, t, (x) => x.stage === "vote", 1000);
    const qid = (await phase(d)).questionId!;
    const fe = (await d.query("SELECT private FROM question WHERE id=$1", [qid]))[0].private.featured;
    const featured = ts.find((x) => x.teamId === fe.teamId)!;
    const sv = await snap(tv);
    expect(sv.question!.input).toMatchObject({ kind: "choice" });
    expect((sv.question!.input as any).options).toHaveLength(3);
    expect(sv.question!.scene?.data).toMatchObject({ featuredTeamId: featured.teamId });
    const j = JSON.stringify(sv);
    expect(j).not.toMatch(/"(fib|fibIndex|fibShown|order|featured|answerId)":/);
    expect(sv.reveal).toBeNull();
    expect((await buildMe(d, P, featured.memberId, tv)).current.reasonCannot).toBe("watching");
    await expect(submit(d, featured.memberId, 0, tv + 100)).rejects.toMatchObject({ code: "self_vote" });
    const others = ts.filter((x) => x !== featured);
    await submit(d, others[0].memberId, fe.fibShown, tv + 200);
    await submit(d, others[1].memberId, (fe.fibShown + 1) % 3, tv + 200);
    await submit(d, others[2].memberId, (fe.fibShown + 2) % 3, tv + 200);
    const tr = await runUntil(d, tv, (x) => x.kind === "reveal", 1000);
    expect(tr - tv).toBeLessThan(15000); // early close: every non-featured eligible team voted
    expect(await ledger(qid)).toMatchObject({ [others[0].teamId]: 100, [others[1].teamId]: 0, [others[2].teamId]: 0, [featured.teamId]: 67 });
    const r = (await snap(tr)).reveal!;
    expect(r.correct).toBe(fe.fibShown);
    expect(r.detail).toMatchObject({ featuredTeamId: featured.teamId, featuredTeamName: "T" + ts.indexOf(featured) + "'s Family", fibIndex: fe.fibShown, statements: fe.statements });
    expect((r.detail as any).votes.reduce((a: number, b: number) => a + b, 0)).toBe(3);
    // q2: unshown entries exist → straight to vote, featuring a different team
    const t2 = await runUntil(d, tr, (x) => x.kind === "question" && x.qIndex === 1, 1000);
    expect((await phase(d)).stage).toBe("vote");
    const fe2 = (await d.query("SELECT private FROM question WHERE id=$1", [(await phase(d)).questionId]))[0].private.featured;
    expect(fe2.teamId).not.toBe(featured.teamId);
    void t2;
  });

  it("<2 voters → void; host-hidden featured entry → void", async () => {
    const { ts, t } = await open("fib", 3);
    for (let i = 0; i < 3; i++) await submit(d, ts[i].memberId, fibVal(i), t + 100);
    const tv = await runUntil(d, t, (x) => x.stage === "vote", 1000);
    const fe = (await d.query("SELECT private FROM question WHERE id=$1", [(await phase(d)).questionId]))[0].private.featured;
    const voter = ts.find((x) => x.teamId !== fe.teamId)!;
    await submit(d, voter.memberId, 0, tv + 100);
    const tr = await runUntil(d, tv, (x) => x.kind === "reveal", 1000);
    expect((await snap(tr)).reveal).toMatchObject({ void: true, voidReason: "Not enough families voted, so this one doesn't count.", correct: null });
    // q2 features an unshown entry; host hides it → void
    const t2 = await runUntil(d, tr, (x) => x.kind === "question" && x.qIndex === 1, 1000);
    const fe2 = (await d.query("SELECT private FROM question WHERE id=$1", [(await phase(d)).questionId]))[0].private.featured;
    await C.hideEntry(P, fe2.answerId, true, "admin", t2 + 10);
    const tr2 = await runUntil(d, t2, (x) => x.kind === "reveal", 1000);
    expect((await snap(tr2)).reveal).toMatchObject({ void: true, voidReason: "The host removed these statements, so this one doesn't count." });
  });

  it("demo bots write plausible statements and vote", async () => {
    await d.query("UPDATE party SET settings = settings || '{\"families\":[\"fib\"],\"fibWriteMs\":60000,\"fibVoteMs\":60000}'::jsonb WHERE id='demo'");
    await C.addDemoBots(P, 3, T0);
    await C.startParty(P, "test", T0);
    let t = await runUntil(d, T0, (x) => x.stage === "write", 1000);
    for (let k = 0; k < 20; k++) await runDemoBots(P, t + k * 1000);
    expect((await d.query("SELECT COUNT(*)::int n FROM answer WHERE kind='write'"))[0].n).toBe(3);
    t = await runUntil(d, t, (x) => x.stage === "vote", 1000);
    for (let k = 0; k < 20; k++) await runDemoBots(P, t + k * 1000);
    expect((await d.query("SELECT COUNT(*)::int n FROM answer WHERE kind='vote'"))[0].n).toBe(2);
  });
});

describe("After Dark", () => {
  const ad = async () => (await d.query("SELECT COUNT(*)::int n FROM question WHERE private->'item'->>'rating'='after-dark'"))[0].n;
  const fast = { introMs: 1000, lineAnswerMs: 1000, loteriaAnswerMs: 1000, closestAnswerMs: 1000, dichosAnswerMs: 1000, priceAnswerMs: 1000, revealMs: 1000, resultsMs: 1000, intervalMs: 1000 };
  it("excluded by default; included when on; admin toggle audited; switching off swaps a planned question", async () => {
    await setup({ content: (await import("@/server/engine/fixtures")).fixtureContent(15) });
    await newTeam("Ana");
    await C.updateSettings(P, { ...fast, families: ["line", "loteria", "closest", "dichos", "price"] }, "admin", T0);
    await C.startParty(P, "test", T0);
    let t = await runUntil(d, T0, (x) => x.kind === "intro" && x.setSeq === 8, 1000);
    expect(await ad()).toBe(0);
    await C.setAfterDark(P, "admin", true, t);
    expect((await d.query("SELECT settings FROM party WHERE id=$1", [P]))[0].settings.afterDark).toBe(true);
    expect((await d.query("SELECT COUNT(*)::int n FROM audit WHERE action='after_dark'"))[0].n).toBe(1);
    t = await runUntil(d, t, (x) => x.kind === "intro" && x.setSeq === 16, 1000);
    expect(await ad()).toBeGreaterThan(0);
    // plan a set with an after-dark question, then switch off before it opens
    t = await runUntil(d, t, (x) => x.kind === "intro", 1000);
    const pend = await d.query("SELECT q.id, q.idx FROM question q JOIN game_set g ON g.id=q.set_id WHERE g.seq=(SELECT MAX(seq) FROM game_set) ORDER BY idx");
    await d.query(`UPDATE question SET private = jsonb_set(private, '{item,rating}', '"after-dark"') WHERE id=$1`, [pend[2].id]);
    await C.setAfterDark(P, "admin", false, t);
    await runUntil(d, t, (x) => x.kind === "question" && x.qIndex === 2, 1000);
    const row = (await d.query("SELECT private->'item'->>'rating' r FROM question WHERE id=$1", [pend[2].id]))[0];
    expect(row.r).not.toBe("after-dark");
  });
});

describe("mixed rounds with the new games", () => {
  it("≥3 teams: at most one social (incl. fib) per set, no back-to-back family", async () => {
    await setup({ content: (await import("@/server/engine/fixtures")).fixtureContent(30) });
    await teams(4);
    await C.updateSettings(P, { introMs: 1000, calaveraWriteMs: 1000, calaveraVoteMs: 1000, lineAnswerMs: 1000, loteriaAnswerMs: 1000, roomAnswerMs: 1000, roomGuessMs: 1000, closestAnswerMs: 1000, dichosAnswerMs: 1000, priceAnswerMs: 1000, fibWriteMs: 1000, fibVoteMs: 1000, revealMs: 1000, calaveraRevealMs: 1000, resultsMs: 1000, intervalMs: 1000, families: ["calavera", "line", "loteria", "room", "closest", "dichos", "fib", "price"] }, "admin", T0);
    await C.startParty(P, "test", T0);
    await runUntil(d, T0, (x) => x.kind === "intro" && x.setSeq === 20, 1000);
    const qs = await d.query("SELECT g.seq, q.private->'item'->>'family' f FROM question q JOIN game_set g ON g.id=q.set_id WHERE g.seq < 20 ORDER BY g.seq, q.idx");
    const fams = qs.map((r) => r.f);
    for (const f of ["dichos", "price", "fib"]) expect(fams).toContain(f);
    for (let i = 1; i < fams.length; i++) expect(fams[i]).not.toBe(fams[i - 1]);
    const bySeq: Record<number, string[]> = {};
    for (const r of qs) (bySeq[r.seq] ??= []).push(r.f);
    for (const fs of Object.values(bySeq)) expect(fs.filter((f) => ["calavera", "room", "fib"].includes(f)).length).toBeLessThanOrEqual(1);
  });
});
