import { describe, expect, it, beforeEach } from "vitest";
import type { Db } from "@/server/db";
import { buildMe, buildSnapshot } from "@/server/engine";
import { memberForSecret } from "@/server/session";
import { P, T0, answer, newTeam, phase, runUntil, setup, startAndOpen, submitAnswer, tick } from "./engine-helpers";

let d: Db;
beforeEach(async () => {
  d = await setup();
});

describe("vertical slice", () => {
  it("join → state → answer → reveal scores once → refresh restores", async () => {
    const a = await newTeam("Ana");
    expect(a.invite).toMatch(/^[A-Z2-9]{6}$/);
    // second member joins by invite code, is not captain
    const { join } = await import("@/server/engine");
    const b = await join(P, { name: "Beto", inviteCode: a.invite.toLowerCase() }, T0);
    expect(b.me.team.id).toBe(a.teamId);
    expect(b.me.member.isCaptain).toBe(false);
    expect(b.me.team.memberCount).toBe(2);
    // session resolves from cookie secret
    expect((await memberForSecret(d, P, a.secret))?.memberId).toBe(a.memberId);
    expect(await memberForSecret(d, P, "bogus-secret-bogus-secret")).toBeNull();

    const t = await startAndOpen(d);
    const ph = await phase(d);
    const snap = await buildSnapshot(d, P, t, "phone");
    expect(snap.phase.kind).toBe("question");
    expect(snap.question?.id).toBe(ph.questionId);
    expect(snap.reveal).toBeNull();
    expect(snap.eligibleCount).toBe(1);
    expect(JSON.stringify(snap)).not.toMatch(/"(answer|private)":/);
    expect(JSON.stringify(snap)).not.toContain("SECRET");

    // non-captain cannot submit
    await expect(answer(d, b.me.member.id, true, t + 500)).rejects.toMatchObject({ code: "not_captain" });
    const meB = await buildMe(d, P, b.me.member.id, t + 500);
    expect(meB.current.reasonCannot).toBe("not_captain");

    const r1 = await answer(d, a.memberId, true, t + 1000, "req-1");
    expect(r1.ok).toBe(true);
    // retry same requestId → ok; different choice → already
    const r2 = await submitAnswer(P, a.memberId, { questionId: ph.questionId, stage: ph.stage, value: r1.saved.value, requestId: "req-1" }, t + 1200);
    expect(r2.ok).toBe(true);
    await expect(submitAnswer(P, a.memberId, { questionId: ph.questionId, stage: ph.stage, value: ((r1.saved.value as number) + 1) % 9, requestId: "req-2" }, t + 1300)).rejects.toMatchObject({ code: "already" });

    // all eligible answered → early close after minViewMs
    const tr = await runUntil(d, t + 1000, (x) => x.kind === "reveal", 500);
    expect(tr - t).toBeLessThanOrEqual(4500);
    const ledger = await d.query("SELECT points FROM score_ledger WHERE team_id=$1 AND kind='question'", [a.teamId]);
    expect(ledger.map((x) => x.points)).toEqual([100]);
    // repeated ticks don't double score
    await tick(P, tr + 100);
    await tick(P, tr + 200);
    expect((await d.query("SELECT COUNT(*)::int n FROM score_ledger")) [0].n).toBe(1);
    const snapR = await buildSnapshot(d, P, tr, "tv");
    expect(snapR.reveal?.correct).toBe(r1.saved.value);
    expect(snapR.reveal?.outcomes).toEqual([{ teamId: a.teamId, name: "Ana's Family", points: 100, value: r1.saved.value }]);

    // refresh: buildMe again restores saved answer and result
    const me = await buildMe(d, P, a.memberId, tr + 300);
    expect(me.current.saved).toEqual({ stage: "answer", value: r1.saved.value });
    expect(me.current.result).toEqual({ points: 100, max: 100 });

    // stale control after deadline → closed
    await expect(submitAnswer(P, a.memberId, { questionId: ph.questionId, stage: "answer", value: ((r1.saved.value as number) + 1) % 9, requestId: "late" }, tr + 400)).rejects.toMatchObject({ code: "already" });
  });

  it("version-based 204: tick reports unchanged version when nothing due", async () => {
    await newTeam("Solo");
    const t = await startAndOpen(d);
    const v1 = (await tick(P, t + 10)).version;
    const r = await tick(P, t + 20);
    expect(r.changed).toBe(false);
    expect(r.version).toBe(v1);
  });

  it("completes a full set with results and standings", async () => {
    const a = await newTeam("Ana");
    let t = await startAndOpen(d);
    for (let i = 0; i < 3; i++) {
      t = await runUntil(d, t, (x) => x.kind === "question" && x.qIndex === i);
      await answer(d, a.memberId, i !== 1, t + 100);
      t = await runUntil(d, t + 100, (x) => x.kind === "reveal" && x.qIndex === i);
    }
    t = await runUntil(d, t, (x) => x.kind === "results");
    const snap = await buildSnapshot(d, P, t);
    expect(snap.lastSet?.scores[0]).toMatchObject({ teamId: a.teamId, score: 200, ranked: true, perfect: false });
    expect(snap.lastSet?.winners).toEqual([a.teamId]);
    expect(snap.standings[0]).toMatchObject({ teamId: a.teamId, total: 200, setsCounted: 1, qualified: false, rank: null });
    expect(snap.backdrop).toBe("magenta");
    t = await runUntil(d, t, (x) => x.kind === "interval");
    t = await runUntil(d, t, (x) => x.kind === "intro");
    expect((await phase(d)).setSeq).toBe(2);
  });
});
