import { getDb } from "@/server/db";
import { errorResponse, json, parseParty } from "@/server/tributes/http";
import { finalizePhoto } from "@/server/album/service";
import { guestTeam } from "@/server/album/guest";
import { requireAlbumToken, uploadRateLimit } from "@/server/album/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST {pathname, caption?, takenBy?, party, token} -> {photo}. Idempotent per pathname. */
export async function POST(req: Request) {
  try {
    const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    requireAlbumToken(b.token);
    const partyId = parseParty(typeof b.party === "string" ? b.party : null);
    const db = await getDb();
    await uploadRateLimit(db, req, "finalize");
    const team = await guestTeam(db, partyId, req.headers.get("cookie"));
    const takenBy = typeof b.takenBy === "string" && b.takenBy.trim() ? b.takenBy : (team?.teamName ?? "");
    const r = await finalizePhoto(db, { partyId, pathname: b.pathname, caption: b.caption, takenBy, teamId: team?.teamId ?? null });
    return json({ photo: r.photo }, r.created ? 201 : 200);
  } catch (e) {
    return errorResponse(e);
  }
}
