import { createHash } from "node:crypto";
import type { Q } from "@/server/db";
import type { AnswerValue, QuestionOption, BackdropState, InputSpec, MeView, PublicPhase, PublicQuestion, RevealInfo, SetResult, Snapshot, Stage, StandingRow, TeamSummary } from "@/shared/types";
import { content } from "./deps";
import { settingsOf } from "./settings";
import { asIds, loadParty } from "./store";
import type { ContentItem, PartyRow, StoredOutcome, VoteEntry } from "./types";
import { isWatchStage, lastStage, questionMax } from "./stages";
import { caseLockedTeams, entryId } from "./tick";
import { ms } from "./rng";

/**
 * Standings: total = sum of best five ranked scores from complete sets + admin adjustments.
 * qualified = >=5 ranked sets; competition rank (1,1,3) among qualified; ties ordered by name (display only).
 */
export async function computeStandings(q: Q, partyId: string): Promise<StandingRow[]> {
  const teams = await q.query(`SELECT id, name, color, avatar FROM team WHERE party_id=$1 AND status IN ('active','away')`, [partyId]);
  const scores = await q.query(
    `SELECT ss.team_id, ss.score FROM set_score ss JOIN game_set gs ON gs.id=ss.set_id
      WHERE ss.party_id=$1 AND ss.ranked AND gs.status='complete'`,
    [partyId],
  );
  const adj = await q.query(`SELECT team_id, SUM(points)::int AS pts FROM score_ledger WHERE party_id=$1 AND kind='adjust' GROUP BY team_id`, [partyId]);
  const byTeam = new Map<string, number[]>();
  for (const r of scores) (byTeam.get(r.team_id) ?? byTeam.set(r.team_id, []).get(r.team_id)!).push(Number(r.score));
  const adjM = new Map(adj.map((r) => [r.team_id as string, Number(r.pts)]));
  const rows: StandingRow[] = teams.map((t) => {
    const all = (byTeam.get(t.id) ?? []).sort((a, b) => b - a);
    const best = all.slice(0, 5);
    return {
      teamId: t.id,
      name: t.name,
      color: t.color,
      avatar: t.avatar,
      total: best.reduce((a, b) => a + b, 0) + (adjM.get(t.id) ?? 0),
      setsCounted: best.length,
      qualified: all.length >= 5,
      rank: null,
    };
  });
  const byName = (a: StandingRow, b: StandingRow) => a.name.localeCompare(b.name) || a.teamId.localeCompare(b.teamId);
  const qual = rows.filter((r) => r.qualified).sort((a, b) => b.total - a.total || byName(a, b));
  qual.forEach((r, i) => (r.rank = i > 0 && qual[i - 1].total === r.total ? qual[i - 1].rank : i + 1));
  const prov = rows.filter((r) => !r.qualified).sort((a, b) => b.setsCounted - a.setsCounted || b.total - a.total || byName(a, b));
  return [...qual, ...prov];
}

/** Guest-facing wording for internal void codes (never show raw codes on the TV or phones). */
const VOID_TEXT: Record<string, string> = {
  too_few_answers: "Not enough families answered, so this one doesn't count.",
  too_few_entries: "Not enough epitaphs were written, so this one doesn't count.",
  outage: "We lost connection for a moment, so this doesn't count for anyone.",
  skipped: "The host skipped this one, so it doesn't count for anyone.",
  insufficient_teams: "Not enough families for this game, so it doesn't count.",
  ended: "The party ended before this finished.",
};

export function backdropOf(kind: string): BackdropState {
  return kind === "question" || kind === "reveal" ? "violet" : kind === "results" ? "magenta" : "amber";
}

export function publicPhase(p: PartyRow): PublicPhase {
  const ph = p.phase;
  const out: PublicPhase = { kind: ph.kind, startsAt: ph.startsAt ?? 0, endsAt: p.status === "paused" ? null : ph.endsAt ?? null };
  if (ph.setId) Object.assign(out, { setId: ph.setId, setSeq: ph.setSeq, family: ph.family });
  if (ph.qIndex != null) out.qIndex = ph.qIndex;
  if (ph.stage && ph.kind === "question") out.stage = ph.stage;
  if (ph.kind === "interval" || ph.kind === "ambient") { out.tribute = ph.tribute ?? null; out.slide = ph.tribute ? null : ph.slide ?? null; }
  if (p.engine?.encore) out.encore = true;
  if (ph.doubled && ph.setId) out.doubled = true;
  return out;
}

/** InputSpec of a stage (engine-owned parts: calavera vote list, room guess fallback). */
export async function stageInput(q: Q, _p: PartyRow, qid: string, qrow: { idx?: unknown; private?: any }, stage: Stage): Promise<InputSpec | null> {
  const item = qrow.private?.item as ContentItem | undefined;
  if (!item) return null;
  if (item.family === "calavera" && stage === "vote") return { kind: "vote", entries: await voteList(q, qid, qrow.private) };
  const c = await content();
  let input: InputSpec | null = null;
  try {
    input = c.publicQuestion(item, { stage, round: Number(qrow.idx), index: Number(qrow.idx) }).input ?? null;
  } catch {
    input = null;
  }
  if (item.family === "room" && stage === "guess") {
    // Carry the answer options into the guess stage so a reloaded phone/TV can still name each team's pick.
    let options: QuestionOption[] = [];
    try {
      const a = c.publicQuestion(item, { stage: "answer", round: Number(qrow.idx), index: Number(qrow.idx) }).input;
      if (a?.kind === "choice") options = a.options;
    } catch { /* ignore */ }
    input = { kind: "percent", optionText: input?.kind === "percent" && input.optionText ? input.optionText : "your answer", options };
  }
  if (isWatchStage(item.family, stage)) input = null;
  return input;
}

async function hiddenWrites(q: Q, qid: string): Promise<Set<string>> {
  return new Set((await q.query(`SELECT id FROM answer WHERE question_id=$1 AND kind='write' AND hidden`, [qid])).map((r) => r.id as string));
}

/** Public calavera vote list: text only, no authors; hidden entries removed. */
async function voteList(q: Q, qid: string, priv: any): Promise<{ id: string; text: string }[]> {
  const hidden = await hiddenWrites(q, qid);
  return ((priv?.voteEntries ?? []) as VoteEntry[]).filter((e) => !e.answerId || !hidden.has(e.answerId)).map((e) => ({ id: e.id, text: e.text }));
}

async function teamNames(q: Q, partyId: string): Promise<Map<string, string>> {
  const r = await q.query(`SELECT id, name FROM team WHERE party_id=$1 AND status IN ('active','away')`, [partyId]);
  return new Map(r.map((t) => [t.id as string, t.name as string]));
}

async function questionView(q: Q, p: PartyRow): Promise<{ question: PublicQuestion | null; reveal: RevealInfo | null }> {
  const ph = p.phase;
  if (!ph.questionId || (ph.kind !== "question" && ph.kind !== "reveal")) return { question: null, reveal: null };
  const row = (await q.query(`SELECT idx, private, status, void_reason FROM question WHERE id=$1`, [ph.questionId]))[0];
  if (!row?.private?.item) return { question: null, reveal: null };
  const c = await content();
  const item = row.private.item as ContentItem;
  const stage = ph.kind === "question" ? ph.stage! : lastStage(item.family);
  const pq = c.publicQuestion(item, { stage, round: row.idx, index: row.idx });
  const question: PublicQuestion = { ...pq, id: ph.questionId, family: item.family, index: row.idx, difficulty: item.difficulty };
  question.input = ph.kind === "question" ? await stageInput(q, p, ph.questionId, row, stage) : null;
  // Scene seeds can embed content ids; send only an opaque hash to clients.
  if (question.scene) question.scene = { ...question.scene, seed: createHash("sha256").update(String(question.scene.seed)).digest("hex").slice(0, 12) };
  if (ph.kind !== "reveal") return { question, reveal: null };
  const priv = row.private;
  const names = await teamNames(q, p.id);
  const outcomes = ((priv.outcomes ?? []) as StoredOutcome[])
    .filter((o) => names.has(o.teamId))
    .map((o) => ({ teamId: o.teamId, name: names.get(o.teamId)!, points: o.points, value: o.value ?? null, ...(o.note ? { note: o.note } : {}) }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  let reveal: RevealInfo;
  const extra: Record<string, unknown> = { ...(priv.revealDetail ?? {}) };
  if (Array.isArray(extra.entries)) extra.entries = (extra.entries as any[]).map((e) => ({ ...e, teamName: e.teamId ? names.get(e.teamId) ?? null : null }));
  if (item.family === "room" && !extra.split && priv.tally) extra.split = priv.tally;
  if (item.family === "room") {
    if (!extra.counts && extra.split) extra.counts = extra.split;
    if (Array.isArray(extra.guesses)) extra.guesses = (extra.guesses as any[]).filter((g) => names.has(g.teamId)).map((g) => ({ ...g, name: names.get(g.teamId) }));
  }
  if (item.family === "case" && row.idx < 2) {
    // Never the solution before the final round.
    reveal = { correct: null, explanation: "", source: null, detail: extra, outcomes };
  } else {
    const base = priv.reveal ?? { correct: null, explanation: "" };
    reveal = { ...base, detail: { ...(base.detail ?? {}), ...extra }, outcomes };
  }
  // Screens expect lettered options for the room split.
  if (item.family === "room" && Array.isArray(reveal.detail?.options))
    reveal.detail!.options = (reveal.detail!.options as unknown[]).map((o, k) => (typeof o === "string" ? { label: "ABCDEFGHIJKL"[k], text: o } : o));
  if (item.family === "room") reveal.correct = null;
  if (row.status === "void") {
    reveal.void = true;
    reveal.voidReason = VOID_TEXT[row.void_reason as string] ?? "This one doesn't count.";
    reveal.correct = item.family === "case" && row.idx < 2 ? null : reveal.correct;
    if (item.family === "room" || item.family === "calavera") reveal.correct = null;
  }
  return { question, reveal };
}

async function lastSetResult(q: Q, setId: string): Promise<SetResult | null> {
  const set = (await q.query(`SELECT family FROM game_set WHERE id=$1`, [setId]))[0];
  if (!set) return null;
  const rows = await q.query(
    `SELECT ss.team_id, t.name, ss.score, ss.ranked, ss.perfect FROM set_score ss JOIN team t ON t.id=ss.team_id
      WHERE ss.set_id=$1 AND t.status IN ('active','away') ORDER BY ss.score DESC, t.name`,
    [setId],
  );
  const scores = rows.map((r) => ({ teamId: r.team_id, name: r.name, score: Number(r.score), ranked: r.ranked, perfect: r.perfect }));
  const pool = scores.some((s) => s.ranked) ? scores.filter((s) => s.ranked) : scores;
  const top = Math.max(0, ...pool.map((s) => s.score));
  return { setId, family: set.family, scores, winners: top > 0 ? pool.filter((s) => s.score === top).map((s) => s.teamId) : [] };
}

async function stageCounts(q: Q, p: PartyRow): Promise<{ answered: number; eligible: number }> {
  const ph = p.phase;
  if (!ph.setId) return { answered: 0, eligible: 0 };
  const set = (await q.query(`SELECT eligible FROM game_set WHERE id=$1`, [ph.setId]))[0];
  const eligible = set ? asIds(set.eligible).length : 0;
  if (ph.kind !== "question" || !ph.stage || !ph.family || isWatchStage(ph.family, ph.stage)) return { answered: 0, eligible };
  const r =
    ph.family === "case"
      ? await q.query(`SELECT COUNT(*)::int AS n FROM answer a JOIN question qq ON qq.id=a.question_id WHERE qq.set_id=$1 AND a.kind='answer'`, [ph.setId])
      : await q.query(`SELECT COUNT(*)::int AS n FROM answer WHERE question_id=$1 AND kind=$2`, [ph.questionId, ph.stage]);
  return { answered: Number(r[0].n), eligible };
}

export async function teamSummaries(q: Q, partyId: string): Promise<TeamSummary[]> {
  const r = await q.query(`SELECT id, name, color, avatar, status FROM team WHERE party_id=$1 AND status IN ('active','away') ORDER BY name, id`, [partyId]);
  return r.map((t) => ({ id: t.id, name: t.name, color: t.color, avatar: t.avatar, status: t.status }));
}

export async function buildSnapshot(q: Q, partyId: string, now: number, _audience: "tv" | "phone" = "phone"): Promise<Snapshot> {
  const p = await loadParty(q, partyId, false);
  const s = settingsOf(p.settings);
  const [qv, counts, standings, teams] = await Promise.all([questionView(q, p), stageCounts(q, p), computeStandings(q, partyId), teamSummaries(q, partyId)]);
  return {
    party: p.id,
    version: p.version,
    serverNow: now,
    status: p.status,
    mode: p.mode,
    backdrop: backdropOf(p.phase.kind),
    phase: publicPhase(p),
    question: qv.question,
    reveal: qv.reveal,
    answeredCount: counts.answered,
    eligibleCount: counts.eligible,
    standings,
    lastSet: p.phase.kind === "results" && p.phase.setId ? await lastSetResult(q, p.phase.setId) : null,
    teams,
    joinUrl: s.joinUrl + (partyId === "demo" ? (s.joinUrl.includes("?") ? "&" : "?") + "party=demo" : ""),
    appName: s.appName,
  };
}

export async function buildMe(q: Q, partyId: string, memberId: string, now: number): Promise<MeView> {
  const m = (await q.query(`SELECT id, display_name, team_id FROM member WHERE id=$1 AND party_id=$2`, [memberId, partyId]))[0];
  const t = (await q.query(`SELECT id, name, color, avatar, status, invite_code, captain_member_id, created_at FROM team WHERE id=$1`, [m.team_id]))[0];
  const cap = t.captain_member_id ? (await q.query(`SELECT display_name FROM member WHERE id=$1`, [t.captain_member_id]))[0] : null;
  const cnt = (await q.query(`SELECT COUNT(*)::int AS n FROM member WHERE team_id=$1`, [t.id]))[0].n;
  const p = await loadParty(q, partyId, false);
  const ph = p.phase;
  const isCaptain = t.captain_member_id === m.id;
  const current: MeView["current"] = { questionId: null, stage: null, canSubmit: false, saved: null, prior: null, ranked: true };
  if (ph.setId) {
    const set = (await q.query(`SELECT eligible FROM game_set WHERE id=$1`, [ph.setId]))[0];
    current.ranked = ph.kind === "intro" ? true : asIds(set?.eligible).includes(t.id);
  }
  if ((ph.kind === "question" || ph.kind === "reveal") && ph.questionId && ph.family) {
    const f = ph.family;
    current.questionId = ph.questionId;
    current.stage = ph.kind === "question" ? ph.stage ?? null : null;
    const qrow = (await q.query(`SELECT opened_at, status, idx, private FROM question WHERE id=$1`, [ph.questionId]))[0];
    const ans = await q.query(`SELECT id, kind, value FROM answer WHERE question_id=$1 AND team_id=$2`, [ph.questionId, t.id]);
    const stage = ph.kind === "question" ? ph.stage! : lastStage(f);
    const saved = ans.find((a) => a.kind === stage);
    current.saved = saved ? { stage, value: saved.value as AnswerValue } : null;
    let caseLock: { idx: number; value: AnswerValue } | undefined;
    if (f === "room" && stage === "guess") {
      const a = ans.find((x) => x.kind === "answer");
      current.prior = a ? { stage: "answer", value: a.value } : null;
    } else if (f === "case") {
      caseLock = (await caseLockedTeams(q, ph.setId!)).get(t.id);
      if (caseLock && caseLock.idx < qrow.idx) current.prior = { stage: "answer", value: caseLock.value };
    }
    if (f === "calavera") {
      const w = ans.find((x) => x.kind === "write");
      current.ownEntryId = w ? entryId(ph.questionId, w.id) : null;
    }
    const late = ms(t.created_at) > ms(qrow.opened_at);
    if (ph.kind !== "question" || p.status !== "running" || (ph.endsAt ?? 0) <= now) current.reasonCannot = "closed";
    else if (isWatchStage(f, stage)) current.reasonCannot = "watching";
    else if (t.status === "away") current.reasonCannot = "away";
    else if (late) current.reasonCannot = "late_join";
    else if (!isCaptain) current.reasonCannot = "not_captain";
    else if (f === "room" && stage === "guess" && !current.prior) current.reasonCannot = "need_answer";
    else if (f === "case" && caseLock && caseLock.idx < qrow.idx) current.reasonCannot = "already_locked";
    current.canSubmit = !current.reasonCannot && !current.saved;
    if (ph.kind === "reveal") {
      const set = (await q.query(`SELECT doubled FROM game_set WHERE id=$1`, [ph.setId]))[0];
      const mult = set?.doubled ? 2 : 1;
      const o = ((qrow.private?.outcomes ?? []) as StoredOutcome[]).find((x) => x.teamId === t.id);
      const max = questionMax(f, qrow.idx) * mult;
      if (qrow.status === "void") current.result = { points: 0, max: 0, note: "void" };
      else if (o) current.result = { points: o.points, max, ...(o.note ? { note: o.note } : {}) };
      else current.result = null;
    }
  }
  const hist = await q.query(
    `SELECT ss.set_id, gs.seq, gs.family, gs.doubled, ss.score, ss.ranked, gs.status FROM set_score ss JOIN game_set gs ON gs.id=ss.set_id
      WHERE ss.team_id=$1 ORDER BY gs.seq`,
    [t.id],
  );
  const countable = hist.filter((h) => h.ranked && h.status === "complete").sort((a, b) => Number(b.score) - Number(a.score) || a.seq - b.seq);
  const counted = new Set(countable.slice(0, 5).map((h) => h.set_id));
  const standing = (await computeStandings(q, partyId)).find((r) => r.teamId === t.id);
  return {
    member: { id: m.id, name: m.display_name, isCaptain },
    team: { id: t.id, name: t.name, color: t.color, avatar: t.avatar, status: t.status === "away" ? "away" : "active", inviteCode: t.invite_code, captainName: cap?.display_name ?? null, memberCount: Number(cnt) },
    current,
    history: hist.map((h) => ({
      setId: h.set_id, seq: h.seq, family: h.family, score: Number(h.score), max: h.doubled ? 600 : 300, ranked: h.ranked,
      counted: counted.has(h.set_id), doubled: !!h.doubled, invalidated: h.status === "invalidated",
    })),
    total: standing?.total ?? 0,
    setsCounted: standing?.setsCounted ?? 0,
  };
}
