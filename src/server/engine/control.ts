/**
 * Admin control surface (called by src/app/api/admin/**). Every mutating call writes an audit row and
 * bumps party.version. `actor` is a free-form string, e.g. "admin". Optional trailing `now` for tests.
 * Errors are EngineError {code, status}: invalid | not_found | confirm_required.
 */
import { randomUUID } from "node:crypto";
import type { Q } from "@/server/db";
import type { StandingRow } from "@/shared/types";
import { db } from "./deps";
import { settingsOf, validateSettingsPatch } from "./settings";
import { asIds, audit, loadParty, saveParty } from "./store";
import { advance, invalidateSetRow } from "./tick";
import { computeStandings as standings } from "./snapshot";
import type { PartyRow } from "./types";
import { EngineError } from "./types";

type Mut = (q: Q, p: PartyRow, now: number) => Promise<unknown>;

async function withParty<T>(partyId: string, actor: string, action: string, detail: unknown, now: number, fn: Mut): Promise<T> {
  const d = await db();
  return d.tx(async (q) => {
    const p = await loadParty(q, partyId, true);
    const r = await fn(q, p, now);
    await advance(q, p, now);
    await saveParty(q, p);
    await audit(q, partyId, actor, action, detail);
    return r as T;
  });
}

export function computeStandings(q: Q, partyId: string): Promise<StandingRow[]> {
  return standings(q, partyId);
}

export function startParty(partyId: string, actor: string, now = Date.now()) {
  return withParty(partyId, actor, "start", {}, now, async (_q, p) => {
    if (p.status === "paused") throw new EngineError("invalid", "party is paused; use resume", 409);
    if (p.status === "running") return;
    p.status = "running";
    p.phase = { kind: "ambient", startsAt: now, endsAt: null, tribute: p.phase.tribute ?? null, tributeUntil: p.phase.tributeUntil };
  });
}

/** Pause freezes logical time: remaining ms stored; resume sets endsAt = now + remaining. */
export function pauseParty(partyId: string, actor: string, now = Date.now()) {
  return withParty(partyId, actor, "pause", {}, now, async (_q, p) => {
    if (p.status !== "running") throw new EngineError("invalid", "party is not running", 409);
    p.engine.pausedAt = now;
    p.engine.pausedRemainingMs = p.phase.endsAt != null ? Math.max(0, p.phase.endsAt - now) : null;
    p.status = "paused";
  });
}

export async function resumeParty(partyId: string, actor: string, now = Date.now()) {
  const d = await db();
  return d.tx(async (q) => {
    const p = await loadParty(q, partyId, true);
    if (p.status !== "paused") throw new EngineError("invalid", "party is not paused", 409);
    const shift = now - (p.engine.pausedAt ?? now);
    const ph = p.phase;
    ph.startsAt += shift;
    if (ph.stageStartsAt != null) ph.stageStartsAt += shift;
    if (ph.tributeUntil != null) ph.tributeUntil += shift;
    ph.endsAt = p.engine.pausedRemainingMs != null ? now + p.engine.pausedRemainingMs : ph.endsAt;
    p.engine.pausedAt = null;
    p.engine.pausedRemainingMs = null;
    p.status = "running";
    await advance(q, p, now);
    await saveParty(q, p);
    await audit(q, partyId, actor, "resume", { pausedMs: shift });
  });
}

/** Host skip: the running set is invalidated for everyone (GAME-RULES) and the party moves to an interval. */
export function skipQuestion(partyId: string, actor: string, now = Date.now()) {
  return withParty(partyId, actor, "skip", {}, now, async (q, p) => {
    const ph = p.phase;
    if (ph.setId && ["intro", "question", "reveal"].includes(ph.kind)) {
      await invalidateSetRow(q, partyId, ph.setId, "skipped", actor);
      toInterval(p, now);
    } else if (ph.kind === "results" || ph.kind === "interval") {
      // skipping a break / results just ends it now (interval still waits for a showing tribute)
      ph.endsAt = now;
    } else throw new EngineError("invalid", "nothing to skip", 409);
  });
}

function toInterval(p: PartyRow, now: number) {
  const s = settingsOf(p.settings);
  p.phase = { kind: "interval", startsAt: now, endsAt: now + s.intervalMs, tribute: null };
}

/** Invalidate any set (running or past). Past complete sets drop out of rankings for everyone. */
export function invalidateSet(partyId: string, setId: string, reason: string, actor: string, now = Date.now()) {
  return withParty(partyId, actor, "invalidate_set", { setId, reason }, now, async (q, p) => {
    const r = await q.query(`SELECT status FROM game_set WHERE id=$1 AND party_id=$2`, [setId, partyId]);
    if (!r[0]) throw new EngineError("not_found", "set not found", 404);
    await invalidateSetRow(q, partyId, setId, String(reason || "host").slice(0, 100), actor);
    if (p.phase.setId === setId && ["intro", "question", "reveal", "results"].includes(p.phase.kind)) toInterval(p, now);
  });
}

export function extendInterval(partyId: string, extraMs: number, actor: string, now = Date.now()) {
  return withParty(partyId, actor, "extend_interval", { ms: extraMs }, now, async (_q, p) => {
    if (!Number.isFinite(extraMs) || extraMs <= 0 || extraMs > 3600_000) throw new EngineError("invalid", "bad duration", 400);
    if (p.phase.kind !== "interval" || p.phase.endsAt == null) throw new EngineError("invalid", "not in an interval", 409);
    if (p.status === "paused") p.engine.pausedRemainingMs = (p.engine.pausedRemainingMs ?? 0) + extraMs;
    else p.phase.endsAt += extraMs;
  });
}

export function setMode(partyId: string, mode: "normal" | "tribute_only", actor: string, now = Date.now()) {
  return withParty(partyId, actor, "set_mode", { mode }, now, async (_q, p) => {
    if (mode !== "normal" && mode !== "tribute_only") throw new EngineError("invalid", "bad mode", 400);
    p.mode = mode; // a running set finishes; subsequent intervals loop tributes only
  });
}

export function updateSettings(partyId: string, patch: Record<string, unknown>, actor: string, now = Date.now()) {
  return withParty(partyId, actor, "update_settings", patch, now, async (_q, p) => {
    let v;
    try {
      v = validateSettingsPatch(patch);
    } catch (e) {
      throw new EngineError("invalid", (e as Error).message, 400);
    }
    p.settings = { ...p.settings, ...v };
  });
}

/** End: a running set is invalidated (reason 'ended'); party sits in ambient with status ended. */
export function endParty(partyId: string, actor: string, now = Date.now()) {
  return withParty(partyId, actor, "end", {}, now, async (q, p) => {
    if (p.phase.setId && ["intro", "question", "reveal"].includes(p.phase.kind)) await invalidateSetRow(q, partyId, p.phase.setId, "ended", actor);
    p.status = "ended";
    p.phase = { kind: "ambient", startsAt: now, endsAt: null };
  });
}

/**
 * Reset game data for a party (teams, members, sets, answers, scores, exposure). Tributes are NOT touched
 * (tributes workstream owns them). 'live' requires opts.confirm === true.
 */
export async function resetParty(partyId: string, actor: string, opts: { confirm?: boolean } = {}, now = Date.now()) {
  if (partyId !== "demo" && opts.confirm !== true) throw new EngineError("confirm_required", "resetting the live party requires confirmation", 400);
  const d = await db();
  await d.tx(async (q) => {
    const p = await loadParty(q, partyId, true);
    for (const t of ["answer", "set_score", "score_ledger"]) await q.query(`DELETE FROM ${t} WHERE party_id=$1`, [partyId]);
    await q.query(`DELETE FROM question WHERE party_id=$1`, [partyId]);
    await q.query(`DELETE FROM game_set WHERE party_id=$1`, [partyId]);
    await q.query(`UPDATE team SET captain_member_id=NULL WHERE party_id=$1`, [partyId]);
    await q.query(`DELETE FROM member WHERE party_id=$1`, [partyId]);
    await q.query(`DELETE FROM team WHERE party_id=$1`, [partyId]);
    await q.query(`DELETE FROM content_exposure WHERE party_id=$1`, [partyId]);
    p.status = "idle";
    p.mode = "normal";
    p.set_seq = 0;
    p.engine = {};
    p.phase = { kind: "ambient", startsAt: now, endsAt: null };
    // A demo reset also restores default pacing/games, so leftover test settings can't linger.
    if (partyId === "demo") p.settings = {};
    await saveParty(q, p);
    await audit(q, partyId, actor, "reset", {});
  });
}

async function teamRow(q: Q, partyId: string, teamId: string) {
  const t = (await q.query(`SELECT * FROM team WHERE id=$1 AND party_id=$2`, [teamId, partyId]))[0];
  if (!t) throw new EngineError("not_found", "team not found", 404);
  return t;
}

/** Audited manual adjustment (ledger kind 'adjust'); added on top of best-five total. */
export function adjustScore(partyId: string, teamId: string, points: number, reason: string, actor: string, now = Date.now()) {
  return withParty(partyId, actor, "adjust_score", { teamId, points, reason }, now, async (q) => {
    if (!Number.isInteger(points) || Math.abs(points) > 1500) throw new EngineError("invalid", "bad points", 400);
    if (!reason || !String(reason).trim()) throw new EngineError("invalid", "reason required", 400);
    await teamRow(q, partyId, teamId);
    await q.query(`INSERT INTO score_ledger (id, party_id, team_id, kind, points, reason, actor, created_at) VALUES ($1,$2,$3,'adjust',$4,$5,$6,$7)`, [
      randomUUID(), partyId, teamId, points, String(reason).slice(0, 200), actor, new Date(now).toISOString(),
    ]);
  });
}

/**
 * Merge duplicate team `fromId` into `intoId`. Deterministic reconciliation:
 *  - members move to `into` (sessions keep working); `into` keeps its captain (or adopts from's).
 *  - set_score: sets only `from` played are re-pointed. For sets BOTH played exactly one row survives:
 *    a ranked row beats an unranked one; if both have the same rankedness the higher score wins.
 *    Never summed, so no double counting and no manufactured qualified sets.
 *  - question ledger rows re-pointed where `into` has none for that question; conflicting rows stay on
 *    the merged (excluded) team. Adjustments are re-pointed.
 *  - running set cohort/eligible: `from` replaced by `into` (deduped).
 *  - `from` becomes status 'merged' with merged_into set.
 */
export function mergeTeams(partyId: string, fromId: string, intoId: string, actor: string, now = Date.now()) {
  return withParty(partyId, actor, "merge_teams", { fromId, intoId }, now, async (q) => {
    if (fromId === intoId) throw new EngineError("invalid", "cannot merge a team into itself", 400);
    const from = await teamRow(q, partyId, fromId);
    const into = await teamRow(q, partyId, intoId);
    if (!["active", "away"].includes(from.status) || !["active", "away"].includes(into.status)) throw new EngineError("invalid", "both teams must be active or away", 409);
    await q.query(`UPDATE member SET team_id=$2 WHERE team_id=$1`, [fromId, intoId]);
    if (!into.captain_member_id) await q.query(`UPDATE team SET captain_member_id=$2 WHERE id=$1`, [intoId, from.captain_member_id]);
    const fs = await q.query(`SELECT * FROM set_score WHERE team_id=$1`, [fromId]);
    for (const f of fs) {
      const i = (await q.query(`SELECT * FROM set_score WHERE team_id=$1 AND set_id=$2`, [intoId, f.set_id]))[0];
      if (!i) {
        await q.query(`UPDATE set_score SET team_id=$2 WHERE team_id=$1 AND set_id=$3`, [fromId, intoId, f.set_id]);
        continue;
      }
      const fromWins = f.ranked !== i.ranked ? f.ranked : Number(f.score) > Number(i.score);
      if (fromWins) await q.query(`UPDATE set_score SET score=$3, ranked=$4, normalized=$5, perfect=$6 WHERE team_id=$1 AND set_id=$2`, [intoId, f.set_id, f.score, f.ranked, f.normalized, f.perfect]);
      await q.query(`DELETE FROM set_score WHERE team_id=$1 AND set_id=$2`, [fromId, f.set_id]);
    }
    await q.query(
      `UPDATE score_ledger SET team_id=$2 WHERE team_id=$1 AND (kind <> 'question' OR NOT EXISTS
         (SELECT 1 FROM score_ledger x WHERE x.team_id=$2 AND x.question_id=score_ledger.question_id AND x.kind='question'))`,
      [fromId, intoId],
    );
    const running = await q.query(`SELECT id, cohort, eligible FROM game_set WHERE party_id=$1 AND status='running'`, [partyId]);
    for (const s of running) {
      const fix = (ids: string[]) => [...new Set(ids.map((x) => (x === fromId ? intoId : x)))];
      await q.query(`UPDATE game_set SET cohort=$2, eligible=$3 WHERE id=$1`, [s.id, JSON.stringify(fix(asIds(s.cohort))), JSON.stringify(fix(asIds(s.eligible)))]);
    }
    await q.query(`UPDATE team SET status='merged', merged_into=$2, captain_member_id=NULL WHERE id=$1`, [fromId, intoId]);
  });
}

/** Remove a disruptive team: hidden from TV/standings; members' sessions stop working. */
export function removeTeam(partyId: string, teamId: string, actor: string, now = Date.now()) {
  return withParty(partyId, actor, "remove_team", { teamId }, now, async (q) => {
    await teamRow(q, partyId, teamId);
    await q.query(`UPDATE team SET status='removed' WHERE id=$1`, [teamId]);
  });
}

export function renameTeam(partyId: string, teamId: string, name: string, actor: string, now = Date.now()) {
  return withParty(partyId, actor, "rename_team", { teamId, name }, now, async (q) => {
    const n = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!n) throw new EngineError("invalid", "name required", 400);
    await teamRow(q, partyId, teamId);
    await q.query(`UPDATE team SET name=$2 WHERE id=$1`, [teamId, n]);
  });
}

/** Captain recovery: old captain loses submit authority immediately. */
export function setCaptain(partyId: string, teamId: string, memberId: string, actor: string, now = Date.now()) {
  return withParty(partyId, actor, "set_captain", { teamId, memberId }, now, async (q) => {
    await teamRow(q, partyId, teamId);
    const m = await q.query(`SELECT 1 FROM member WHERE id=$1 AND team_id=$2`, [memberId, teamId]);
    if (!m.length) throw new EngineError("not_found", "member not on team", 404);
    await q.query(`UPDATE team SET captain_member_id=$2 WHERE id=$1`, [teamId, memberId]);
  });
}

/** Set a team's active/away status (admin). */
export function setTeamStatus(partyId: string, teamId: string, status: "active" | "away", actor: string, now = Date.now()) {
  return withParty(partyId, actor, "set_team_status", { teamId, status }, now, async (q) => {
    if (status !== "active" && status !== "away") throw new EngineError("invalid", "bad status", 400);
    await teamRow(q, partyId, teamId);
    await q.query(`UPDATE team SET status=$2, away_since=$3 WHERE id=$1 AND status IN ('active','away')`, [teamId, status, status === "away" ? new Date(now).toISOString() : null]);
  });
}

/**
 * Host "Last chance": marks the NEXT set doubled (every ledger row ×2, max 600). One-shot.
 * `on=false` cancels a pending mark. Returns {doubleNext}.
 */
export function markFinalRound(partyId: string, actor: string, on: boolean = true, now = Date.now()) {
  return withParty<{ doubleNext: boolean }>(partyId, actor, "final_round", { on }, now, async (_q, p) => {
    p.engine.doubleNext = !!on;
    return { doubleNext: !!on };
  });
}

/**
 * Hide / unhide a calavera entry (answer row of kind 'write'). Hidden entries vanish from the vote list,
 * votes for them are discarded at scoring. Allowed any time; after scoring it only affects display.
 */
export function hideEntry(partyId: string, answerId: string, hidden: boolean, actor: string, now = Date.now()) {
  return withParty<{ answerId: string; hidden: boolean }>(partyId, actor, "hide_entry", { answerId, hidden }, now, async (q) => {
    if (!/^[0-9a-f-]{36}$/i.test(String(answerId))) throw new EngineError("invalid", "bad entry id", 400);
    const r = await q.query(`UPDATE answer SET hidden=$3 WHERE id=$1 AND party_id=$2 AND kind='write' RETURNING id`, [answerId, partyId, !!hidden]);
    if (!r.length) throw new EngineError("not_found", "entry not found", 404);
    return { answerId, hidden: !!hidden };
  });
}

/** Admin list of calavera entries of the current (or given) set, with authors and hidden flags. */
export async function listEntries(partyId: string, setId?: string | null) {
  const d = await db();
  const sid = setId ?? (await loadParty(d, partyId, false)).phase.setId ?? null;
  if (!sid) return { setId: null, entries: [] };
  const rows = await d.query(
    `SELECT a.id, a.question_id, qq.idx, a.team_id, t.name AS team_name, a.value, a.hidden, a.created_at
       FROM answer a JOIN question qq ON qq.id=a.question_id JOIN team t ON t.id=a.team_id
      WHERE qq.set_id=$1 AND a.party_id=$2 AND a.kind='write' ORDER BY qq.idx, a.created_at`,
    [sid, partyId],
  );
  return {
    setId: sid,
    entries: rows.map((r) => ({ answerId: r.id, questionId: r.question_id, qIndex: r.idx, teamId: r.team_id, teamName: r.team_name, text: r.value, hidden: r.hidden })),
  };
}

/**
 * Demo party only: end the current step right now so the host can click through every screen
 * (intro → each question stage → reveal → results → break → next set). Scoring still runs normally.
 */
export function demoAdvance(partyId: string, actor: string, now = Date.now()) {
  if (partyId !== "demo") throw new EngineError("invalid", "Step-through is only available on the demo party.", 403);
  return withParty(partyId, actor, "demo.advance", {}, now, async (_q, p) => {
    if (p.status === "paused") throw new EngineError("invalid", "Resume the demo first.", 409);
    if (p.status !== "running") throw new EngineError("invalid", "Press Start on the demo party first.", 409);
    const ph = p.phase;
    if (ph.kind === "ambient") {
      const n = (await _q.query(`SELECT count(*)::int AS n FROM team WHERE party_id=$1 AND status='active'`, [partyId]))[0]?.n ?? 0;
      if (!n) throw new EngineError("invalid", "No families yet — join from a phone, or tap “Add 3 bot families”.", 409);
    }
    if (ph.tribute) ph.tributeUntil = now;
    if (ph.slide) ph.slideUntil = now;
    if (ph.endsAt != null) ph.endsAt = now;
  });
}

export { addDemoBots } from "./demobots";

/** Demo party only: jump straight to the party-photo part of a break (skipping the current set for the demo). */
export function demoJumpToPhotos(partyId: string, actor: string, now = Date.now()) {
  if (partyId !== "demo") throw new EngineError("invalid", "Only available on the demo party.", 403);
  return withParty(partyId, actor, "demo.photos", {}, now, async (q, p) => {
    if (p.status !== "running") throw new EngineError("invalid", "Press Start on the demo party first.", 409);
    const n = (await q.query(`SELECT count(*)::int AS n FROM album_photo WHERE party_id=$1 AND status='published'`, [partyId]))[0]?.n ?? 0;
    if (!n) throw new EngineError("invalid", "No party photos yet — tap “Add sample party photos” or upload some from your phone.", 409);
    if (p.phase.setId && ["intro", "question", "reveal"].includes(p.phase.kind)) await invalidateSetRow(q, partyId, p.phase.setId, "skipped", actor);
    const s = settingsOf(p.settings);
    p.phase = { kind: "interval", startsAt: now - s.intervalTributeMs, endsAt: now + Math.max(120_000, s.intervalMs - s.intervalTributeMs), tribute: null, slide: null };
  });
}

/**
 * After Dark toggle (settings.afterDark). Applies to the next question chosen: an already planned after-dark
 * question is swapped before it opens when switched off; never changes a question mid-way.
 */
export function setAfterDark(partyId: string, actor: string, on: boolean, now = Date.now()) {
  return withParty<{ afterDark: boolean }>(partyId, actor, "after_dark", { on: !!on }, now, async (_q, p) => {
    p.settings = { ...p.settings, afterDark: !!on };
    return { afterDark: !!on };
  });
}
