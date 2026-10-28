process.env.PGLITE_MEMORY = "1";
import { getDb, type Db } from "@/server/db";
import { setEngineDeps } from "@/server/engine/deps";
import { fixtureContent } from "@/server/engine/fixtures";
import { resetParty, startParty } from "@/server/engine/control";
import { join, submitAnswer, tick } from "@/server/engine";
import { loadParty } from "@/server/engine/store";
import type { ContentSource, TributeSource } from "@/server/engine/types";

export const P = "demo";
export const T0 = Date.UTC(2026, 10, 1, 18, 0, 0);

export async function setup(opts: { content?: ContentSource; tributes?: TributeSource } = {}): Promise<Db> {
  const d = await getDb();
  setEngineDeps({ content: opts.content ?? fixtureContent(10), tributes: opts.tributes ?? { nextTribute: async () => null, isTributeVisible: async () => false } });
  await resetParty("demo", "test", {}, T0);
  await resetParty("live", "test", { confirm: true }, T0);
  await d.query("UPDATE party SET settings='{}'");
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

export async function correctOf(d: Db, qid: string): Promise<number> {
  return (await d.query("SELECT private FROM question WHERE id=$1", [qid]))[0].private.answer;
}

export async function answer(d: Db, memberId: string, correct: boolean, now: number, requestId = Math.random().toString(36)) {
  const ph = await phase(d);
  const c = await correctOf(d, ph.questionId!);
  const nOpts = (await d.query("SELECT public FROM question WHERE id=$1", [ph.questionId]))[0].public.options.length;
  return submitAnswer(P, memberId, { questionId: ph.questionId, stage: ph.stage, choice: correct ? c : (c + 1) % nOpts, requestId }, now);
}

/** Start the party and get into the first open question (answer stage). */
export async function startAndOpen(d: Db, t = T0): Promise<number> {
  await startParty(P, "test", t);
  return runUntil(d, t, (ph) => ph.kind === "question" && (ph.stage === "answer" || ph.stage === "prefer"));
}

export { join, submitAnswer, tick };
