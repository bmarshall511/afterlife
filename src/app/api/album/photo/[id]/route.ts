import { getDb } from "@/server/db";
import { isAdmin } from "@/server/admin/auth";
import { isValidAlbumToken } from "@/server/album/config";
import { getPhoto } from "@/server/album/service";
import { albumNotFound, serveFull, streamDerivative } from "@/server/album/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET ?size=thumb|display|full[&t=<album token>][&dl=1]
 * thumb/display: published => anyone with the (unguessable) id, e.g. the TV; hidden => admin only.
 * full: requires the album token (or admin) and redirects to a short-lived signed URL.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  const size = sp.get("size") === "thumb" ? "thumb" : sp.get("size") === "full" ? "full" : "display";
  const db = await getDb();
  const row = await getPhoto(db, id);
  if (!row || row.status === "deleted") return albumNotFound();
  const admin = row.status !== "published" || size === "full" ? await isAdmin(req, db) : false;
  if (row.status !== "published" && !admin) return albumNotFound();
  if (size === "full") {
    if (!admin && !isValidAlbumToken(sp.get("t"))) return albumNotFound();
    return serveFull(row, sp.get("dl") === "1");
  }
  return streamDerivative(row, size, row.status === "published" ? "private, max-age=86400" : "private, no-store");
}
