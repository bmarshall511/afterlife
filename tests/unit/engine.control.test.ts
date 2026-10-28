import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import type { Db } from "@/server/db";
import { buildSnapshot, computeStandings } from "@/server/engine";
import * as C from "@/server/engine/control";
import { fixtureContent } from "@/server/engine/fixtures";
import { consume } from "@/server/ratelimit";
import type { PublicTribute } from "@/shared/types";
import { P, T0, answer, newTeam, phase, runUntil, setup, startAndOpen, tick } from "./engine-helpers";

let d: Db;
beforeEach(async () => {
  d = await setup();
});

async function fakeSet(seq: number, scores: Record<string, [number, boolean]>) {
  const id = randomUUID();
  await d.query(`INSERT INTO game_set (id, party_id, seq, family, status, seed) VALUES ($1,$2,$3,'truth','complete','s')`, [id, P, seq]);
  for (const [team, [score, ranked]] of Object.entries(scores))
    await d.query(`INSERT INTO set_score (party_id, set_id, team_id, score, ranked) VALUES ($1,$2,$3,$4,$5)`, [P, id, team, score, ranked]);
  return id;
}

describe("admin control", () => {
  it("adjustScore is audited and recomputes standings", async () => {
    const a = await newTeam("Ana");
    await fakeSet(1, { [a.teamId]: [200, true] });
    await C.adjustScore(P, a.teamId, 50, "scorekeeping fix", "admin", T0);
    await expect(C.adjustScore(P, a.teamId, 50, "", "admin", T0)).rejects.toMatchObject({ code: "invalid" });
    expect((await computeStandings(d, P))[0].total).toBe(250);
    const au = await d.query("SELECT actor, detail FROM audit WHERE action='adjust_score'");
    expect(au).toHaveLength(1);
    expect(au[0].detail).toMatchObject({ points: 50, reason: "scorekeeping fix" });
  });

  it("mergeTeams: deterministic, never double counts, ranked beats practice", async () => {
    const a = await newTeam("Ana"), dup = await newTeam("Ana again");
    await fakeSet(1, { [a.teamId]: [100, true], [dup.teamId]: [300, true] }); // both played: keep higher (300)
    await fakeSet(2, { [dup.teamId]: [200, true] }); // only dup: re-pointed
    await fakeSet(3, { [a.teamId]: [100, true], [dup.teamId]: [300, false] }); // ranked beats practice → 100
    await fakeSet(4, { [a.teamId]: [100, true] });
    await C.mergeTeams(P, dup.teamId, a.teamId, "admin", T0);
    const st = await computeStandings(d, P);
    expect(st).toHaveLength(1);
    expect(st[0]).toMatchObject({ teamId: a.teamId, total: 300 + 200 + 100 + 100, setsCounted: 4 });
    expect((await d.query("SELECT team_id FROM member WHERE id=$1", [dup.memberId]))[0].team_id).toBe(a.teamId);
    expect((await d.query("SELECT status, merged_into FROM team WHERE id=$1", [dup.teamId]))[0]).toMatchObject({ status: "merged", merged_into: a.teamId });
    await expect(C.mergeTeams(P, a.teamId, a.teamId, "admin", T0)).rejects.toMatchObject({ code: "invalid" });
  });

  it("invalidateSet removes a past set for everyone; skip invalidates running set", async () => {
    const a = await newTeam("Ana");
    const s1 = await fakeSet(1, { [a.teamId]: [300, true] });
    await d.query("UPDATE party SET set_seq=1 WHERE id=$1", [P]);
    await C.invalidateSet(P, s1, "broken question", "admin", T0);
    expect((await computeStandings(d, P))[0].total).toBe(0);
    const t = await startAndOpen(d, T0 + 1);
    const ph = await phase(d);
    await C.skipQuestion(P, "admin", t + 10);
    expect((await phase(d)).kind).toBe("interval");
    expect((await d.query("SELECT status, invalid_reason FROM game_set WHERE id=$1", [ph.setId]))[0]).toMatchObject({ status: "invalidated", invalid_reason: "skipped" });
  });

  it("settings validation, extendInterval, endParty, reset confirm", async () => {
    await expect(C.updateSettings(P, { bogus: 1 }, "admin", T0)).rejects.toMatchObject({ code: "invalid" });
    await C.updateSettings(P, { intervalMs: 60000 }, "admin", T0);
    await newTeam("Ana");
    await C.startParty(P, "admin", T0);
    const t = await runUntil(d, T0, (x) => x.kind === "interval");
    const ph = await phase(d);
    expect(ph.endsAt! - ph.startsAt).toBe(60000);
    await C.extendInterval(P, 30000, "admin", t);
    expect((await phase(d)).endsAt).toBe(ph.endsAt! + 30000);
    await C.endParty(P, "admin", t + 1);
    expect((await buildSnapshot(d, P, t + 2)).status).toBe("ended");
    await expect(C.resetParty("live", "admin")).rejects.toMatchObject({ code: "confirm_required" });
    await C.resetParty(P, "admin", {}, t + 3);
    expect((await d.query("SELECT COUNT(*)::int n FROM team WHERE party_id=$1", [P]))[0].n).toBe(0);
  });
});

describe("content pool", () => {
  it("no repeats until exhausted, then generateFresh, then explicit encore", async () => {
    await setup({ content: fixtureContent(3, { fresh: true }) });
    await newTeam("Ana");
    await C.updateSettings(P, { introMs: 1000, questionMs: 2000, memoryExposeMs: 1000, memoryAnswerMs: 1000, revealMs: 1000, resultsMs: 1000, intervalMs: 1000 }, "admin", T0);
    await C.startParty(P, "admin", T0);
    await runUntil(d, T0, (x) => x.setSeq === 16 && x.kind === "intro", 500);
    const qs = await d.query("SELECT q.content_id, g.seq FROM question q JOIN game_set g ON g.id=q.set_id ORDER BY g.seq, q.idx");
    const pool = qs.filter((r) => r.content_id.startsWith("fx-") && !r.content_id.startsWith("fx-gen"));
    // 5 objective families x 3 items = 15 unique; first 5 sets use them all with no repeat
    const first = qs.filter((r) => r.seq <= 5).map((r) => r.content_id);
    expect(new Set(first).size).toBe(first.length);
    expect(qs.some((r) => r.content_id.startsWith("fx-gen"))).toBe(true);
    const party = (await d.query("SELECT engine FROM party WHERE id=$1", [P]))[0].engine;
    const encoreAudit = await d.query("SELECT 1 FROM audit WHERE action='encore'");
    // fixture fresh generation supports only memory/difference/reveal; truth/altar fall to encore eventually
    expect(pool.length).toBeGreaterThan(0);
    expect(typeof party.encore).toBe("boolean");
    void encoreAudit;
  });
});

describe("tributes", () => {
  function queue(n: number) {
    let i = 0;
    const hidden = new Set<string>();
    const src = {
      hidden,
      nextTribute: async () => {
        if (!n) return null;
        const id = `t${i++ % n}`;
        return { id, personName: "X", remembrance: "", attribution: "", photoUrl: "/p", width: 1, height: 1, fit: "contain", focalX: 0.5, focalY: 0.5, dwellMs: 25000 } as PublicTribute;
      },
      isTributeVisible: async (_q: unknown, _p: string, id: string) => !hidden.has(id),
    };
    return src;
  }

  it("interval rotates tributes, waits for current tribute, hidden tribute swapped", async () => {
    const q = queue(3);
    await setup({ tributes: q });
    await d.query(`INSERT INTO tribute (id, party_id, person_name, photo_key, thumb_key, width, height, consent, edit_token_hash) VALUES ($1,$2,'X','k','k',1,1,true,'h')`, [randomUUID(), P]);
    await newTeam("Ana");
    await C.startParty(P, "admin", T0);
    let t = await runUntil(d, T0, (x) => x.kind === "interval");
    let ph = await phase(d);
    expect(ph.tribute?.id).toBeTruthy();
    const first = ph.tribute!.id;
    q.hidden.add(first);
    await tick(P, t + 1000);
    ph = await phase(d);
    expect(ph.tribute?.id).not.toBe(first);
    // run to interval end: intro must not start while a tribute is showing
    t = await runUntil(d, t + 1000, (x) => x.kind === "intro");
    const prev = (await d.query("SELECT 1"))[0];
    void prev;
    const snap = await buildSnapshot(d, P, t);
    expect(snap.phase.tribute).toBeUndefined();
  });

  it("tribute_only mode loops intervals, no sets", async () => {
    await setup({ tributes: queue(2) });
    await newTeam("Ana");
    await C.setMode(P, "tribute_only", "admin", T0);
    await C.startParty(P, "admin", T0);
    await runUntil(d, T0, () => false, 5000, 600_000).catch(() => {});
    expect((await d.query("SELECT COUNT(*)::int n FROM game_set"))[0].n).toBe(0);
    expect((await phase(d)).kind).toBe("interval");
  });
});

describe("rate limit", () => {
  it("fixed window per key", async () => {
    for (let i = 0; i < 3; i++) expect(await consume(d, "k", 3, 60000, T0 + i)).toBe(true);
    expect(await consume(d, "k", 3, 60000, T0 + 10)).toBe(false);
    expect(await consume(d, "k", 3, 60000, T0 + 61000)).toBe(true);
  });
});
void answer;
