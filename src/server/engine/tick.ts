import { randomUUID } from "node:crypto";
import type { Q } from "@/server/db";
import type { GameFamily, Stage } from "@/shared/types";
import { content, db, tributes } from "./deps";
import { iso, ms } from "./rng";
import { chooseSet, markExposed } from "./select";
import { settingsOf } from "./settings";
import { asIds, audit, loadParty, saveParty } from "./store";
import type { ContentItem, PartyRow, PhaseState, Settings } from "./types";

/**
 * Lazy idempotent tick. Every GET /api/state, answer submit and /api/tick calls this.
 * All transitions happen inside one transaction holding the party row lock, so concurrent callers
 * produce exactly one transition; the loser re-reads the already-advanced phase and does nothing.
 * `now` is injectable (tests / scripts/simulate.ts); production passes Date.now(). Client time is never used.
 */
export async function tick(partyId: string, now: number = Date.now()): Promise<{ version: number; changed: boolean }> {
  const d = await db();
  const peek = await loadParty(d, partyId, false);
  if (!(await isDue(d, peek, now))) return { version: peek.version, changed: false };
  return d.tx(async (q) => {
    const p = await loadParty(q, partyId, true);
    const changed = await advance(q, p, now);
    if (changed) await saveParty(q, p);
    return { version: p.version, changed };
  });
}

const SET_KINDS = new Set(["intro", "question", "reveal"]);

async function activeTeamIds(q: Q, partyId: string): Promise<string[]> {
  const r = await q.query(`SELECT id FROM team WHERE party_id=$1 AND status='active' ORDER BY created_at, id`, [partyId]);
  return r.map((x) => x.id as string);
}

async function isDue(q: Q, p: PartyRow, now: number): Promise<boolean> {
  if (p.status === "paused") return false;
  const ph = p.phase;
  if (ph.endsAt != null && ph.endsAt <= now) return true;
  if (revealStepDue(ph, now, await content())) return true;
  if (ph.kind === "ambient" || ph.kind === "interval") {
    if (ph.kind === "ambient" && p.status === "running" && p.mode === "normal" && (await activeTeamIds(q, p.id)).length > 0) return true;
    if (ph.tribute && (ph.tributeUntil ?? 0) <= now) return true;
    if (!ph.tribute && (ph.endsAt == null || ph.endsAt - now > settingsOf(p.settings).tributeDwellMinMs)) {
      // a tribute might have become available; cheap check is delegated to the queue owner
      return (await hasTributes(q, p.id));
    }
    if (ph.tribute && !(await (await tributes()).isTributeVisible(q, p.id, ph.tribute.id))) return true;
  }
  return false;
}

async function hasTributes(q: Q, partyId: string) {
  try {
    const r = await q.query(`SELECT 1 FROM tribute WHERE party_id=$1 AND status='published' LIMIT 1`, [partyId]);
    return r.length > 0;
  } catch {
    return false;
  }
}

/** Applies every due transition. Returns true if state changed. Mutates p (caller saves). */
export async function advance(q: Q, p: PartyRow, now: number): Promise<boolean> {
  if (p.status === "paused") return false;
  const s = settingsOf(p.settings);
  let changed = false;
  for (let guard = 0; guard < 64; guard++) {
    const ph = p.phase;
    // Outage catch-up: never replay. Invalidate a running set and start a fresh interval now.
    if (p.status === "running" && ph.endsAt != null && now - ph.endsAt > s.catchUpGraceMs) {
      if (ph.setId && SET_KINDS.has(ph.kind)) await invalidateSetRow(q, p.id, ph.setId, "outage", "engine");
      await audit(q, p.id, "engine", "catch_up", { from: ph.kind, overdueMs: now - ph.endsAt });
      enterInterval(p, s, now);
      changed = true;
      continue;
    }
    if (ph.kind === "ambient") {
      if (p.status === "running" && p.mode === "normal" && (await activeTeamIds(q, p.id)).length > 0) {
        await startSet(q, p, s, now);
        changed = true;
        continue;
      }
      if (p.mode === "tribute_only" && p.status === "running") {
        enterInterval(p, s, now);
        changed = true;
        continue;
      }
      changed = (await rotateTribute(q, p, s, now)) || changed;
      break;
    }
    if (ph.endsAt == null || ph.endsAt > now) {
      const step = revealStepDue(ph, now, await content());
      if (step !== false) {
        ph.revealStep = step;
        changed = true;
      }
      if (ph.kind === "interval") changed = (await rotateTribute(q, p, s, now)) || changed;
      break;
    }
    if (p.status !== "running") {
      // idle/ended parties sit in ambient
      p.phase = { kind: "ambient", startsAt: now, endsAt: null };
      changed = true;
      continue;
    }
    const t = ph.endsAt; // logical transition time keeps cadence exact when ticks are slightly late
    await transition(q, p, s, t);
    changed = true;
  }
  return changed;
}

/** Progressive reveal: the public payload changes at fixed offsets, so bump version (clients refetch). */
function revealStepDue(ph: PhaseState, now: number, c: { revealStageMs?: readonly number[] }): number | false {
  if (ph.kind !== "question" || ph.family !== "reveal" || ph.stage !== "answer") return false;
  const offs = c.revealStageMs ?? [0, 12000, 24000];
  const el = now - (ph.stageStartsAt ?? ph.startsAt);
  let step = 0;
  offs.forEach((o, i) => { if (el >= o) step = i; });
  return step !== (ph.revealStep ?? 0) ? step : false;
}

function enterInterval(p: PartyRow, s: Settings, t: number) {
  const prev = p.phase;
  p.phase = { kind: "interval", startsAt: t, endsAt: t + s.intervalMs, tribute: prev.tribute ?? null, tributeUntil: prev.tributeUntil };
}

async function rotateTribute(q: Q, p: PartyRow, s: Settings, now: number): Promise<boolean> {
  const ph = p.phase;
  const tq = await tributes();
  if (ph.tribute) {
    const visible = (ph.tributeUntil ?? 0) > now && (await tq.isTributeVisible(q, p.id, ph.tribute.id));
    if (visible) return false;
  }
  // don't start a tribute that would hold the interval much past its end
  const room = ph.endsAt == null ? Infinity : ph.endsAt - now;
  let next = null;
  if (room >= s.tributeDwellMinMs) next = await tq.nextTribute(q, p.id, now);
  if (!next && !ph.tribute) return false;
  if (next) {
    const dwell = Math.min(s.tributeDwellMaxMs, Math.max(s.tributeDwellMinMs, next.dwellMs || 25000));
    ph.tribute = { ...next, dwellMs: dwell };
    ph.tributeUntil = now + dwell;
  } else {
    ph.tribute = null;
    ph.tributeUntil = undefined;
  }
  return true;
}

async function transition(q: Q, p: PartyRow, s: Settings, t: number) {
  const ph = p.phase;
  switch (ph.kind) {
    case "intro":
      await endIntro(q, p, s, t);
      return;
    case "question":
      await endStage(q, p, s, t);
      return;
    case "reveal":
      if ((ph.qIndex ?? 0) < 2) await openQuestion(q, p, s, (ph.qIndex ?? 0) + 1, t);
      else {
        const ok = await finalizeSet(q, p, ph.setId!, t);
        if (ok) p.phase = { kind: "results", startsAt: t, endsAt: t + s.resultsMs, setId: ph.setId, setSeq: ph.setSeq, family: ph.family };
        else enterInterval(p, s, t);
      }
      return;
    case "results":
      enterInterval(p, s, t);
      p.phase.tribute = null;
      return;
    case "interval": {
      // Interval end waits for the current tribute to finish.
      if (ph.tribute && (ph.tributeUntil ?? 0) > t) {
        ph.endsAt = ph.tributeUntil!;
        return;
      }
      if (p.mode === "tribute_only") {
        enterInterval(p, s, t);
        return;
      }
      await startSet(q, p, s, t);
      return;
    }
    default:
      p.phase = { kind: "ambient", startsAt: t, endsAt: null };
  }
}

/** intro start: snapshot cohort, choose family & content, create set + 3 pending questions. */
export async function startSet(q: Q, p: PartyRow, s: Settings, t: number) {
  if (p.status !== "running" || p.mode === "tribute_only") {
    p.phase = { kind: p.mode === "tribute_only" && p.status === "running" ? "interval" : "ambient", startsAt: t, endsAt: p.mode === "tribute_only" && p.status === "running" ? t + s.intervalMs : null };
    return;
  }
  const cohort = await activeTeamIds(q, p.id);
  if (cohort.length === 0) {
    p.phase = { kind: "ambient", startsAt: t, endsAt: null };
    return;
  }
  const c = await content();
  const seq = p.set_seq + 1;
  const seed = `${p.rng_seed}:${p.id}:${seq}`;
  const socialDue = (p.engine.objectiveSinceSocial ?? 0) >= s.socialEvery - 1 && !p.engine.forceObjective;
  const pick = await chooseSet(q, p, s, c, { allowFamily: socialDue && cohort.length >= 3, seed });
  if (!pick) {
    await audit(q, p.id, "engine", "no_content", { seq });
    p.phase = { kind: "interval", startsAt: t, endsAt: t + s.intervalMs };
    return;
  }
  const setId = randomUUID();
  await q.query(
    `INSERT INTO game_set (id, party_id, seq, family, status, cohort, eligible, seed, started_at) VALUES ($1,$2,$3,$4,'running',$5,'[]',$6,$7)`,
    [setId, p.id, seq, pick.family, JSON.stringify(cohort), seed, iso(t)],
  );
  await insertQuestions(q, p.id, setId, pick.items, c);
  await markExposed(q, p.id, pick.items.map((i) => i.id), t);
  if (pick.encore && !p.engine.encore) await audit(q, p.id, "engine", "encore", { seq, family: pick.family });
  p.engine.encore = pick.encore;
  p.set_seq = seq;
  p.engine.lastFamily = pick.family;
  p.engine.objectiveSinceSocial = pick.family === "family" ? 0 : (p.engine.objectiveSinceSocial ?? 0) + 1;
  p.engine.forceObjective = false;
  p.phase = { kind: "intro", startsAt: t, endsAt: t + s.introMs, setId, setSeq: seq, family: pick.family };
}

async function insertQuestions(q: Q, partyId: string, setId: string, items: ContentItem[], c: Awaited<ReturnType<typeof content>>) {
  await q.query(`DELETE FROM question WHERE set_id=$1 AND status='pending'`, [setId]);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const { answer, ...rest } = it;
    const pub = c.toPublicRecord ? c.toPublicRecord(it) : rest;
    const reveal = c.revealInfo(it);
    await q.query(
      `INSERT INTO question (id, party_id, set_id, idx, content_id, public, private, status) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')`,
      [randomUUID(), partyId, setId, i, it.id, JSON.stringify(pub), JSON.stringify({ answer, reveal })],
    );
  }
}

/** intro end: eligible = cohort teams still active with a member seen since intro start. */
async function endIntro(q: Q, p: PartyRow, s: Settings, t: number) {
  const ph = p.phase;
  const set = (await q.query(`SELECT cohort, family FROM game_set WHERE id=$1`, [ph.setId]))[0];
  const cohort = asIds(set.cohort);
  const rows = cohort.length
    ? await q.query(
        `SELECT t.id FROM team t WHERE t.party_id=$1 AND t.status='active' AND t.id = ANY($2::uuid[])
           AND EXISTS (SELECT 1 FROM member m WHERE m.team_id=t.id AND m.last_seen >= $3)`,
        [p.id, cohort, iso(ph.startsAt - 2500)], // allow for touch() throttling
      )
    : [];
  const eligible = rows.map((r) => r.id as string);
  await q.query(`UPDATE game_set SET eligible=$2 WHERE id=$1`, [ph.setId, JSON.stringify(eligible)]);
  if (set.family === "family" && eligible.length < 3) {
    // Social set needs >=3 eligible teams: swap to an objective family before any question opens.
    const c = await content();
    const pick = await chooseSet(q, { ...p, engine: { ...p.engine, lastFamily: "family" } }, { ...s, families: s.families.filter((f) => f !== "family") }, c, { allowFamily: false, seed: `${p.rng_seed}:${p.id}:${ph.setSeq}:swap` });
    if (!pick) {
      await invalidateSetRow(q, p.id, ph.setId!, "insufficient_teams", "engine");
      enterInterval(p, s, t);
      return;
    }
    await q.query(`UPDATE game_set SET family=$2 WHERE id=$1`, [ph.setId, pick.family]);
    await insertQuestions(q, p.id, ph.setId!, pick.items, c);
    await markExposed(q, p.id, pick.items.map((i) => i.id), t);
    ph.family = pick.family;
    p.engine.lastFamily = pick.family;
    p.engine.objectiveSinceSocial = (p.engine.objectiveSinceSocial ?? 0) + 1;
  }
  await openQuestion(q, p, s, 0, t);
}

export function firstStage(f: GameFamily): Stage {
  return f === "memory" ? "expose" : f === "family" ? "prefer" : "answer";
}
export function stageMs(s: Settings, f: GameFamily, st: Stage): number {
  if (st === "expose") return s.memoryExposeMs;
  if (st === "prefer") return s.familyPreferMs;
  if (st === "predict") return s.familyPredictMs;
  return f === "memory" ? s.memoryAnswerMs : s.questionMs;
}

async function openQuestion(q: Q, p: PartyRow, s: Settings, idx: number, t: number) {
  const ph = p.phase;
  const row = (await q.query(`SELECT id FROM question WHERE set_id=$1 AND idx=$2`, [ph.setId, idx]))[0];
  await q.query(`UPDATE question SET status='open', opened_at=$2 WHERE id=$1`, [row.id, iso(t)]);
  const f = ph.family!;
  const st = firstStage(f);
  p.phase = { kind: "question", startsAt: t, endsAt: t + stageMs(s, f, st), setId: ph.setId, setSeq: ph.setSeq, family: f, qIndex: idx, stage: st, stageStartsAt: t, questionId: row.id };
}

async function endStage(q: Q, p: PartyRow, s: Settings, t: number) {
  const ph = p.phase;
  const f = ph.family!;
  if (ph.stage === "expose") {
    p.phase = { ...ph, stage: "answer", stageStartsAt: t, endsAt: t + stageMs(s, f, "answer") };
    return;
  }
  if (ph.stage === "prefer") {
    // Freeze the eligible cohort's preferences before prediction opens.
    const set = (await q.query(`SELECT eligible FROM game_set WHERE id=$1`, [ph.setId]))[0];
    const eligible = asIds(set.eligible);
    const prefs = await q.query(`SELECT team_id, choice FROM answer WHERE question_id=$1 AND kind='prefer'`, [ph.questionId]);
    const qrow = (await q.query(`SELECT public, private FROM question WHERE id=$1`, [ph.questionId]))[0];
    const nOpts = (qrow.public.options ?? []).length || 4;
    const tally = Array(nOpts).fill(0);
    for (const r of prefs) if (eligible.includes(r.team_id) && r.choice >= 0 && r.choice < nOpts) tally[r.choice]++;
    const n = tally.reduce((a: number, b: number) => a + b, 0);
    const priv = { ...qrow.private, prefTally: tally, prefCount: n };
    await q.query(`UPDATE question SET private=$2 WHERE id=$1`, [ph.questionId, JSON.stringify(priv)]);
    if (n < 3) {
      await voidQuestion(q, ph.questionId!, n === 0 ? "no_preferences" : "too_few_preferences", t);
      p.phase = { kind: "reveal", startsAt: t, endsAt: t + s.revealMs, setId: ph.setId, setSeq: ph.setSeq, family: f, qIndex: ph.qIndex, questionId: ph.questionId };
      return;
    }
    p.phase = { ...ph, stage: "predict", stageStartsAt: t, endsAt: t + stageMs(s, f, "predict") };
    return;
  }
  await scoreQuestion(q, p.id, ph.setId!, ph.questionId!, t);
  p.phase = { kind: "reveal", startsAt: t, endsAt: t + s.revealMs, setId: ph.setId, setSeq: ph.setSeq, family: f, qIndex: ph.qIndex, questionId: ph.questionId };
}

async function voidQuestion(q: Q, qid: string, reason: string, t: number) {
  await q.query(`UPDATE question SET status='void', void_reason=$2, revealed_at=$3 WHERE id=$1`, [qid, reason, iso(t)]);
}

/** Scoring: exactly once, inside the question→reveal transition. Unique index makes retries harmless. */
export async function scoreQuestion(q: Q, partyId: string, setId: string, qid: string, t: number) {
  const qrow = (await q.query(`SELECT status, private, public FROM question WHERE id=$1`, [qid]))[0];
  if (qrow.status !== "open") return;
  const fam = qrow.public.family as GameFamily;
  const ins = (team: string, pts: number) =>
    q.query(
      `INSERT INTO score_ledger (id, party_id, team_id, set_id, question_id, kind, points) VALUES ($1,$2,$3,$4,$5,'question',$6)
       ON CONFLICT (question_id, team_id) WHERE kind = 'question' DO NOTHING`,
      [randomUUID(), partyId, team, setId, qid, pts],
    );
  if (fam === "family") {
    const tally: number[] = qrow.private.prefTally ?? [];
    const max = Math.max(0, ...tally);
    const top = tally.map((v, i) => (v === max && max > 0 ? i : -1)).filter((i) => i >= 0);
    const preds = await q.query(
      `SELECT a.team_id, a.choice FROM answer a WHERE a.question_id=$1 AND a.kind='predict'
         AND EXISTS (SELECT 1 FROM answer b WHERE b.question_id=a.question_id AND b.team_id=a.team_id AND b.kind='prefer')`,
      [qid],
    );
    const predTally = Array(tally.length).fill(0);
    for (const r of preds) {
      if (r.choice >= 0 && r.choice < predTally.length) predTally[r.choice]++;
      await ins(r.team_id, top.includes(r.choice) ? 100 : 0);
    }
    const priv = { ...qrow.private, predTally, top, reveal: { ...qrow.private.reveal, correct: top } };
    await q.query(`UPDATE question SET private=$2 WHERE id=$1`, [qid, JSON.stringify(priv)]);
  } else {
    const ans = await q.query(`SELECT team_id, choice FROM answer WHERE question_id=$1 AND kind='answer'`, [qid]);
    const correct = qrow.private.answer;
    for (const r of ans) await ins(r.team_id, r.choice === correct ? 100 : 0);
  }
  await q.query(`UPDATE question SET status='revealed', revealed_at=$2 WHERE id=$1`, [qid, iso(t)]);
}

/**
 * Set end: write set_score rows. Participants = eligible teams (ranked; unanswered = 0) plus anyone
 * who answered (practice, ranked=false). Family sets normalize to nonvoid count; <2 nonvoid => invalidated.
 * Returns false if the set ended invalidated (no results screen).
 */
export async function finalizeSet(q: Q, p: PartyRow, setId: string, t: number): Promise<boolean> {
  const set = (await q.query(`SELECT status, family, eligible FROM game_set WHERE id=$1`, [setId]))[0];
  if (!set || set.status !== "running") return false;
  const eligible = asIds(set.eligible);
  const qs = await q.query(`SELECT id, status FROM question WHERE set_id=$1`, [setId]);
  const nonvoid = qs.filter((x) => x.status === "revealed").length;
  const sums = await q.query(`SELECT team_id, SUM(points)::int AS pts FROM score_ledger WHERE set_id=$1 AND kind='question' GROUP BY team_id`, [setId]);
  const answered = await q.query(`SELECT DISTINCT a.team_id FROM answer a JOIN question qq ON qq.id=a.question_id WHERE qq.set_id=$1`, [setId]);
  const teams = new Set<string>([...eligible, ...sums.map((r) => r.team_id), ...answered.map((r) => r.team_id)]);
  const pts = new Map(sums.map((r) => [r.team_id as string, Number(r.pts)]));
  const isFamily = set.family === "family";
  let invalid: string | null = null;
  if (isFamily && nonvoid < 2) invalid = "family_void";
  for (const team of teams) {
    const raw = pts.get(team) ?? 0;
    const score = isFamily ? (nonvoid ? Math.round((raw / nonvoid) * 3) : 0) : raw;
    await q.query(
      `INSERT INTO set_score (party_id, set_id, team_id, score, ranked, normalized, perfect) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [p.id, setId, team, score, eligible.includes(team), isFamily && nonvoid < 3, score === 300],
    );
  }
  if (invalid) {
    await invalidateSetRow(q, p.id, setId, invalid, "engine");
    p.engine.forceObjective = true;
    return false;
  }
  await q.query(`UPDATE game_set SET status='complete', ended_at=$2 WHERE id=$1 AND status='running'`, [setId, iso(t)]);
  return true;
}

export async function invalidateSetRow(q: Q, partyId: string, setId: string, reason: string, actor: string) {
  await q.query(`UPDATE game_set SET status='invalidated', invalid_reason=$3, ended_at=COALESCE(ended_at, now()) WHERE id=$1 AND party_id=$2`, [setId, partyId, reason]);
  await q.query(`UPDATE question SET status='void', void_reason=$2 WHERE set_id=$1 AND status IN ('pending','open')`, [setId, reason]);
  await audit(q, partyId, actor, "set_invalidated", { setId, reason });
}

/** Early close: if every stage-eligible team has submitted, shorten the stage to max(now, stageStart+minViewMs). */
export async function maybeEarlyClose(q: Q, p: PartyRow, now: number): Promise<boolean> {
  const ph = p.phase;
  if (ph.kind !== "question" || !ph.stage || ph.stage === "expose" || ph.endsAt == null) return false;
  const s = settingsOf(p.settings);
  const set = (await q.query(`SELECT eligible FROM game_set WHERE id=$1`, [ph.setId]))[0];
  let need = await q.query(`SELECT id FROM team WHERE id = ANY($1::uuid[]) AND status='active'`, [asIds(set.eligible)]);
  const kind = ph.stage === "answer" ? "answer" : ph.stage;
  if (kind === "predict") {
    const pref = new Set((await q.query(`SELECT team_id FROM answer WHERE question_id=$1 AND kind='prefer'`, [ph.questionId])).map((r) => r.team_id));
    need = need.filter((r) => pref.has(r.id));
  }
  if (!need.length) return false;
  const got = new Set((await q.query(`SELECT team_id FROM answer WHERE question_id=$1 AND kind=$2`, [ph.questionId, kind])).map((r) => r.team_id));
  if (!need.every((r) => got.has(r.id))) return false;
  const target = Math.max(now, (ph.stageStartsAt ?? ph.startsAt) + s.minViewMs);
  if (target >= ph.endsAt) return false;
  ph.endsAt = target;
  return true;
}

export { ms };
export type { PhaseState };
