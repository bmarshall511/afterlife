import { createHash, randomInt, randomUUID } from "node:crypto";
import type { Q } from "@/server/db";
import type { AnswerValue, MeView, Stage } from "@/shared/types";
import { hashSecret, newSecret } from "@/server/session";
import { db } from "./deps";
import { iso, ms } from "./rng";
import { buildMe, stageInput } from "./snapshot";
import { isWatchStage } from "./stages";
import { isFiltered } from "./wordfilter";
import { cleanText, sameValue, validateValue } from "./validate";
import { audit, loadParty, saveParty } from "./store";
import { advance, caseLockedTeams, entryId, maybeEarlyClose, tick } from "./tick";
import { EngineError } from "./types";

export const TEAM_COLORS = ["#F2A33A", "#E0457B", "#8E5BD9", "#2FA39A", "#E8623A", "#4F7FE0", "#C9A227", "#D94FB0", "#5BB85B", "#B5532F", "#3FB6D9", "#A66CE0"];
export const TEAM_AVATARS = ["calavera", "marigold", "candle", "papel-picado", "catrina", "alebrije", "pan-de-muerto", "butterfly", "sugar-skull", "xolo", "hummingbird", "guitar"];
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function pickByHash(s: string, arr: string[]) {
  return arr[createHash("sha256").update(s).digest().readUInt32LE(0) % arr.length];
}

export interface JoinInput {
  name: unknown;
  teamName?: unknown;
  inviteCode?: unknown;
  /** Join an existing team picked from the "Already playing?" list. */
  teamId?: unknown;
  /** Get back in as a person already on that team (new device). If they were captain, this device becomes captain. */
  asMemberId?: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public "Already playing?" list for the join page: team names and the people on them. No invite codes. */
export async function listTeamsForRejoin(partyId: string) {
  const d = await db();
  const teams = await d.query(
    `SELECT id, name, color, avatar, captain_member_id FROM team WHERE party_id=$1 AND status IN ('active','away') AND NOT bot ORDER BY lower(name)`,
    [partyId],
  );
  const members = await d.query(
    `SELECT id, team_id, display_name, last_seen FROM member WHERE party_id=$1 ORDER BY last_seen DESC`,
    [partyId],
  );
  return teams.map((t) => {
    const seen = new Set<string>();
    const people: { memberId: string; name: string; captain: boolean }[] = [];
    // newest session per name first, so the captain's current row wins
    for (const m of members.filter((m) => m.team_id === t.id)) {
      const key = String(m.display_name).toLowerCase();
      const captain = m.id === t.captain_member_id;
      const i = people.findIndex((p) => p.name.toLowerCase() === key);
      if (i >= 0) { if (captain) people[i] = { memberId: m.id, name: m.display_name, captain }; continue; }
      if (seen.has(key)) continue;
      seen.add(key);
      people.push({ memberId: m.id, name: m.display_name, captain });
    }
    return { id: t.id as string, name: t.name as string, color: t.color as string, avatar: t.avatar as string, people };
  });
}

/** Join: new team (no inviteCode) or existing team by invite code. Returns the session secret to set as cookie. */
export async function join(partyId: string, input: JoinInput, now: number = Date.now()): Promise<{ secret: string; me: MeView }> {
  let name = cleanText(input.name, 40);
  const code = cleanText(input.inviteCode, 12).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const pickTeam = typeof input.teamId === "string" && UUID.test(input.teamId) ? input.teamId : null;
  const asMember = typeof input.asMemberId === "string" && UUID.test(input.asMemberId) ? input.asMemberId : null;
  if (!name && !asMember) throw new EngineError("invalid", "Please enter your name", 400);
  const d = await db();
  const secret = newSecret();
  const memberId = randomUUID();
  await d.tx(async (q) => {
    let teamId: string;
    if (pickTeam) {
      const t = (await q.query(`SELECT id, captain_member_id, status, bot FROM team WHERE party_id=$1 AND id=$2`, [partyId, pickTeam]))[0];
      if (!t || t.bot || (t.status !== "active" && t.status !== "away")) throw new EngineError("invalid", "That team isn't playing any more", 404);
      teamId = t.id;
      let takeCaptain = !t.captain_member_id;
      if (asMember) {
        const m = (await q.query(`SELECT id, display_name FROM member WHERE id=$1 AND team_id=$2`, [asMember, teamId]))[0];
        if (!m) throw new EngineError("invalid", "That person isn't on this team", 404);
        name = m.display_name;
        // Back in on a new phone: if they were the captain, this phone takes over (the old one stops submitting).
        if (t.captain_member_id === m.id) takeCaptain = true;
      }
      await q.query(`INSERT INTO member (id, party_id, team_id, display_name, session_hash, last_seen, created_at) VALUES ($1,$2,$3,$4,$5,$6,$6)`, [memberId, partyId, teamId, name, hashSecret(secret), iso(now)]);
      if (takeCaptain) await q.query(`UPDATE team SET captain_member_id=$2 WHERE id=$1`, [teamId, memberId]);
      await q.query(`INSERT INTO audit (party_id, actor, action, detail) VALUES ($1,'guest','rejoin',$2)`, [partyId, JSON.stringify({ teamId, asMember, captain: takeCaptain })]);
    } else if (code) {
      const t = (await q.query(`SELECT id, captain_member_id, status FROM team WHERE party_id=$1 AND invite_code=$2`, [partyId, code]))[0];
      if (!t || (t.status !== "active" && t.status !== "away")) throw new EngineError("invalid", "That team code wasn't found", 404);
      teamId = t.id;
      await q.query(`INSERT INTO member (id, party_id, team_id, display_name, session_hash, last_seen, created_at) VALUES ($1,$2,$3,$4,$5,$6,$6)`, [memberId, partyId, teamId, name, hashSecret(secret), iso(now)]);
      if (!t.captain_member_id) await q.query(`UPDATE team SET captain_member_id=$2 WHERE id=$1`, [teamId, memberId]);
    } else {
      teamId = randomUUID();
      let teamName = cleanText(input.teamName, 40) || `${name}'s Family`;
      const dup = await q.query(`SELECT 1 FROM team WHERE party_id=$1 AND lower(name)=lower($2) AND status IN ('active','away')`, [partyId, teamName]);
      if (dup.length) teamName = `${teamName} ${randomInt(2, 99)}`.slice(0, 44);
      for (let attempt = 0; ; attempt++) {
        const invite = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
        const ok = await q.query(
          `INSERT INTO team (id, party_id, name, color, avatar, invite_code, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,'active',$7)
           ON CONFLICT (party_id, invite_code) DO NOTHING RETURNING id`,
          [teamId, partyId, teamName, pickByHash(teamId + "c", TEAM_COLORS), pickByHash(teamId + "a", TEAM_AVATARS), invite, iso(now)],
        );
        if (ok.length) break;
        if (attempt > 8) throw new EngineError("server", "could not allocate invite code", 500);
      }
      await q.query(`INSERT INTO member (id, party_id, team_id, display_name, session_hash, last_seen, created_at) VALUES ($1,$2,$3,$4,$5,$6,$6)`, [memberId, partyId, teamId, name, hashSecret(secret), iso(now)]);
      await q.query(`UPDATE team SET captain_member_id=$2 WHERE id=$1`, [teamId, memberId]);
    }
    await bump(q, partyId);
  });
  return { secret, me: await buildMe(d, partyId, memberId, now) };
}

async function bump(q: Q, partyId: string) {
  await q.query(`UPDATE party SET version = version + 1 WHERE id=$1`, [partyId]);
}

export interface AnswerInput {
  questionId: unknown;
  stage: unknown;
  value: unknown;
  requestId?: unknown;
}

const STAGE_SET = new Set<Stage>(["write", "vote", "answer", "guess", "clue"]);

/**
 * Captain submits for the current stage. All validation is server-side against server time and the stage's
 * InputSpec. One answer per team per stage (answer.kind = stage), locked on submit.
 * Idempotent: a retry with the same value or the same requestId returns ok; a different value → `already`.
 * Codes: invalid | closed | not_captain | away | late_join | already | need_answer | already_locked | filtered | self_vote.
 */
export async function submitAnswer(partyId: string, memberId: string, input: AnswerInput, now: number = Date.now()) {
  const stage = String(input.stage ?? "") as Stage;
  const questionId = typeof input.questionId === "string" ? input.questionId : "";
  const requestId = typeof input.requestId === "string" ? input.requestId.slice(0, 80) : null;
  if (!STAGE_SET.has(stage) || !/^[0-9a-f-]{36}$/i.test(questionId) || input.value === undefined) throw new EngineError("invalid", "invalid submission", 400);
  await tick(partyId, now);
  const d = await db();
  return d.tx(async (q) => {
    const p = await loadParty(q, partyId, true);
    const m = (await q.query(`SELECT m.id, m.team_id, t.captain_member_id, t.status, t.created_at FROM member m JOIN team t ON t.id=m.team_id WHERE m.id=$1 AND m.party_id=$2`, [memberId, partyId]))[0];
    if (!m || (m.status !== "active" && m.status !== "away")) throw new EngineError("invalid", "not a team member", 401);
    await q.query(`UPDATE member SET last_seen=$2 WHERE id=$1`, [memberId, iso(now)]);
    const existing = (await q.query(`SELECT value, request_id FROM answer WHERE question_id=$1 AND team_id=$2 AND kind=$3`, [questionId, m.team_id, stage]))[0];
    if (existing) {
      if (sameValue(existing.value, input.value) || (requestId && existing.request_id === requestId)) return { ok: true, saved: { stage, value: existing.value as AnswerValue } };
      throw new EngineError("already", "Your team's answer is already locked", 409);
    }
    if (m.captain_member_id !== memberId) throw new EngineError("not_captain", "Only the team captain can submit", 403);
    if (m.status === "away") throw new EngineError("away", "Your team is marked away", 409);
    const ph = p.phase;
    if (p.status !== "running" || ph.kind !== "question" || ph.questionId !== questionId || ph.stage !== stage || ph.endsAt == null || now >= ph.endsAt || now < (ph.stageStartsAt ?? ph.startsAt))
      throw new EngineError("closed", "This question is closed", 409);
    if (isWatchStage(ph.family!, stage)) throw new EngineError("invalid", "Nothing to submit right now - watch the TV", 400);
    const qrow = (await q.query(`SELECT opened_at, idx, private FROM question WHERE id=$1`, [questionId]))[0];
    if (ms(m.created_at) > ms(qrow.opened_at)) throw new EngineError("late_join", "You'll join in from the next question", 409);
    if (ph.family === "room" && stage === "guess") {
      const a = await q.query(`SELECT 1 FROM answer WHERE question_id=$1 AND team_id=$2 AND kind='answer'`, [questionId, m.team_id]);
      if (!a.length) throw new EngineError("need_answer", "Your team needs to answer first", 409);
    }
    if (ph.family === "case" && stage === "answer") {
      const locked = await caseLockedTeams(q, ph.setId!);
      if (locked.has(m.team_id)) throw new EngineError("already_locked", "Your team already locked its answer for this case", 409);
    }
    const spec = await stageInput(q, p, questionId, qrow, stage);
    if (!spec) throw new EngineError("invalid", "Nothing to submit right now", 400);
    let value = validateValue(spec, input.value);
    if (ph.family === "calavera" && stage === "vote") {
      const own = (await q.query(`SELECT id FROM answer WHERE question_id=$1 AND team_id=$2 AND kind='write'`, [questionId, m.team_id]))[0];
      if (own && entryId(questionId, own.id) === value) throw new EngineError("self_vote", "You can't vote for your own verse", 409);
    }
    if (ph.family === "fib" && stage === "vote" && qrow.private?.featured?.teamId === m.team_id)
      throw new EngineError("self_vote", "Your family is on the TV — others are guessing", 409);
    if (spec.kind === "fib" && (value as { statements: string[] }).statements.some((x) => isFiltered(x))) throw new EngineError("filtered", "Keep it family-friendly", 422);
    if (spec.kind === "text" && isFiltered(value as string)) throw new EngineError("filtered", "Keep it family-friendly", 422);
    const ins = await q.query(
      `INSERT INTO answer (id, party_id, question_id, team_id, member_id, kind, choice, value, request_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,$8,$9)
       ON CONFLICT (question_id, team_id, kind) DO NOTHING RETURNING id`,
      [randomUUID(), partyId, questionId, m.team_id, memberId, stage, JSON.stringify(value), requestId, iso(now)],
    );
    if (!ins.length) throw new EngineError("already", "Your team's answer is already locked", 409);
    await maybeEarlyClose(q, p, now);
    await advance(q, p, now);
    await saveParty(q, p);
    value = value as AnswerValue;
    return { ok: true, saved: { stage, value } };
  });
}

/** Team actions: away | resume | claim_captain (requires confirm:true) | rename. */
export async function teamAction(partyId: string, memberId: string, input: Record<string, unknown>, now: number = Date.now()) {
  const action = String(input.action ?? "");
  const d = await db();
  await d.tx(async (q) => {
    const m = (await q.query(`SELECT m.id, m.team_id, m.display_name, t.captain_member_id, t.status FROM member m JOIN team t ON t.id=m.team_id WHERE m.id=$1 AND m.party_id=$2 FOR UPDATE`, [memberId, partyId]))[0];
    if (!m) throw new EngineError("invalid", "not a team member", 401);
    switch (action) {
      case "away":
        await q.query(`UPDATE team SET status='away', away_since=$2 WHERE id=$1 AND status='active'`, [m.team_id, iso(now)]);
        break;
      case "resume":
        await q.query(`UPDATE team SET status='active', away_since=NULL WHERE id=$1 AND status='away'`, [m.team_id]);
        break;
      case "claim_captain":
        if (input.confirm !== true) throw new EngineError("invalid", "confirmation required", 400);
        if (m.captain_member_id !== memberId) {
          await q.query(`UPDATE team SET captain_member_id=$2 WHERE id=$1`, [m.team_id, memberId]);
          await audit(q, partyId, `member:${memberId}`, "claim_captain", { teamId: m.team_id, from: m.captain_member_id });
        }
        break;
      case "rename": {
        const name = cleanText(input.name, 40);
        if (!name) throw new EngineError("invalid", "name required", 400);
        await q.query(`UPDATE team SET name=$2 WHERE id=$1`, [m.team_id, name]);
        await audit(q, partyId, `member:${memberId}`, "rename_team", { teamId: m.team_id, name });
        break;
      }
      default:
        throw new EngineError("invalid", "unknown action", 400);
    }
    await q.query(`UPDATE member SET last_seen=$2 WHERE id=$1`, [memberId, iso(now)]);
    await bump(q, partyId);
  });
  return buildMe(d, partyId, memberId, now);
}
