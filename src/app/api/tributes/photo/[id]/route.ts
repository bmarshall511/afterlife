import { getDb } from "@/server/db";
import { getObject } from "@/server/storage";
import { isAdmin } from "@/server/admin/auth";
import { sha256, safeEqual } from "@/server/tributes/config";
import { bearer, getRow } from "@/server/tributes/service";
import { sessionTeam } from "@/server/tributes/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });

/** Streams a re-encoded derivative. Published => anyone with the URL; hidden => admin, edit token or submitting team's session; deleted => 404. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const size = new URL(req.url).searchParams.get("size") === "thumb" ? "thumb" : "display";
  const db = await getDb();
  const row = await getRow(db, id);
  if (!row || row.status === "deleted") return notFound();
  if (row.status !== "published") {
    const t = bearer(req);
    const ok = (t && safeEqual(sha256(t), row.edit_token_hash)) ||
      (row.submitted_team_id && (await sessionTeam(db, req, row.party_id)) === row.submitted_team_id) ||
      (await isAdmin(req, db));
    if (!ok) return notFound();
  }
  const data = await getObject(size === "thumb" ? row.thumb_key : row.photo_key);
  if (!data) return notFound();
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": size === "thumb" ? "image/webp" : "image/jpeg",
      "content-length": String(data.length),
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
