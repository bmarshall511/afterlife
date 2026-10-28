import { adminRoute, body } from "@/server/admin/route";
import { callControl } from "@/server/admin/engine";
import { HttpError, json, parseParty } from "@/server/tributes/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = adminRoute(async (req, { db }) => {
  const party = parseParty(new URL(req.url).searchParams.get("party"));
  const teams = await db.query(
    `SELECT t.id, t.name, t.color, t.avatar, t.status, t.captain_member_id, t.created_at, t.away_since,
            COALESCE((SELECT SUM(points) FROM score_ledger s WHERE s.team_id = t.id AND s.kind <> 'question'), 0)::int AS adjustments
     FROM team t WHERE t.party_id = $1 AND t.status IN ('active','away') ORDER BY t.created_at`,
    [party],
  );
  const members = await db.query(
    "SELECT id, team_id, display_name, last_seen FROM member WHERE party_id = $1 ORDER BY created_at",
    [party],
  );
  let standings: unknown[] | null = null;
  try {
    standings = (await callControl("computeStandings", db, party)) as unknown[];
  } catch {
    standings = null;
  }
  const auditRows = await db.query(
    "SELECT id, actor, action, detail, at FROM audit WHERE party_id = $1 AND action NOT LIKE 'tribute.%' ORDER BY id DESC LIMIT 100",
    [party],
  );
  const now = Date.now();
  return json({
    teams: teams.map((t) => {
      const ms = members.filter((m) => m.team_id === t.id);
      const lastSeen = ms.reduce((a, m) => Math.max(a, new Date(m.last_seen).getTime()), 0);
      return {
        id: t.id, name: t.name, color: t.color, avatar: t.avatar, status: t.status,
        captainMemberId: t.captain_member_id, adjustments: t.adjustments,
        lastSeen: lastSeen ? new Date(lastSeen).toISOString() : null,
        connected: ms.filter((m) => now - new Date(m.last_seen).getTime() < 30000).length,
        members: ms.map((m) => ({ id: m.id, name: m.display_name, lastSeen: new Date(m.last_seen).toISOString() })),
      };
    }),
    standings,
    audit: auditRows,
  });
});

export const POST = adminRoute(async (req, { admin }) => {
  const b = await body(req);
  const party = parseParty(b.party);
  const actor = admin.actor;
  const teamId = String(b.teamId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(teamId)) throw new HttpError(400, "invalid", "Missing team.");
  let result: unknown;
  switch (b.action) {
    case "rename": {
      const name = String(b.name ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 40);
      if (!name) throw new HttpError(400, "invalid", "Name required.");
      result = await callControl("renameTeam", party, teamId, name, actor);
      break;
    }
    case "merge": {
      if (b.confirm !== true) throw new HttpError(400, "confirm_required", "Please confirm the merge.");
      const into = String(b.intoId ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(into) || into === teamId) throw new HttpError(400, "invalid", "Choose a different team to merge into.");
      result = await callControl("mergeTeams", party, teamId, into, actor);
      break;
    }
    case "captain":
      result = await callControl("setCaptain", party, teamId, String(b.memberId ?? ""), actor);
      break;
    case "remove":
      if (b.confirm !== true) throw new HttpError(400, "confirm_required", "Please confirm removing this team.");
      result = await callControl("removeTeam", party, teamId, actor);
      break;
    case "status":
      if (b.status !== "active" && b.status !== "away") throw new HttpError(400, "invalid", "Status must be active or away.");
      result = await callControl("setTeamStatus", party, teamId, b.status, actor);
      break;
    case "adjust": {
      const points = Math.round(Number(b.points));
      const reason = String(b.reason ?? "").trim().slice(0, 200);
      if (!Number.isFinite(points) || points === 0 || Math.abs(points) > 10000) throw new HttpError(400, "invalid", "Enter a non-zero point adjustment.");
      if (reason.length < 3) throw new HttpError(400, "reason_required", "A reason is required for score adjustments.");
      result = await callControl("adjustScore", party, teamId, points, reason, actor);
      break;
    }
    default:
      throw new HttpError(400, "invalid", "Unknown action.");
  }
  return json({ ok: true, result: result ?? null });
});
