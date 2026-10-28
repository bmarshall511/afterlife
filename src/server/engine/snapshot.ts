import { createHash } from "node:crypto";
import type { Q } from "@/server/db";
import type { BackdropState, MeView, PublicPhase, PublicQuestion, RevealInfo, SetResult, Snapshot, StandingRow, TeamSummary } from "@/shared/types";
import { content } from "./deps";
import { settingsOf } from "./settings";
import { asIds, loadParty } from "./store";
import type { ContentItem, PartyRow } from "./types";
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

export function backdropOf(kind: string): BackdropState {
  return kind === "question" || kind === "reveal" ? "violet" : kind === "results" ? "magenta" : "amber";
}

export function publicPhase(p: PartyRow): PublicPhase {
  const ph = p.phase;
  const out: PublicPhase = { kind: ph.kind, startsAt: ph.startsAt ?? 0, endsAt: p.status === "paused" ? null : ph.endsAt ?? null };
  if (ph.setId) Object.assign(out, { setId: ph.setId, setSeq: ph.setSeq, family: ph.family });
  if (ph.qIndex != null) out.qIndex = ph.qIndex;
  if (ph.stage && ph.kind === "question") out.stage = ph.stage;
  if (ph.kind === "interval" || ph.kind === "ambient") out.tribute = ph.tribute ?? null;
  if (p.engine?.encore) out.encore = true;
  return out;
}

async function questionView(q: Q, p: PartyRow, now: number, audience: "tv" | "phone"): Promise<{ question: PublicQuestion | null; reveal: RevealInfo | null }> {
  const ph = p.phase;
  if (!ph.questionId || (ph.kind !== "question" && ph.kind !== "reveal")) return { question: null, reveal: null };
  const row = (await q.query(`SELECT idx, public, private, status, void_reason FROM question WHERE id=$1`, [ph.questionId]))[0];
  if (!row) return { question: null, reveal: null };
  const c = await content();
  const item = { ...(row.public as object), answer: null } as ContentItem;
  const stage = ph.kind === "question" ? ph.stage! : ph.family === "family" ? "predict" : "answer";
  const elapsed = now - (ph.kind === "question" ? ph.stageStartsAt ?? ph.startsAt : ph.startsAt);
  const pq = c.publicQuestion(item, { stage, elapsedMs: Math.max(0, elapsed), audience, index: row.idx });
  const question: PublicQuestion = { ...pq, id: ph.questionId, family: item.family, index: row.idx };
  // Scene seeds can embed content ids (e.g. "water:0"); send only an opaque hash to clients.
  if (question.scene) question.scene = { ...question.scene, seed: createHash("sha256").update(question.scene.seed).digest("hex").slice(0, 12) };
  if (ph.kind !== "reveal") return { question, reveal: null };
  const priv = row.private ?? {};
  const reveal: RevealInfo = { ...(priv.reveal ?? { explanation: "" }) };
  if (item.family === "family") {
    reveal.tallies = priv.prefTally ? { prefer: priv.prefTally, predict: priv.predTally ?? priv.prefTally.map(() => 0) } : null;
    reveal.correct = row.status === "void" ? null : priv.top ?? null;
  }
  if (row.status === "void") {
    reveal.void = true;
    reveal.voidReason = row.void_reason ?? "void";
    reveal.correct = null;
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
  if (ph.kind !== "question" || !ph.stage || ph.stage === "expose") return { answered: 0, eligible };
  const kind = ph.stage === "answer" ? "answer" : ph.stage;
  const r = await q.query(`SELECT COUNT(*)::int AS n FROM answer WHERE question_id=$1 AND kind=$2`, [ph.questionId, kind]);
  return { answered: Number(r[0].n), eligible };
}

export async function teamSummaries(q: Q, partyId: string): Promise<TeamSummary[]> {
  const r = await q.query(`SELECT id, name, color, avatar, status FROM team WHERE party_id=$1 AND status IN ('active','away') ORDER BY name, id`, [partyId]);
  return r.map((t) => ({ id: t.id, name: t.name, color: t.color, avatar: t.avatar, status: t.status }));
}

export async function buildSnapshot(q: Q, partyId: string, now: number, audience: "tv" | "phone" = "phone"): Promise<Snapshot> {
  const p = await loadParty(q, partyId, false);
  const s = settingsOf(p.settings);
  const [qv, counts, standings, teams] = await Promise.all([questionView(q, p, now, audience), stageCounts(q, p), computeStandings(q, partyId), teamSummaries(q, partyId)]);
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
  const current: MeView["current"] = { questionId: null, stage: null, canSubmit: false, saved: null, savedPrefer: null, ranked: true };
  if (ph.setId) {
    const set = (await q.query(`SELECT eligible FROM game_set WHERE id=$1`, [ph.setId]))[0];
    current.ranked = ph.kind === "intro" ? true : asIds(set?.eligible).includes(t.id);
  }
  if ((ph.kind === "question" || ph.kind === "reveal") && ph.questionId) {
    current.questionId = ph.questionId;
    current.stage = ph.kind === "question" ? ph.stage ?? null : null;
    const qrow = (await q.query(`SELECT opened_at, status FROM question WHERE id=$1`, [ph.questionId]))[0];
    const ans = await q.query(`SELECT kind, choice FROM answer WHERE question_id=$1 AND team_id=$2`, [ph.questionId, t.id]);
    const pref = ans.find((a) => a.kind === "prefer");
    current.savedPrefer = pref ? pref.choice : null;
    const kind = ph.stage === "prefer" ? "prefer" : ph.stage === "predict" ? "predict" : "answer";
    const saved = ph.kind === "question" ? ans.find((a) => a.kind === kind) : ans.find((a) => a.kind === (ph.family === "family" ? "predict" : "answer"));
    current.saved = saved ? { kind: saved.kind, choice: saved.choice } : null;
    const late = ms(t.created_at) > ms(qrow.opened_at);
    if (ph.kind !== "question" || p.status !== "running" || (ph.endsAt ?? 0) <= now) current.reasonCannot = "closed";
    else if (ph.stage === "expose") current.reasonCannot = "watching";
    else if (t.status === "away") current.reasonCannot = "away";
    else if (late) current.reasonCannot = "late_join";
    else if (!isCaptain) current.reasonCannot = "not_captain";
    else if (ph.stage === "predict" && !pref) current.reasonCannot = "need_preference";
    current.canSubmit = !current.reasonCannot && !current.saved;
    if (ph.kind === "reveal") {
      const l = (await q.query(`SELECT points FROM score_ledger WHERE question_id=$1 AND team_id=$2 AND kind='question'`, [ph.questionId, t.id]))[0];
      current.result = l ? { correct: Number(l.points) > 0, points: Number(l.points) } : qrow.status === "void" ? null : saved ? { correct: false, points: 0 } : null;
    }
  }
  const hist = await q.query(
    `SELECT ss.set_id, gs.seq, gs.family, ss.score, ss.ranked, ss.normalized, gs.status FROM set_score ss JOIN game_set gs ON gs.id=ss.set_id
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
    history: hist.map((h) => ({ setId: h.set_id, seq: h.seq, family: h.family, score: Number(h.score), ranked: h.ranked, counted: counted.has(h.set_id), normalized: h.normalized, invalidated: h.status === "invalidated" })),
    total: standing?.total ?? 0,
    setsCounted: standing?.setsCounted ?? 0,
  };
}
