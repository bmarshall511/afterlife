import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import type { Db } from "@/server/db";
import { buildMe, buildSnapshot, computeStandings, teamAction } from "@/server/engine";
import { pauseParty, resumeParty, startParty, setCaptain } from "@/server/engine/control";
import { fixtureContent } from "@/server/engine/fixtures";
import { P, T0, answer, newTeam, phase, runUntil, setup, startAndOpen, submitAnswer, tick } from "./engine-helpers";

let d: Db;
beforeEach(async () => {
  d = await setup();
});

async function fakeSet(seq: number, scores: Record<string, number>, opts: { status?: string; ranked?: boolean } = {}) {
  const id = randomUUID();
  await d.query(`INSERT INTO game_set (id, party_id, seq, family, status, seed) VALUES ($1,$2,$3,'truth',$4,'s')`, [id, P, seq, opts.status ?? "complete"]);
  for (const [team, score] of Object.entries(scores))
    await d.query(`INSERT INTO set_score (party_id, set_id, team_id, score, ranked, perfect) VALUES ($1,$2,$3,$4,$5,$6)`, [P, id, team, score, opts.ranked ?? true, score === 300]);
  return id;
}

describe("standings", () => {
  it("best five, competition ranks, provisional, invalidation", async () => {
    const a = await newTeam("Ana"), b = await newTeam("Beto"), c = await newTeam("Cata"), e = await newTeam("Eli");
    const seqScores = [
      { [a.teamId]: 300, [b.teamId]: 200, [c.teamId]: 300, [e.teamId]: 100 },
      { [a.teamId]: 0, [b.teamId]: 300, [c.teamId]: 200 },
      { [a.teamId]: 200, [b.teamId]: 100, [c.teamId]: 100 },
      { [a.teamId]: 100, [b.teamId]: 200, [c.teamId]: 200 },
      { [a.teamId]: 200, [b.teamId]: 100, [c.teamId]: 0 },
      { [a.teamId]: 100, [b.teamId]: 0, [c.teamId]: 100 },
    ];
    const ids: string[] = [];
    for (let i = 0; i < seqScores.length; i++) ids.push(await fakeSet(i + 1, seqScores[i]));
    // practice and invalidated sets never count
    await fakeSet(50, { [e.teamId]: 300 }, { ranked: false });
    await fakeSet(51, { [e.teamId]: 300 }, { status: "invalidated" });
    let st = await computeStandings(d, P);
    const by = (id: string) => st.find((r) => r.teamId === id)!;
    // a: best five of 300,0,200,100,200,100 = 900 ; b: 200,300,100,200,100,0 → 900 ; c: 300,200,100,200,0,100 → 900
    expect(by(a.teamId)).toMatchObject({ total: 900, setsCounted: 5, qualified: true, rank: 1 });
    expect(by(b.teamId).rank).toBe(1);
    expect(by(c.teamId).rank).toBe(1);
    expect(by(e.teamId)).toMatchObject({ total: 100, setsCounted: 1, qualified: false, rank: null });
    expect(st.slice(0, 3).map((r) => r.name)).toEqual(["Ana's Family", "Beto's Family", "Cata's Family"]);
    // invalidate set 1 for everyone: a drops to 600 (0 no longer needed? 200+100+200+100+0)
    await d.query(`UPDATE game_set SET status='invalidated' WHERE id=$1`, [ids[0]]);
    st = await computeStandings(d, P);
    expect(by(a.teamId)).toMatchObject({ total: 600, qualified: true });
    expect(by(b.teamId)).toMatchObject({ total: 700, rank: 1 });
    expect(by(c.teamId)).toMatchObject({ total: 600, rank: 2 });
    expect(by(a.teamId).rank).toBe(2);
    // MeView history marks counted sets
    const me = await buildMe(d, P, a.memberId, T0);
    expect(me.history.filter((h) => h.counted)).toHaveLength(5);
    expect(me.history.find((h) => h.setId === ids[0])?.invalidated).toBe(true);
  });
});

describe("answers", () => {
  it("duplicate/concurrent submits store one answer and score once", async () => {
    const a = await newTeam("Ana");
    const t = await startAndOpen(d);
    const res = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => answer(d, a.memberId, true, t + 100 + i, "same")));
    expect(res.every((r) => r.status === "fulfilled")).toBe(true);
    expect((await d.query("SELECT COUNT(*)::int n FROM answer"))[0].n).toBe(1);
  });

  it("two concurrent tick callers produce one transition", async () => {
    await newTeam("Ana");
    await startParty(P, "test", T0);
    await tick(P, T0);
    const ph = await phase(d);
    expect(ph.kind).toBe("intro");
    const [r1, r2] = await Promise.all([tick(P, ph.endsAt! + 1), tick(P, ph.endsAt! + 1)]);
    expect([r1.changed, r2.changed].filter(Boolean)).toHaveLength(1);
    expect(r1.version).toBe(r2.version);
    expect((await d.query("SELECT COUNT(*)::int n FROM game_set"))[0].n).toBe(1);
    expect((await d.query("SELECT COUNT(*)::int n FROM question WHERE opened_at IS NOT NULL"))[0].n).toBe(1);
  });

  it("client time is ignored; server deadline rules", async () => {
    const a = await newTeam("Ana");
    const t = await startAndOpen(d);
    const ph = await phase(d);
    const input = { questionId: ph.questionId, stage: ph.stage, choice: 0, requestId: "x", clientNow: t, endsAt: t + 999999 } as any;
    await expect(submitAnswer(P, a.memberId, { ...input, questionId: randomUUID() }, t + 1)).rejects.toMatchObject({ code: "closed" });
    await expect(submitAnswer(P, a.memberId, { ...input, choice: 9 }, t + 1)).rejects.toMatchObject({ code: "invalid" });
    await expect(submitAnswer(P, a.memberId, input, ph.endsAt! + 1)).rejects.toMatchObject({ code: "closed" });
  });

  it("captain handoff revokes old captain immediately", async () => {
    const a = await newTeam("Ana");
    const { join } = await import("@/server/engine");
    const b = (await join(P, { name: "Beto", inviteCode: a.invite }, T0)).me.member.id;
    const t = await startAndOpen(d);
    await expect(teamAction(P, b, { action: "claim_captain" }, t)).rejects.toMatchObject({ code: "invalid" });
    const me = await teamAction(P, b, { action: "claim_captain", confirm: true }, t);
    expect(me.member.isCaptain).toBe(true);
    await expect(answer(d, a.memberId, true, t + 100)).rejects.toMatchObject({ code: "not_captain" });
    expect((await answer(d, b, true, t + 200)).ok).toBe(true);
    // admin recovery back to Ana
    await setCaptain(P, a.teamId, a.memberId, "admin", t + 300);
    expect((await buildMe(d, P, b, t + 300)).member.isCaptain).toBe(false);
    expect((await d.query("SELECT COUNT(*)::int n FROM audit WHERE action IN ('claim_captain','set_captain')"))[0].n).toBe(2);
  });
});

describe("participation", () => {
  it("late join: practice for current set, answers from next question, ranked next set", async () => {
    const a = await newTeam("Ana");
    let t = await startAndOpen(d);
    const late = await newTeam("Late", t + 2000);
    await expect(answer(d, late.memberId, true, t + 2500)).rejects.toMatchObject({ code: "late_join" });
    expect((await buildMe(d, P, late.memberId, t + 2500)).current).toMatchObject({ reasonCannot: "late_join", ranked: false });
    await answer(d, a.memberId, true, t + 2600);
    t = await runUntil(d, t + 2600, (x) => x.kind === "question" && x.qIndex === 1 && x.stage !== "expose");
    expect((await answer(d, late.memberId, true, t + 100)).ok).toBe(true);
    t = await runUntil(d, t, (x) => x.kind === "results");
    const snap = await buildSnapshot(d, P, t);
    expect(snap.lastSet?.scores.find((s) => s.teamId === late.teamId)).toMatchObject({ score: 100, ranked: false });
    expect(snap.standings.find((s) => s.teamId === late.teamId)?.total).toBe(0);
    t = await runUntil(d, t, (x) => x.kind === "question" && x.setSeq === 2);
    expect((await buildMe(d, P, late.memberId, t)).current.ranked).toBe(true);
  });

  it("away teams are excluded from next cohort; mid-set away keeps current set", async () => {
    const a = await newTeam("Ana"), b = await newTeam("Beto");
    let t = await startAndOpen(d);
    await answer(d, b.memberId, true, t + 100);
    await teamAction(P, b.memberId, { action: "away" }, t + 200);
    await expect(answer(d, b.memberId, false, t + 300)).rejects.toMatchObject({ code: "already" });
    t = await runUntil(d, t, (x) => x.kind === "question" && x.qIndex === 1 && x.stage !== "expose");
    await expect(answer(d, b.memberId, true, t + 100)).rejects.toMatchObject({ code: "away" });
    t = await runUntil(d, t, (x) => x.kind === "results");
    const snap = await buildSnapshot(d, P, t);
    expect(snap.lastSet?.scores.find((s) => s.teamId === b.teamId)).toMatchObject({ score: 100, ranked: true });
    t = await runUntil(d, t, (x) => x.kind === "intro");
    const cohort = (await d.query("SELECT cohort FROM game_set WHERE seq=2"))[0].cohort;
    expect(cohort).toEqual([a.teamId]);
    await teamAction(P, b.memberId, { action: "resume" }, t);
  });

  it("disconnected cohort team is not eligible (no ranked set), zero teams → ambient", async () => {
    const a = await newTeam("Ana"), ghost = await newTeam("Ghost");
    await d.query("UPDATE member SET last_seen=$1 WHERE id=$2", [new Date(T0 - 3600_000).toISOString(), ghost.memberId]);
    await startParty(P, "test", T0 + 1);
    await runUntil(d, T0 + 1, (x) => x.kind === "question", 1000, 3600_000, [a.memberId]);
    expect((await d.query("SELECT eligible FROM game_set"))[0].eligible).toEqual([a.teamId]);
    // everyone leaves → after this set, ambient (no empty scored sets)
    await d.query("UPDATE team SET status='away'");
    const t = await runUntil(d, T0, (x) => x.kind === "ambient", 2000, 3600_000, []);
    await tick(P, t + 600_000);
    expect((await phase(d)).kind).toBe("ambient");
    expect((await d.query("SELECT COUNT(*)::int n FROM game_set"))[0].n).toBe(1);
  });

  it("1–2 teams: objective families only, never the same family twice in a row", async () => {
    await newTeam("Ana");
    await newTeam("Beto");
    await startParty(P, "test", T0);
    await runUntil(d, T0, (x) => x.kind === "intro" && x.setSeq === 8, 2000);
    const fams = (await d.query("SELECT family FROM game_set ORDER BY seq")).map((r) => r.family);
    expect(fams).not.toContain("family");
    for (let i = 1; i < fams.length; i++) expect(fams[i]).not.toBe(fams[i - 1]);
  });
});

describe("family set", () => {
  async function familySetup(n: number) {
    const teams = [];
    for (let i = 0; i < n; i++) teams.push(await newTeam(`T${i}`));
    await d.query(`UPDATE party SET engine='{"objectiveSinceSocial":4,"lastFamily":"truth"}' WHERE id=$1`, [P]);
    await startParty(P, "test", T0);
    const t = await runUntil(d, T0, (x) => x.kind === "question");
    expect((await phase(d)).family).toBe("family");
    return { teams, t };
  }
  const sub = (m: string, stage: string, choice: number, now: number) =>
    phase(d).then((ph) => submitAnswer(P, m, { questionId: ph.questionId, stage, choice, requestId: `${m}${stage}${now}` }, now));

  it("tie → any tied option scores; prediction requires preference; <3 prefs void; normalization", async () => {
    const { teams, t: t0 } = await familySetup(4);
    let t = t0;
    // Q0: prefs 0,0,1,1 → tie between 0 and 1
    for (let i = 0; i < 4; i++) await sub(teams[i].memberId, "prefer", i < 2 ? 0 : 1, t + 100);
    t = await runUntil(d, t, (x) => x.stage === "predict");
    const snapP = await buildSnapshot(d, P, t);
    expect(snapP.reveal).toBeNull();
    await sub(teams[0].memberId, "predict", 0, t + 100);
    await sub(teams[1].memberId, "predict", 1, t + 100);
    await sub(teams[2].memberId, "predict", 2, t + 100);
    t = await runUntil(d, t, (x) => x.kind === "reveal");
    const r0 = await buildSnapshot(d, P, t);
    expect(r0.reveal?.tallies?.prefer).toEqual([2, 2, 0, 0]);
    expect(r0.reveal?.correct).toEqual([0, 1]);
    // Q1: only 2 preferences → void; predict stage skipped
    t = await runUntil(d, t, (x) => x.kind === "question" && x.qIndex === 1);
    await sub(teams[0].memberId, "prefer", 2, t + 100);
    await sub(teams[1].memberId, "prefer", 2, t + 100);
    t = await runUntil(d, t, (x) => x.kind === "reveal" && x.qIndex === 1);
    const r1 = await buildSnapshot(d, P, t);
    expect(r1.reveal).toMatchObject({ void: true, correct: null });
    // Q2: team3 tries to predict without preference
    t = await runUntil(d, t, (x) => x.kind === "question" && x.qIndex === 2);
    for (let i = 0; i < 3; i++) await sub(teams[i].memberId, "prefer", 3, t + 100);
    t = await runUntil(d, t, (x) => x.stage === "predict");
    await expect(sub(teams[3].memberId, "predict", 3, t + 100)).rejects.toMatchObject({ code: "need_preference" });
    await sub(teams[0].memberId, "predict", 3, t + 100);
    t = await runUntil(d, t, (x) => x.kind === "results");
    const res = (await buildSnapshot(d, P, t)).lastSet!;
    const sc = (i: number) => res.scores.find((s) => s.teamId === teams[i].teamId)?.score;
    // team0: 100 + 100 over 2 nonvoid → 300 ; team1: 100 → 150 ; team2: 0 ; team3: 0
    expect([sc(0), sc(1), sc(2), sc(3)]).toEqual([300, 150, 0, 0]);
    const me = await buildMe(d, P, teams[1].memberId, t);
    expect(me.history[0]).toMatchObject({ normalized: true, score: 150 });
  });

  it("<2 nonvoid questions invalidates the set and forces an objective set next", async () => {
    const { t: t0 } = await familySetup(3);
    let t = await runUntil(d, t0, (x) => x.kind === "interval");
    const set = (await d.query("SELECT status, invalid_reason FROM game_set WHERE seq=1"))[0];
    expect(set).toMatchObject({ status: "invalidated", invalid_reason: "family_void" });
    t = await runUntil(d, t, (x) => x.kind === "intro");
    expect((await phase(d)).family).not.toBe("family");
  });

  it("family set with <3 eligible at intro end swaps to objective before questions open", async () => {
    const teams = [];
    for (let i = 0; i < 3; i++) teams.push(await newTeam(`T${i}`));
    await d.query(`UPDATE party SET engine='{"objectiveSinceSocial":4}' WHERE id=$1`, [P]);
    await startParty(P, "test", T0 + 10_000);
    await runUntil(d, T0 + 10_000, (x) => x.kind === "question", 1000, 3600_000, [teams[0].memberId]);
    const ph = await phase(d);
    expect(ph.family).not.toBe("family");
    expect((await d.query("SELECT family FROM game_set"))[0].family).toBe(ph.family);
  });
});

describe("time control", () => {
  it("pause freezes time; resume continues with remaining", async () => {
    const a = await newTeam("Ana");
    const t = await startAndOpen(d);
    const ph = await phase(d);
    const remaining = ph.endsAt! - (t + 5000);
    await pauseParty(P, "admin", t + 5000);
    await tick(P, t + 3600_000);
    expect((await phase(d)).questionId).toBe(ph.questionId);
    expect((await buildSnapshot(d, P, t + 3600_000)).phase.endsAt).toBeNull();
    await expect(answer(d, a.memberId, true, t + 3600_000)).rejects.toMatchObject({ code: "closed" });
    await resumeParty(P, "admin", t + 3600_000);
    const ph2 = await phase(d);
    expect(ph2.endsAt).toBe(t + 3600_000 + remaining);
    expect(ph2.kind).toBe("question");
    expect((await answer(d, a.memberId, true, t + 3600_000 + 100)).ok).toBe(true);
  });

  it("outage catch-up: no replay, running set invalidated, fresh interval", async () => {
    await newTeam("Ana");
    const t = await startAndOpen(d);
    const later = t + 3 * 3600_000;
    await tick(P, later);
    const ph = await phase(d);
    expect(ph).toMatchObject({ kind: "interval", startsAt: later });
    const sets = await d.query("SELECT status, invalid_reason FROM game_set");
    expect(sets).toEqual([{ status: "invalidated", invalid_reason: "outage" }]);
  });

  it("memory: phones never get scene; TV only during expose; answers only in answer stage", async () => {
    await setupMemoryOnly();
    const a = await newTeam("Ana");
    await startParty(P, "test", T0);
    const t = await runUntil(d, T0, (x) => x.stage === "expose");
    expect((await buildSnapshot(d, P, t, "tv")).question?.scene).toBeTruthy();
    expect((await buildSnapshot(d, P, t, "phone")).question?.scene).toBeFalsy();
    const ph = await phase(d);
    await expect(submitAnswer(P, a.memberId, { questionId: ph.questionId, stage: "expose", choice: 0 }, t + 1)).rejects.toMatchObject({ code: "invalid" });
    await expect(submitAnswer(P, a.memberId, { questionId: ph.questionId, stage: "answer", choice: 0 }, t + 1)).rejects.toMatchObject({ code: "closed" });
    const t2 = await runUntil(d, t, (x) => x.stage === "answer");
    expect((await buildSnapshot(d, P, t2, "tv")).question?.scene).toBeFalsy();
  });
});

function setupMemoryOnly() {
  return d.query(`UPDATE party SET settings='{"families":["memory"]}' WHERE id=$1`, [P]);
}
void fixtureContent;
