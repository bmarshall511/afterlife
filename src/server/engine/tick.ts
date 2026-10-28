import { createHash, randomUUID } from "node:crypto";
import type { Q } from "@/server/db";
import type { AnswerValue, GameFamily } from "@/shared/types";
import { album, content, db, tributes } from "./deps";
import { iso, ms, shuffle } from "./rng";
import { chooseSet, markExposed } from "./select";
import { settingsOf } from "./settings";
import { firstStage, isWatchStage, nextStage, questionMax, revealMsFor, stageMs } from "./stages";
import { asIds, audit, loadParty, saveParty } from "./store";
import { roomActual, roomVoid, scoreCalavera, scoreCase, correctPairs, scoreClosest, scoreLine, scoreLoteria, scoreRoom } from "./scoring";
import type { ContentItem, ContentSource, PartyRow, PhaseState, Settings, StoredOutcome, VoteEntry } from "./types";

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
const SOCIAL = new Set<GameFamily>(["calavera", "room"]);

async function activeTeamIds(q: Q, partyId: string): Promise<string[]> {
  const r = await q.query(`SELECT id FROM team WHERE party_id=$1 AND status='active' ORDER BY created_at, id`, [partyId]);
  return r.map((x) => x.id as string);
}

async function isDue(q: Q, p: PartyRow, now: number): Promise<boolean> {
  if (p.status === "paused") return false;
  const ph = p.phase;
  if (ph.endsAt != null && ph.endsAt <= now) return true;
  if (ph.kind === "ambient" || ph.kind === "interval") {
    if (ph.kind === "ambient" && p.status === "running" && p.mode === "normal" && (await activeTeamIds(q, p.id)).length > 0) return true;
    if (ph.tribute && (ph.tributeUntil ?? 0) <= now) return true;
    if (!ph.tribute && (ph.endsAt == null || ph.endsAt - now > settingsOf(p.settings).tributeDwellMinMs)) return hasTributes(q, p.id);
    if (ph.tribute && !(await (await tributes()).isTributeVisible(q, p.id, ph.tribute.id))) return true;
    if (ph.slide && (ph.slideUntil ?? 0) <= now) return true;
    if (ph.slide && !(await (await album()).isAlbumPhotoVisible(q, p.id, ph.slide.id))) return true;
    if (!ph.tribute && !ph.slide) return hasAlbumPhotos(q, p.id);
  }
  return false;
}

async function hasAlbumPhotos(q: Q, partyId: string) {
  try {
    return (await q.query(`SELECT 1 FROM album_photo WHERE party_id=$1 AND status='published' LIMIT 1`, [partyId])).length > 0;
  } catch {
    return false;
  }
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
      changed = (await rotateMedia(q, p, s, now)) || changed;
      break;
    }
    if (ph.endsAt == null || ph.endsAt > now) {
      if (ph.kind === "interval") changed = (await rotateMedia(q, p, s, now)) || changed;
      break;
    }
    if (p.status !== "running") {
      p.phase = { kind: "ambient", startsAt: now, endsAt: null };
      changed = true;
      continue;
    }
    await transition(q, p, s, ph.endsAt); // logical transition time keeps cadence exact when ticks are late
    changed = true;
  }
  return changed;
}

function enterInterval(p: PartyRow, s: Settings, t: number) {
  const prev = p.phase;
  p.phase = { kind: "interval", startsAt: t, endsAt: t + s.intervalMs, tribute: prev.tribute ?? null, tributeUntil: prev.tributeUntil, slide: null };
}

/** Album photos never interrupt a tribute; a break shows tributes first, then party photos. */
const AMBIENT_CYCLE_MS = 135_000, AMBIENT_TRIBUTE_MS = 90_000;
function wantsAlbum(p: PartyRow, s: Settings, now: number): boolean {
  const ph = p.phase;
  if (ph.kind === "interval") return now - ph.startsAt >= s.intervalTributeMs;
  return (now - (ph.startsAt ?? 0)) % AMBIENT_CYCLE_MS >= AMBIENT_TRIBUTE_MS;
}

async function rotateMedia(q: Q, p: PartyRow, s: Settings, now: number): Promise<boolean> {
  const ph = p.phase;
  const tq = await tributes();
  if (ph.tribute) {
    const visible = (ph.tributeUntil ?? 0) > now && (await tq.isTributeVisible(q, p.id, ph.tribute.id));
    if (visible) return false;
  }
  const aq = await album();
  if (ph.slide) {
    const visible = (ph.slideUntil ?? 0) > now && (await aq.isAlbumPhotoVisible(q, p.id, ph.slide.id));
    if (visible) return false;
  }
  const had = !!(ph.tribute || ph.slide);
  const room = ph.endsAt == null ? Infinity : ph.endsAt - now;
  const albumTurn = wantsAlbum(p, s, now);
  let tribute = null;
  if (!albumTurn && room >= s.tributeDwellMinMs) tribute = await tq.nextTribute(q, p.id, now);
  if (tribute) {
    const dwell = Math.min(s.tributeDwellMaxMs, Math.max(s.tributeDwellMinMs, tribute.dwellMs || 25000));
    ph.tribute = { ...tribute, dwellMs: dwell };
    ph.tributeUntil = now + dwell;
    ph.slide = null;
    ph.slideUntil = undefined;
    return true;
  }
  ph.tribute = null;
  ph.tributeUntil = undefined;
  const slide = room >= 3000 ? await aq.nextAlbumSlide(q, p.id, now) : null;
  if (slide) {
    ph.slide = slide;
    ph.slideUntil = now + (slide.dwellMs || 7000);
    return true;
  }
  ph.slide = null;
  ph.slideUntil = undefined;
  return had;
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
        if (ok) p.phase = { kind: "results", startsAt: t, endsAt: t + s.resultsMs, setId: ph.setId, setSeq: ph.setSeq, family: ph.family, doubled: ph.doubled };
        else enterInterval(p, s, t);
      }
      return;
    case "results":
      enterInterval(p, s, t);
      p.phase.tribute = null;
      p.phase.slide = null;
      return;
    case "interval": {
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

function bumpPlayed(p: PartyRow, f: GameFamily, by = 1) {
  const pl = { ...(p.engine.played ?? {}) };
  pl[f] = Math.max(0, (pl[f] ?? 0) + by);
  p.engine.played = pl;
}

/** intro start: snapshot cohort, choose family & content, create set + 3 pending questions. */
export async function startSet(q: Q, p: PartyRow, s: Settings, t: number) {
  if (p.status !== "running" || p.mode === "tribute_only") {
    const iv = p.mode === "tribute_only" && p.status === "running";
    p.phase = { kind: iv ? "interval" : "ambient", startsAt: t, endsAt: iv ? t + s.intervalMs : null };
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
  const pick = await chooseSet(q, p, s, c, { teams: cohort.length, seed });
  if (!pick) {
    await audit(q, p.id, "engine", "no_content", { seq });
    p.phase = { kind: "interval", startsAt: t, endsAt: t + s.intervalMs };
    return;
  }
  const doubled = !!p.engine.doubleNext;
  const setId = randomUUID();
  await q.query(
    `INSERT INTO game_set (id, party_id, seq, family, status, cohort, eligible, seed, started_at, doubled) VALUES ($1,$2,$3,$4,'running',$5,'[]',$6,$7,$8)`,
    [setId, p.id, seq, pick.family, JSON.stringify(cohort), seed, iso(t), doubled],
  );
  await insertQuestions(q, p.id, setId, pick.items, c);
  await markExposed(q, p.id, pick.items.map((i) => i.id), t);
  if (pick.encore && !p.engine.encore) await audit(q, p.id, "engine", "encore", { seq, family: pick.family });
  if (doubled) await audit(q, p.id, "engine", "doubled_set", { seq, setId });
  p.engine.encore = pick.encore;
  p.engine.doubleNext = false;
  p.set_seq = seq;
  p.engine.lastFamily = pick.family;
  bumpPlayed(p, pick.family);
  p.engine.forceObjective = false;
  p.phase = { kind: "intro", startsAt: t, endsAt: t + s.introMs, setId, setSeq: seq, family: pick.family, ...(doubled ? { doubled: true } : {}) };
}

async function insertQuestions(q: Q, partyId: string, setId: string, items: ContentItem[], c: ContentSource) {
  await q.query(`DELETE FROM question WHERE set_id=$1 AND status='pending'`, [setId]);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    let reveal: unknown = null;
    try {
      reveal = c.revealInfo(it);
    } catch {
      reveal = { correct: it.answer, explanation: it.explanation ?? "" };
    }
    // question.public is minimal and never sent as-is; the snapshot always goes through publicQuestion().
    await q.query(
      `INSERT INTO question (id, party_id, set_id, idx, content_id, public, private, status) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')`,
      [randomUUID(), partyId, setId, i, it.id, JSON.stringify({ family: it.family, difficulty: it.difficulty }), JSON.stringify({ item: it, reveal })],
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
  if (SOCIAL.has(set.family) && eligible.length < 3) {
    // Social set needs >=3 eligible teams: swap to an objective family before any question opens.
    const c = await content();
    bumpPlayed(p, set.family, -1);
    const pick = await chooseSet(q, { ...p, engine: { ...p.engine, lastFamily: set.family } }, s, c, { teams: eligible.length, seed: `${p.rng_seed}:${p.id}:${ph.setSeq}:swap` });
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
    bumpPlayed(p, pick.family);
  }
  await openQuestion(q, p, s, 0, t);
}

async function openQuestion(q: Q, p: PartyRow, s: Settings, idx: number, t: number) {
  const ph = p.phase;
  const row = (await q.query(`SELECT id FROM question WHERE set_id=$1 AND idx=$2`, [ph.setId, idx]))[0];
  await q.query(`UPDATE question SET status='open', opened_at=$2 WHERE id=$1`, [row.id, iso(t)]);
  const f = ph.family!;
  const st = firstStage(f);
  p.phase = { kind: "question", startsAt: t, endsAt: t + stageMs(s, f, st), setId: ph.setId, setSeq: ph.setSeq, family: f, qIndex: idx, stage: st, stageStartsAt: t, questionId: row.id, ...(ph.doubled ? { doubled: true } : {}) };
}

function toReveal(p: PartyRow, s: Settings, t: number) {
  const ph = p.phase;
  p.phase = { kind: "reveal", startsAt: t, endsAt: t + revealMsFor(s, ph.family!), setId: ph.setId, setSeq: ph.setSeq, family: ph.family, qIndex: ph.qIndex, questionId: ph.questionId, ...(ph.doubled ? { doubled: true } : {}) };
}

async function qPrivate(q: Q, qid: string) {
  const r = (await q.query(`SELECT private, set_id, idx, status FROM question WHERE id=$1`, [qid]))[0];
  return r as { private: any; set_id: string; idx: number; status: string };
}
async function setPrivate(q: Q, qid: string, priv: unknown) {
  await q.query(`UPDATE question SET private=$2 WHERE id=$1`, [qid, JSON.stringify(priv)]);
}
async function eligibleOf(q: Q, setId: string): Promise<string[]> {
  return asIds((await q.query(`SELECT eligible FROM game_set WHERE id=$1`, [setId]))[0]?.eligible);
}

/** Opaque public id of a calavera entry (no authorship information). */
export const entryId = (qid: string, answerId: string) => "e" + createHash("sha256").update(`${qid}:${answerId}`).digest("hex").slice(0, 12);

async function endStage(q: Q, p: PartyRow, s: Settings, t: number) {
  const ph = p.phase;
  const f = ph.family!;
  const st = ph.stage!;
  const qid = ph.questionId!;
  if (f === "calavera" && st === "write") {
    const r = await qPrivate(q, qid);
    const ans = await q.query(`SELECT id, team_id, value FROM answer WHERE question_id=$1 AND kind='write' AND NOT hidden ORDER BY created_at, id`, [qid]);
    if (ans.length < 2) {
      await voidQuestion(q, qid, "too_few_entries", t);
      return toReveal(p, s, t);
    }
    let entries: VoteEntry[] = ans.map((a) => ({ id: entryId(qid, a.id), text: String(a.value), answerId: a.id, teamId: a.team_id, house: false }));
    if (entries.length === 2) {
      const house = ((r.private.item?.data?.house as string[]) ?? []).slice(0, 2);
      entries.push(...house.map((h, k) => ({ id: entryId(qid, `house-${k}`), text: h, answerId: null, teamId: null, house: true })));
    }
    entries = shuffle(entries, qid);
    await setPrivate(q, qid, { ...r.private, voteEntries: entries });
  } else if (f === "room" && st === "answer") {
    const r = await qPrivate(q, qid);
    const eligible = await eligibleOf(q, r.set_id);
    const nOpts = ((r.private.item?.data?.options as unknown[]) ?? []).length || 4;
    const tally = Array(nOpts).fill(0);
    const ans = await q.query(`SELECT team_id, value FROM answer WHERE question_id=$1 AND kind='answer'`, [qid]);
    for (const a of ans) if (eligible.includes(a.team_id) && Number.isInteger(a.value) && a.value >= 0 && a.value < nOpts) tally[a.value]++;
    await setPrivate(q, qid, { ...r.private, tally });
    if (roomVoid(tally)) {
      await voidQuestion(q, qid, "too_few_answers", t);
      return toReveal(p, s, t);
    }
  }
  const nxt = nextStage(f, st);
  if (nxt) {
    p.phase = { ...ph, stage: nxt, stageStartsAt: t, endsAt: t + stageMs(s, f, nxt) };
    await maybeEarlyClose(q, p, t);
    return;
  }
  await scoreQuestion(q, p.id, ph.setId!, qid, t, !!ph.doubled);
  toReveal(p, s, t);
}

async function voidQuestion(q: Q, qid: string, reason: string, t: number) {
  await q.query(`UPDATE question SET status='void', void_reason=$2, revealed_at=$3 WHERE id=$1`, [qid, reason, iso(t)]);
}

/**
 * Scoring: exactly once, inside the final-stage → reveal transition. Unique index makes retries harmless.
 * Ledger points are already multiplied for doubled sets. Stores per-team outcomes + reveal detail in private.
 */
export async function scoreQuestion(q: Q, partyId: string, setId: string, qid: string, t: number, doubled: boolean) {
  const r = await qPrivate(q, qid);
  if (r.status !== "open") return;
  const priv = r.private;
  const item = priv.item as ContentItem;
  const f = item.family;
  const mult = doubled ? 2 : 1;
  const eligible = await eligibleOf(q, setId);
  const rows = await q.query(`SELECT team_id, kind, value, id, hidden FROM answer WHERE question_id=$1`, [qid]);
  const byKind = (k: string) => rows.filter((a) => a.kind === k);
  const pts = new Map<string, number>();
  const outcomes = new Map<string, StoredOutcome>();
  const teams = new Set<string>([...eligible, ...rows.map((a) => a.team_id as string)]);
  let detail: Record<string, unknown> = {};
  let writeLedger = true;

  switch (f) {
    case "line":
      for (const a of byKind("answer")) {
        pts.set(a.team_id, scoreLine(a.value, item.answer as string[]));
        outcomes.set(a.team_id, { teamId: a.team_id, points: 0, value: a.value });
      }
      break;
    case "loteria":
      for (const a of byKind("answer")) {
        pts.set(a.team_id, scoreLoteria(a.value, item.answer as number));
        outcomes.set(a.team_id, { teamId: a.team_id, points: 0, value: a.value });
      }
      break;
    case "closest": {
      const g = byKind("answer").map((a) => ({ teamId: a.team_id as string, guess: Number(a.value) }));
      const res = scoreClosest(g, Number(item.answer));
      for (const x of g) {
        const o = res.get(x.teamId)!;
        pts.set(x.teamId, o.points);
        outcomes.set(x.teamId, { teamId: x.teamId, points: 0, value: x.guess, note: o.over ? "over" : o.closest ? "closest" : undefined });
      }
      break;
    }
    case "room": {
      const tally: number[] = priv.tally ?? [];
      const answerOf = new Map(byKind("answer").map((a) => [a.team_id as string, a.value as number]));
      for (const a of byKind("guess")) {
        const choice = answerOf.get(a.team_id);
        if (choice == null) continue;
        const actual = roomActual(tally, choice);
        pts.set(a.team_id, scoreRoom(a.value, actual));
        outcomes.set(a.team_id, { teamId: a.team_id, points: 0, value: a.value, note: `guessed ${a.value}%, actual ${actual}%` });
      }
      for (const [team, choice] of answerOf)
        if (!outcomes.has(team)) outcomes.set(team, { teamId: team, points: 0, value: null, note: `no guess (actual ${roomActual(tally, choice)}%)` });
      const guessOf = new Map(byKind("guess").map((a) => [a.team_id as string, a.value as number]));
      const guesses = [...answerOf].map(([teamId, option]) => ({ teamId, option, guess: guessOf.get(teamId) ?? null, actual: roomActual(tally, option) }));
      detail = { split: tally, counts: tally, total: tally.reduce((a, b) => a + b, 0), guesses };
      break;
    }
    case "calavera": {
      const entries: VoteEntry[] = priv.voteEntries ?? [];
      const hidden = new Set<string>(rows.filter((a) => a.kind === "write" && a.hidden).map((a) => a.id as string));
      const votes = byKind("vote").map((a) => ({ teamId: a.team_id as string, entryId: String(a.value) }));
      const res = scoreCalavera(entries, votes, hidden);
      for (const [team, p] of res.points) pts.set(team, p);
      const live = entries.filter((e) => !e.answerId || !hidden.has(e.answerId));
      const top = Math.max(0, ...live.filter((e) => !e.house).map((e) => res.votesFor.get(e.id) ?? 0));
      detail = {
        entries: live.map((e) => ({ id: e.id, text: e.text, teamId: e.teamId, house: e.house, votes: res.votesFor.get(e.id) ?? 0, winner: !e.house && top > 0 && (res.votesFor.get(e.id) ?? 0) === top })),
      };
      for (const e of live) if (e.teamId) outcomes.set(e.teamId, { teamId: e.teamId, points: 0, value: e.text, note: `${res.votesFor.get(e.id) ?? 0} votes` });
      for (const a of byKind("write")) if (hidden.has(a.id)) outcomes.set(a.team_id, { teamId: a.team_id, points: 0, value: null, note: "entry hidden by host" });
      break;
    }
    case "case": {
      // All locks of this set (one per team, lock-once), with the clue round they were made in.
      const locks = await q.query(
        `SELECT a.team_id, a.value, qq.idx FROM answer a JOIN question qq ON qq.id=a.question_id WHERE qq.set_id=$1 AND a.kind='answer'`,
        [setId],
      );
      for (const l of locks) teams.add(l.team_id);
      if (r.idx < 2) {
        writeLedger = false;
        for (const tm of teams) {
          const l = locks.find((x) => x.team_id === tm);
          outcomes.set(tm, { teamId: tm, points: 0, value: null, note: l ? "locked" : "still thinking" });
        }
        detail = { round: r.idx + 1, locked: locks.length, thinking: Math.max(0, eligible.filter((e) => !locks.some((l) => l.team_id === e)).length) };
      } else {
        const sol = item.answer as Record<string, string>;
        for (const l of locks) {
          pts.set(l.team_id, scoreCase(l.value, sol, l.idx));
          outcomes.set(l.team_id, { teamId: l.team_id, points: 0, value: l.value, note: `locked after clue ${l.idx + 1}, ${correctPairs(l.value, sol)}/4 correct` });
        }
        detail = { locked: locks.length };
      }
      break;
    }
  }
  if (writeLedger)
    for (const tm of teams) {
      const p = (pts.get(tm) ?? 0) * mult;
      await q.query(
        `INSERT INTO score_ledger (id, party_id, team_id, set_id, question_id, kind, points) VALUES ($1,$2,$3,$4,$5,'question',$6)
         ON CONFLICT (question_id, team_id) WHERE kind = 'question' DO NOTHING`,
        [randomUUID(), partyId, tm, setId, qid, p],
      );
    }
  const outs: StoredOutcome[] = [...teams].map((tm) => ({ ...(outcomes.get(tm) ?? { teamId: tm, value: null }), teamId: tm, points: (pts.get(tm) ?? 0) * mult }));
  await setPrivate(q, qid, { ...priv, outcomes: outs, revealDetail: detail });
  await q.query(`UPDATE question SET status='revealed', revealed_at=$2 WHERE id=$1`, [qid, iso(t)]);
}

/**
 * Set end: write set_score rows. Participants = eligible teams (ranked; unanswered = 0) plus anyone
 * who answered (practice, ranked=false). Social sets (calavera, room) normalize to the nonvoid count
 * (×3/nonvoid); <2 nonvoid → invalidated. Returns false if the set ended invalidated (no results screen).
 */
export async function finalizeSet(q: Q, p: PartyRow, setId: string, t: number): Promise<boolean> {
  const set = (await q.query(`SELECT status, family, eligible, doubled FROM game_set WHERE id=$1`, [setId]))[0];
  if (!set || set.status !== "running") return false;
  const eligible = asIds(set.eligible);
  const qs = await q.query(`SELECT id, status FROM question WHERE set_id=$1`, [setId]);
  const nonvoid = qs.filter((x) => x.status === "revealed").length;
  const sums = await q.query(`SELECT team_id, SUM(points)::int AS pts FROM score_ledger WHERE set_id=$1 AND kind='question' GROUP BY team_id`, [setId]);
  const answered = await q.query(`SELECT DISTINCT a.team_id FROM answer a JOIN question qq ON qq.id=a.question_id WHERE qq.set_id=$1`, [setId]);
  const teams = new Set<string>([...eligible, ...sums.map((r) => r.team_id), ...answered.map((r) => r.team_id)]);
  const pts = new Map(sums.map((r) => [r.team_id as string, Number(r.pts)]));
  const social = SOCIAL.has(set.family);
  const max = 300 * (set.doubled ? 2 : 1);
  let invalid: string | null = null;
  if (social && nonvoid < 2) invalid = `${set.family}_void`;
  for (const team of teams) {
    const raw = pts.get(team) ?? 0;
    const score = social && nonvoid ? Math.min(max, Math.round((raw / nonvoid) * 3)) : raw;
    await q.query(
      `INSERT INTO set_score (party_id, set_id, team_id, score, ranked, normalized, perfect) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [p.id, setId, team, score, eligible.includes(team), social && nonvoid < 3, score === max],
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

/** Teams that locked a case assignment in an earlier clue round of this set. */
export async function caseLockedTeams(q: Q, setId: string): Promise<Map<string, { idx: number; value: AnswerValue }>> {
  const rows = await q.query(`SELECT a.team_id, a.value, qq.idx FROM answer a JOIN question qq ON qq.id=a.question_id WHERE qq.set_id=$1 AND a.kind='answer'`, [setId]);
  return new Map(rows.map((r) => [r.team_id as string, { idx: r.idx as number, value: r.value }]));
}

/**
 * Early close: if every stage-eligible team has submitted, shorten the stage to max(now, stageStart+minViewMs).
 * Never for TV-only stages (case `clue`). Stage-eligible: eligible active teams; room `guess` → those that
 * answered; case `answer` → those not yet locked (if nobody is left, the stage closes early too).
 */
export async function maybeEarlyClose(q: Q, p: PartyRow, now: number): Promise<boolean> {
  const ph = p.phase;
  if (ph.kind !== "question" || !ph.stage || !ph.family || ph.endsAt == null || isWatchStage(ph.family, ph.stage)) return false;
  const s = settingsOf(p.settings);
  const eligible = await eligibleOf(q, ph.setId!);
  let need = (await q.query(`SELECT id FROM team WHERE id = ANY($1::uuid[]) AND status='active'`, [eligible])).map((r) => r.id as string);
  const got = new Set((await q.query(`SELECT team_id FROM answer WHERE question_id=$1 AND kind=$2`, [ph.questionId, ph.stage])).map((r) => r.team_id as string));
  if (ph.family === "room" && ph.stage === "guess") {
    const ans = new Set((await q.query(`SELECT team_id FROM answer WHERE question_id=$1 AND kind='answer'`, [ph.questionId])).map((r) => r.team_id));
    need = need.filter((id) => ans.has(id));
  }
  if (ph.family === "case" && ph.stage === "answer") {
    const locked = await caseLockedTeams(q, ph.setId!);
    need = need.filter((id) => !locked.has(id) || got.has(id));
    if (!need.length && eligible.length === 0) return false;
  } else if (!need.length) return false;
  if (!need.every((id) => got.has(id))) return false;
  const target = Math.max(now, (ph.stageStartsAt ?? ph.startsAt) + s.minViewMs);
  if (target >= ph.endsAt) return false;
  ph.endsAt = target;
  return true;
}

export { ms, questionMax };
export type { PhaseState };
