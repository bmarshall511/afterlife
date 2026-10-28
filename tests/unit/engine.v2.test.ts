import { describe, expect, it, beforeEach } from "vitest";
import type { Db } from "@/server/db";
import { buildMe, buildSnapshot } from "@/server/engine";
import * as C from "@/server/engine/control";
import type { Snapshot } from "@/shared/types";
import { P, T0, families, itemOf, newTeam, phase, runUntil, setup, submit, submitAnswer, tick } from "./engine-helpers";

let d: Db;
beforeEach(async () => {
  d = await setup();
});

type Team = Awaited<ReturnType<typeof newTeam>>;
async function teams(n: number): Promise<Team[]> {
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

/** No secrets in a pre-reveal snapshot. */
function assertClean(s: Snapshot, extra: string[] = []) {
  const j = JSON.stringify(s);
  expect(j).not.toContain("SECRET");
  expect(j).not.toMatch(/"(answer|private|solution|tally|split|voteEntries|answerId)":/);
  // team ids/names are public (standings); authorship must not appear in the question payload
  for (const x of extra) expect(JSON.stringify(s.question)).not.toContain(x);
  expect(s.reveal).toBeNull();
}

describe("calavera", () => {
  it("write → vote (anonymous list, own entry id, self-vote rejected, hide) → reveal scoring", async () => {
    const { ts, t } = await open("calavera", 4);
    expect((await phase(d)).stage).toBe("write");
    const s0 = await snap(t);
    expect(s0.question?.input).toMatchObject({ kind: "text", maxLength: 90 });
    assertClean(s0);
    await expect(submit(d, ts[0].memberId, "what the f.u.c.k", t + 100)).rejects.toMatchObject({ code: "filtered" });
    await expect(submit(d, ts[0].memberId, "x".repeat(91), t + 100)).rejects.toMatchObject({ code: "invalid" });
    for (let i = 0; i < 4; i++) await submit(d, ts[i].memberId, `verse ${i}`, t + 200, `w${i}`);
    // all eligible wrote → early close after minViewMs
    let t2 = await runUntil(d, t + 200, (x) => x.stage === "vote", 500);
    expect(t2 - t).toBeLessThanOrEqual(4500);
    const sv = await snap(t2);
    assertClean(sv, ts.map((x) => x.teamId).concat(["T0's", "T1's"]));
    const entries = (sv.question!.input as any).entries as { id: string; text: string }[];
    expect(entries).toHaveLength(4);
    for (const e of entries) expect(Object.keys(e).sort()).toEqual(["id", "text"]);
    const meViews = await Promise.all(ts.map((x) => buildMe(d, P, x.memberId, t2)));
    const own = meViews.map((m) => m.current.ownEntryId!);
    expect(new Set(own).size).toBe(4);
    for (let i = 0; i < 4; i++) expect(entries.find((e) => e.id === own[i])!.text).toBe(`verse ${i}`);
    await expect(submit(d, ts[0].memberId, own[0], t2 + 100)).rejects.toMatchObject({ code: "self_vote" });
    await expect(submit(d, ts[0].memberId, "nope", t2 + 100)).rejects.toMatchObject({ code: "invalid" });
    // host hides T3's entry: it vanishes from the list; earlier vote for it is discarded
    await submit(d, ts[2].memberId, own[3], t2 + 150);
    const listed = await C.listEntries(P);
    const t3Answer = listed.entries.find((e: any) => e.teamId === ts[3].teamId)!.answerId;
    await C.hideEntry(P, t3Answer, true, "admin", t2 + 200);
    const sv2 = await snap(t2 + 300);
    expect(((sv2.question!.input as any).entries as any[]).map((e) => e.id)).not.toContain(own[3]);
    await expect(submit(d, ts[0].memberId, own[3], t2 + 300)).rejects.toMatchObject({ code: "invalid" });
    await submit(d, ts[0].memberId, own[1], t2 + 400); // T0 → T1
    await submit(d, ts[1].memberId, own[0], t2 + 400); // T1 → T0
    await submit(d, ts[3].memberId, own[1], t2 + 400); // T3 → T1
    const tr = await runUntil(d, t2 + 400, (x) => x.kind === "reveal", 1000);
    const q = (await phase(d)).questionId!;
    // voters: T0, T1, T3 (T2's vote was for the hidden entry → discarded)
    // T0: 1 vote / 2 others(T1,T3) = 50 + 10 = 60; T1: 2/2 = 100(+10 cap) ; T2: 0 votes /3 = 0 (no valid vote) ; T3 hidden → 0
    expect(await ledger(q)).toEqual({ [ts[0].teamId]: 60, [ts[1].teamId]: 100, [ts[2].teamId]: 0, [ts[3].teamId]: 0 });
    const r = (await snap(tr)).reveal!;
    const det = r.detail as any;
    expect(det.entries).toHaveLength(3);
    expect(det.entries.find((e: any) => e.teamId === ts[1].teamId)).toMatchObject({ votes: 2, winner: true, teamName: "T1's Family" });
    expect(r.outcomes!.find((o) => o.teamId === ts[3].teamId)).toMatchObject({ points: 0, note: "entry hidden by host" });
    expect((await buildMe(d, P, ts[1].memberId, tr)).current.result).toEqual({ points: 100, max: 100, note: "2 votes" });
  });

  it("<2 entries → void; exactly 2 → house fillers (unscorable)", async () => {
    const { ts, t } = await open("calavera", 3);
    await submit(d, ts[0].memberId, "only one", t + 100);
    let tr = await runUntil(d, t, (x) => x.kind === "reveal");
    const r = (await snap(tr)).reveal!;
    expect(r).toMatchObject({ void: true, voidReason: expect.stringContaining("Not enough epitaphs"), correct: null });
    expect((await buildMe(d, P, ts[0].memberId, tr)).current.result).toEqual({ points: 0, max: 0, note: "void" });
    let t2 = await runUntil(d, tr, (x) => x.kind === "question" && x.qIndex === 1);
    await submit(d, ts[0].memberId, "a", t2 + 100);
    await submit(d, ts[1].memberId, "b", t2 + 100);
    t2 = await runUntil(d, t2, (x) => x.stage === "vote");
    const entries = ((await snap(t2)).question!.input as any).entries;
    expect(entries).toHaveLength(4);
    const house = entries.filter((e: any) => e.text.startsWith("house"));
    expect(house).toHaveLength(2);
    await submit(d, ts[2].memberId, house[0].id, t2 + 100);
    tr = await runUntil(d, t2, (x) => x.kind === "reveal");
    const L = await ledger((await phase(d)).questionId!);
    expect(L[ts[0].teamId]).toBe(0);
    expect(L[ts[2].teamId]).toBe(0); // non-writer
  });
});

describe("read the room", () => {
  it("answer → guess (need_answer) → scoring vs actual; <3 answers void", async () => {
    const { ts, t } = await open("room", 4);
    const choices = [0, 0, 1, 2];
    for (let i = 0; i < 3; i++) await submit(d, ts[i].memberId, choices[i], t + 100);
    await submit(d, ts[3].memberId, 2, t + 100).catch(() => {});
    let tg = await runUntil(d, t, (x) => x.stage === "guess", 500);
    const sg = await snap(tg);
    assertClean(sg);
    expect(sg.question!.input).toMatchObject({ kind: "percent" });
    // T3 answered too (choice 2). Make a 5th? No: check need_answer with a team that skipped – none here; use a new question below.
    await submit(d, ts[0].memberId, 50, tg + 100);
    await submit(d, ts[2].memberId, 0, tg + 100);
    const me0 = await buildMe(d, P, ts[0].memberId, tg + 150);
    expect(me0.current.prior).toEqual({ stage: "answer", value: 0 });
    const tr = await runUntil(d, tg, (x) => x.kind === "reveal");
    const q = (await phase(d)).questionId!;
    // tally [2,1,1,0]: T0 actual 50 → 100; T2 actual 25, guess 0 → 25; T1 no guess → 0
    const L = await ledger(q);
    expect(L[ts[0].teamId]).toBe(100);
    expect(L[ts[2].teamId]).toBe(25);
    expect(L[ts[1].teamId]).toBe(0);
    const r = (await snap(tr)).reveal!;
    expect((r.detail as any).split).toEqual([2, 1, 1, 0]);
    expect(r.correct).toBeNull();
    // q2: T3 skips the answer → need_answer on guess; only 3 answers ok
    let t2 = await runUntil(d, tr, (x) => x.kind === "question" && x.qIndex === 1);
    for (let i = 0; i < 3; i++) await submit(d, ts[i].memberId, 1, t2 + 100);
    t2 = await runUntil(d, t2, (x) => x.stage === "guess");
    await expect(submit(d, ts[3].memberId, 10, t2 + 100)).rejects.toMatchObject({ code: "need_answer" });
    expect((await buildMe(d, P, ts[3].memberId, t2 + 100)).current.reasonCannot).toBe("need_answer");
    // q3: only 2 answers → void (no guess stage)
    let t3 = await runUntil(d, t2, (x) => x.kind === "question" && x.qIndex === 2);
    await submit(d, ts[0].memberId, 1, t3 + 100);
    await submit(d, ts[1].memberId, 1, t3 + 100);
    t3 = await runUntil(d, t3, (x) => x.kind === "reveal" || x.stage === "guess");
    expect((await phase(d)).kind).toBe("reveal");
    expect((await snap(t3)).reveal).toMatchObject({ void: true, voidReason: expect.stringContaining("Not enough families") });
  });
});

describe("ofrenda case", () => {
  it("clue (watch) → answer per round; lock-once; no solution before q3; score on q3", async () => {
    const { ts, t } = await open("case", 3);
    const ph = await phase(d);
    expect(ph.stage).toBe("clue");
    const item = await itemOf(d, ph.questionId!);
    const sol = item.answer as Record<string, string>;
    const solStr = JSON.stringify(sol);
    const sc = await snap(t);
    assertClean(sc, [solStr]);
    expect(sc.question!.input).toBeNull();
    expect((await buildMe(d, P, ts[0].memberId, t)).current.reasonCannot).toBe("watching");
    await expect(submit(d, ts[0].memberId, sol, t + 100)).rejects.toMatchObject({ code: "invalid" });
    // clue stage never ends early
    const ta = await runUntil(d, t, (x) => x.stage === "answer", 1000);
    expect(ta - t).toBe(20000);
    const sa = await snap(ta);
    assertClean(sa, [solStr]);
    expect(sa.question!.input).toMatchObject({ kind: "assign" });
    await submit(d, ts[0].memberId, sol, ta + 100); // round 1, all correct → 300
    const tr = await runUntil(d, ta, (x) => x.kind === "reveal");
    const r1 = (await snap(tr)).reveal!;
    expect(JSON.stringify(r1)).not.toContain(solStr);
    expect(r1.correct).toBeNull();
    expect(r1.detail).toMatchObject({ locked: 1, thinking: 2 });
    expect((await buildMe(d, P, ts[0].memberId, tr)).current.result).toMatchObject({ points: 0, max: 0, note: "locked" });
    // round 2
    const ta2 = await runUntil(d, tr, (x) => x.qIndex === 1 && x.stage === "answer");
    await expect(submit(d, ts[0].memberId, sol, ta2 + 100)).rejects.toMatchObject({ code: "already_locked" });
    const me0 = await buildMe(d, P, ts[0].memberId, ta2 + 100);
    expect(me0.current).toMatchObject({ reasonCannot: "already_locked", prior: { stage: "answer", value: sol } });
    const people = Object.keys(sol);
    const swapped = { ...sol, [people[0]]: sol[people[1]], [people[1]]: sol[people[0]] };
    await submit(d, ts[1].memberId, swapped, ta2 + 200); // round 2, 2/4 → 113
    const tr2 = await runUntil(d, ta2, (x) => x.kind === "reveal");
    expect(JSON.stringify((await snap(tr2)).reveal)).not.toContain(solStr);
    const ta3 = await runUntil(d, tr2, (x) => x.qIndex === 2 && x.stage === "answer");
    await expect(submit(d, ts[1].memberId, sol, ta3 + 100)).rejects.toMatchObject({ code: "already_locked" });
    // remaining unlocked team locks → everyone done → early close
    await submit(d, ts[2].memberId, sol, ta3 + 100); // round 3 → 150
    const tr3 = await runUntil(d, ta3, (x) => x.kind === "reveal", 500);
    expect(tr3 - ta3).toBeLessThanOrEqual(4500);
    const L = await ledger((await phase(d)).questionId!);
    expect(L).toEqual({ [ts[0].teamId]: 300, [ts[1].teamId]: 113, [ts[2].teamId]: 150 });
    const r3 = (await snap(tr3)).reveal!;
    expect(r3.correct).toEqual(sol);
    expect((await buildMe(d, P, ts[1].memberId, tr3)).current.result).toMatchObject({ points: 113, max: 300 });
    const tres = await runUntil(d, tr3, (x) => x.kind === "results");
    const scores = Object.fromEntries((await snap(tres)).lastSet!.scores.map((s) => [s.teamId, s.score]));
    expect(scores).toEqual({ [ts[0].teamId]: 300, [ts[1].teamId]: 113, [ts[2].teamId]: 150 });
  });
});

describe("objective families", () => {
  it("line: Kendall partial credit; order input is not the answer", async () => {
    const { ts, t } = await open("line", 1);
    const it0 = await itemOf(d, (await phase(d)).questionId!);
    const s = await snap(t);
    assertClean(s);
    expect((s.question!.input as any).items.map((x: any) => x.id)).not.toEqual(it0.answer);
    const a = it0.answer as string[];
    await submit(d, ts[0].memberId, [a[1], a[0], ...a.slice(2)], t + 100);
    await runUntil(d, t, (x) => x.kind === "reveal");
    expect((await ledger((await phase(d)).questionId!))[ts[0].teamId]).toBe(a.length === 4 ? 83 : 90);
  });

  it("closest: over busts, closest bonus, strict step/range validation", async () => {
    const { ts, t } = await open("closest", 3);
    const truth = (await itemOf(d, (await phase(d)).questionId!)).answer as number;
    assertClean(await snap(t), [`${truth}`]);
    await expect(submit(d, ts[0].memberId, 10_001, t + 50)).rejects.toMatchObject({ code: "invalid" });
    await expect(submit(d, ts[0].memberId, 1.5, t + 50)).rejects.toMatchObject({ code: "invalid" });
    await submit(d, ts[0].memberId, truth + 1, t + 100);
    await submit(d, ts[1].memberId, Math.round(truth * 0.8), t + 100);
    await submit(d, ts[2].memberId, Math.round(truth * 0.6), t + 100);
    const tr = await runUntil(d, t, (x) => x.kind === "reveal", 500);
    const L = await ledger((await phase(d)).questionId!);
    expect(L).toEqual({ [ts[0].teamId]: 0, [ts[1].teamId]: 75, [ts[2].teamId]: 25 });
    const out = (await snap(tr)).reveal!.outcomes!;
    expect(out.find((o) => o.teamId === ts[0].teamId)?.note).toBe("over");
    expect(out.find((o) => o.teamId === ts[1].teamId)?.note).toBe("closest");
  });

  it("loteria: choice grid, 100/0", async () => {
    const { ts, t } = await open("loteria", 2);
    const it0 = await itemOf(d, (await phase(d)).questionId!);
    assertClean(await snap(t));
    await submit(d, ts[0].memberId, it0.answer, t + 100);
    await submit(d, ts[1].memberId, (it0.answer + 1) % 9, t + 100);
    await runUntil(d, t, (x) => x.kind === "reveal", 500);
    expect(await ledger((await phase(d)).questionId!)).toEqual({ [ts[0].teamId]: 100, [ts[1].teamId]: 0 });
  });
});

describe("doubled set (final_round)", () => {
  it("marks only the next set; ledger ×2; history max 600; one-shot", async () => {
    const [a] = await teams(1);
    await families(d, ["loteria", "line"]);
    await C.markFinalRound(P, "admin", true, T0);
    await C.startParty(P, "test", T0);
    let t = await runUntil(d, T0, (x) => x.kind === "intro");
    expect((await snap(t)).phase.doubled).toBe(true);
    for (let i = 0; i < 3; i++) {
      t = await runUntil(d, t, (x) => x.kind === "question" && x.qIndex === i);
      expect((await snap(t)).phase.doubled).toBe(true);
      const it0 = await itemOf(d, (await phase(d)).questionId!);
      await submit(d, a.memberId, it0.answer, t + 100);
      t = await runUntil(d, t, (x) => x.kind === "reveal");
      expect((await buildMe(d, P, a.memberId, t)).current.result).toEqual({ points: 200, max: 200 });
    }
    t = await runUntil(d, t, (x) => x.kind === "results");
    expect((await snap(t)).lastSet!.scores[0]).toMatchObject({ score: 600, perfect: true });
    const me = await buildMe(d, P, a.memberId, t);
    expect(me.history[0]).toMatchObject({ score: 600, max: 600, doubled: true });
    t = await runUntil(d, t, (x) => x.kind === "intro" && x.setSeq === 2);
    expect((await snap(t)).phase.doubled).toBeUndefined();
    expect((await d.query("SELECT doubled FROM game_set ORDER BY seq")).map((r) => r.doubled)).toEqual([true, false]);
  });
});

describe("scheduling", () => {
  const fast = { introMs: 1000, calaveraWriteMs: 2000, calaveraVoteMs: 2000, lineAnswerMs: 2000, loteriaAnswerMs: 2000, roomAnswerMs: 2000, roomGuessMs: 2000, closestAnswerMs: 2000, caseClueMs: 1000, caseAnswerMs: 1000, revealMs: 1000, calaveraRevealMs: 1000, resultsMs: 1000, intervalMs: 1000 };
  async function run(n: number, sets: number, extra: Record<string, unknown> = {}) {
    await setup({ content: (await import("@/server/engine/fixtures")).fixtureContent(20) });
    await teams(n);
    await C.updateSettings(P, { ...fast, ...extra }, "admin", T0);
    await C.startParty(P, "test", T0);
    await runUntil(d, T0, (x) => x.kind === "intro" && x.setSeq === sets, 1000);
    const qs = await d.query(
      `SELECT g.seq, g.family AS setfam, g.status, q.idx, q.content_id, q.status AS qstatus, q.private->'item'->>'family' AS family, (q.private->'item'->>'difficulty')::int AS diff
         FROM game_set g JOIN question q ON q.set_id=g.id WHERE g.seq < $1 ORDER BY g.seq, q.idx`,
      [sets],
    );
    return qs;
  }
  const social = (f: string) => f === "calavera" || f === "room";
  function bySet(qs: any[]) {
    const m = new Map<number, any[]>();
    for (const r of qs) (m.get(r.seq) ?? m.set(r.seq, []).get(r.seq)!).push(r);
    return [...m.values()];
  }

  it("2 teams: mixed objective questions, no family twice in a row (incl. across sets), no repeats, difficulty 1→2→3", async () => {
    const qs = await run(2, 14);
    const fams = qs.map((r) => r.family);
    expect(fams.filter(social)).toEqual([]);
    expect(fams).not.toContain("case");
    for (let i = 1; i < fams.length; i++) expect(fams[i]).not.toBe(fams[i - 1]);
    for (const set of bySet(qs)) {
      expect(set[0].setfam).toBe("mixed");
      expect(new Set(set.map((r) => r.family)).size).toBeGreaterThan(1);
      expect(set.map((r) => r.diff)).toEqual([1, 2, 3]);
    }
    const ids = qs.map((r) => r.content_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("4 teams: social questions appear, at most one per set; phase.family follows the question", async () => {
    const qs = await run(4, 14);
    const fams = qs.map((r) => r.family);
    expect(fams.some(social)).toBe(true);
    expect(new Set(fams)).toEqual(new Set(["calavera", "line", "loteria", "room", "closest"]));
    for (let i = 1; i < fams.length; i++) expect(fams[i]).not.toBe(fams[i - 1]);
    for (const set of bySet(qs)) expect(set.filter((r) => social(r.family)).length).toBeLessThanOrEqual(1);
  });

  it("single enabled game (demo_game) → whole set of that game; case only alone", async () => {
    const qs = await run(1, 4, { families: ["closest"] });
    expect(new Set(qs.map((r) => r.family))).toEqual(new Set(["closest"]));
    expect(new Set(qs.map((r) => r.setfam))).toEqual(new Set(["closest"]));
  });

  it("mixed set: social question with <3 eligible at its start is swapped for an objective one", async () => {
    const ts = await teams(3);
    await families(d, ["room", "line", "loteria", "closest"]);
    await C.updateSettings(P, fast, "admin", T0);
    // force a social first question by making it the least played and only option for q0
    await d.query(`UPDATE party SET engine=$2 WHERE id=$1`, [P, JSON.stringify({ played: { line: 9, loteria: 9, closest: 9, room: 0 } })]);
    await C.startParty(P, "test", T0);
    let t = await runUntil(d, T0, (x) => x.kind === "intro");
    const q0 = (await d.query("SELECT q.private->'item'->>'family' f FROM question q JOIN game_set g ON g.id=q.set_id WHERE q.idx=0"))[0].f;
    expect(q0).toBe("room");
    expect((await snap(t)).phase.family).toBe("room");
    // one team goes away before the question opens → only 2 eligible-active
    await d.query("UPDATE team SET status='away' WHERE id=$1", [ts[2].teamId]);
    t = await runUntil(d, t, (x) => x.kind === "question", 1000);
    const ph = await phase(d);
    expect(social(ph.family!)).toBe(false);
    expect((await snap(t)).question!.family).toBe(ph.family);
    expect((await d.query("SELECT COUNT(*)::int n FROM audit WHERE action='question_swapped'"))[0].n).toBe(1);
  });

  it("mixed set with a void question rescales over counted questions", async () => {
    const ts = await teams(3);
    await families(d, ["room", "loteria", "line"]);
    await C.updateSettings(P, fast, "admin", T0);
    await d.query(`UPDATE party SET engine=$2 WHERE id=$1`, [P, JSON.stringify({ played: { line: 9, loteria: 9, room: 0 } })]);
    await C.startParty(P, "test", T0);
    let t = await runUntil(d, T0, (x) => x.kind === "question");
    expect((await phase(d)).family).toBe("room"); // nobody answers → void
    for (let i = 1; i < 3; i++) {
      t = await runUntil(d, t, (x) => x.kind === "question" && x.qIndex === i);
      const it0 = await itemOf(d, (await phase(d)).questionId!);
      await submit(d, ts[0].memberId, it0.answer, t + 100);
    }
    t = await runUntil(d, t, (x) => x.kind === "results");
    const sc = (await snap(t)).lastSet!;
    expect(sc.family).toBe("room");
    expect(sc.mixed).toBe(true);
    expect((await snap(t)).phase.setFamilies).toHaveLength(3);
    expect((await snap(t)).phase.setFamilies![0]).toBe("room"); // 'mixed' is not a GameFamily: first question's family
    expect(sc.scores.find((s) => s.teamId === ts[0].teamId)!.score).toBe(300); // 200 × 3 / 2
  });
});

describe("concurrency", () => {
  it("parallel identical submits store one row; different value after lock → already", async () => {
    const { ts, t } = await open("closest", 1);
    const res = await Promise.allSettled(Array.from({ length: 6 }, () => submit(d, ts[0].memberId, 500, t + 100, "same")));
    expect(res.every((r) => r.status === "fulfilled")).toBe(true);
    expect((await d.query("SELECT COUNT(*)::int n FROM answer"))[0].n).toBe(1);
    expect((await submit(d, ts[0].memberId, 501, t + 120, "same")).ok).toBe(true); // same requestId → ok, stored value kept
    await expect(submit(d, ts[0].memberId, 502, t + 130, "other")).rejects.toMatchObject({ code: "already" });
    const ph = await phase(d);
    await Promise.all([tick(P, ph.endsAt! + 1), tick(P, ph.endsAt! + 1), tick(P, ph.endsAt! + 1)]);
    expect((await d.query("SELECT COUNT(*)::int n FROM score_ledger"))[0].n).toBe(1);
    void submitAnswer;
  });
});
