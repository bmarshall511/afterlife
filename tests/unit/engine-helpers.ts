process.env.PGLITE_MEMORY = "1";
import { getDb, type Db } from "@/server/db";
import { setEngineDeps } from "@/server/engine/deps";
import { fixtureContent } from "@/server/engine/fixtures";
import { resetParty, startParty } from "@/server/engine/control";
import { join, submitAnswer, tick } from "@/server/engine";
import { loadParty } from "@/server/engine/store";
import type { ContentSource, TributeSource } from "@/server/engine/types";

export const P = "demo";
export const TEST_SETTINGS = {
  introMs: 15000, calaveraWriteMs: 75000, calaveraVoteMs: 30000, lineAnswerMs: 45000, loteriaAnswerMs: 40000,
  roomAnswerMs: 20000, roomGuessMs: 25000, closestAnswerMs: 40000, caseClueMs: 20000, caseAnswerMs: 40000,
  revealMs: 10000, calaveraRevealMs: 15000, resultsMs: 30000, intervalMs: 120000, minViewMs: 4000,
  catchUpGraceMs: 45000, intervalTributeMs: 70000, tributeDwellMinMs: 20000, tributeDwellMaxMs: 35000,
  families: ["calavera", "line", "loteria", "room", "closest", "case"],
};
export const T0 = Date.UTC(2026, 10, 1, 18, 0, 0);

export async function setup(opts: { content?: ContentSource; tributes?: TributeSource; album?: import("@/server/engine/deps").AlbumSource } = {}): Promise<Db> {
  const d = await getDb();
  setEngineDeps({ content: opts.content ?? fixtureContent(10), tributes: opts.tributes ?? { nextTribute: async () => null, isTributeVisible: async () => false }, album: opts.album ?? { nextAlbumSlide: async () => null, isAlbumPhotoVisible: async () => false } });
  await resetParty("demo", "test", {}, T0);
  await resetParty("live", "test", { confirm: true }, T0);
  // Engine tests are written against these fixed timings and the full game list, independent of party defaults.
  await d.query("UPDATE party SET settings=$1", [JSON.stringify(TEST_SETTINGS)]);
  await d.query("DELETE FROM rate_limit");
  await d.query("DELETE FROM audit");
  await d.query("DELETE FROM content_override");
  return d;
}

export async function phase(d: Db) {
  return (await loadParty(d, P, false)).phase;
}

export async function newTeam(name: string, now = T0) {
  const r = await join(P, { name }, now);
  return { secret: r.secret, memberId: r.me.member.id, teamId: r.me.team.id, invite: r.me.team.inviteCode };
}

/** Tick every `step` ms from `from` until predicate true or `to` reached; returns the time reached. */
export async function runUntil(d: Db, from: number, pred: (ph: any) => boolean, step = 1000, max = 2 * 3600_000, presence: string[] | "all" = "all"): Promise<number> {
  let t = from;
  for (; t <= from + max; t += step) {
    const iso = new Date(t).toISOString();
    if (presence === "all") await d.query("UPDATE member SET last_seen=$1 WHERE party_id=$2", [iso, P]);
    else if (presence.length) await d.query("UPDATE member SET last_seen=$1 WHERE id = ANY($2::uuid[])", [iso, presence]);
    await tick(P, t);
    if (pred(await phase(d))) return t;
  }
  throw new Error("runUntil: condition never met");
}

export async function itemOf(d: Db, qid: string): Promise<any> {
  return (await d.query("SELECT private FROM question WHERE id=$1", [qid]))[0].private.item;
}
export async function correctOf(d: Db, qid: string): Promise<any> {
  return (await itemOf(d, qid)).answer;
}

/** Restrict scheduling (first set picks from these families). */
export async function families(d: Db, fams: string[]) {
  await d.query(`UPDATE party SET settings = settings || $2::jsonb WHERE id=$1`, [P, JSON.stringify({ families: fams })]);
}

/** A right / wrong value for the current objective question (loteria/line/closest). */
export async function valueFor(d: Db, correct: boolean): Promise<unknown> {
  const ph = await phase(d);
  const it = await itemOf(d, ph.questionId!);
  switch (it.family) {
    case "loteria": return correct ? it.answer : (it.answer + 1) % it.data.cards.length;
    case "line": return correct ? it.answer : [...it.answer].reverse();
    case "closest": return correct ? it.answer : it.answer + 1;
    default: throw new Error("valueFor: unsupported family " + it.family);
  }
}

export async function answer(d: Db, memberId: string, correct: boolean, now: number, requestId = Math.random().toString(36)) {
  const ph = await phase(d);
  return submitAnswer(P, memberId, { questionId: ph.questionId, stage: ph.stage, value: await valueFor(d, correct), requestId }, now);
}

export async function submit(d: Db, memberId: string, value: unknown, now: number, requestId = Math.random().toString(36)) {
  const ph = await phase(d);
  return submitAnswer(P, memberId, { questionId: ph.questionId, stage: ph.stage, value, requestId }, now);
}

/** Start the party and get into the first open question with a submittable stage. */
export async function startAndOpen(d: Db, t = T0, fams: string[] = ["loteria"]): Promise<number> {
  await families(d, fams);
  await startParty(P, "test", t);
  return runUntil(d, t, (ph) => ph.kind === "question" && ph.stage !== "clue");
}

export { join, submitAnswer, tick };
