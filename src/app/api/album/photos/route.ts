import { getDb } from "@/server/db";
import { errorResponse, json, parseParty } from "@/server/tributes/http";
import { listPhotos } from "@/server/album/service";
import { requireAlbumToken } from "@/server/album/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?token&party -> published photos, newest first. */
export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    requireAlbumToken(sp.get("token"));
    const db = await getDb();
    return json({ photos: await listPhotos(db, parseParty(sp.get("party"))) });
  } catch (e) {
    return errorResponse(e);
  }
}
