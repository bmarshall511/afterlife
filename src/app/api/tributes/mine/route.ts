import { getDb } from "@/server/db";
import { HttpError, clientIp, errorResponse, json, parseParty } from "@/server/tributes/http";
import { rateLimit } from "@/server/tributes/ratelimit";
import { sessionTeam, tokenMatches } from "@/server/tributes/owner";
import { toView } from "@/server/tributes/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Item = { id: string; token: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanItems(v: unknown): Item[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Item => !!x && typeof x.id === "string" && UUID.test(x.id) && typeof x.token === "string" && x.token.length > 0 && x.token.length < 200)
    .slice(0, 50);
}

/**
 * "Your tributes": the caller's guest-session team's tributes plus any tributes whose edit tokens the
 * caller presents (from this device). Never lists anyone else's. Deleted ones are omitted.
 */
async function handle(req: Request, party: "live" | "demo", items: Item[]) {
  const db = await getDb();
  await rateLimit(db, `tribute-mine:${clientIp(req)}`, 120, 60 * 1000);
  const team = await sessionTeam(db, req, party);
  const ids = items.map((i) => i.id);
  const rows = await db.query(
    `SELECT * FROM tribute WHERE party_id = $1 AND status <> 'deleted'
       AND (($2::uuid IS NOT NULL AND submitted_team_id = $2::uuid) OR id = ANY($3::uuid[]))
     ORDER BY created_at DESC`,
    [party, team, ids],
  );
  const byId = new Map(items.map((i) => [i.id, i.token]));
  const out = rows
    .map((r) => {
      const viaTeam = !!team && r.submitted_team_id === team;
      const viaToken = byId.has(r.id) && tokenMatches(r, byId.get(r.id));
      if (!viaTeam && !viaToken) return null; // id sent without a valid token: not yours
      const v = toView(r);
      return {
        id: v.id, personName: v.personName, remembrance: v.remembrance, attribution: v.attribution,
        status: v.status, thumbUrl: v.thumbUrl, photoUrl: v.photoUrl, createdAt: v.createdAt,
        canEdit: true, via: viaToken ? "token" : "team",
      };
    })
    .filter(Boolean);
  // Tokens that no longer resolve (removed, wrong party, bad token) so the client can forget them.
  const found = new Set(out.map((o) => o!.id));
  return json({ tributes: out, unknown: ids.filter((id) => !found.has(id)), hasSession: !!team });
}

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const header = req.headers.get("x-tribute-tokens") ?? "";
    const items = cleanItems(header.split(",").filter(Boolean).map((p) => { const [id, token] = p.split(":"); return { id, token }; }));
    return await handle(req, parseParty(sp.get("party")), items);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const b = (await req.json().catch(() => null)) as { party?: string; items?: unknown } | null;
    if (!b) throw new HttpError(400, "invalid", "Invalid request.");
    return await handle(req, parseParty(b.party), cleanItems(b.items));
  } catch (e) {
    return errorResponse(e);
  }
}
