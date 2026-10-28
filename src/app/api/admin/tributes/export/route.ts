import { adminRoute } from "@/server/admin/route";
import { json, parseParty } from "@/server/tributes/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** JSON export of all non-deleted tributes with per-photo download links (admin session required). */
export const GET = adminRoute(async (req, { db }) => {
  const party = parseParty(new URL(req.url).searchParams.get("party"));
  const rows = await db.query("SELECT * FROM tribute WHERE party_id = $1 AND status <> 'deleted' ORDER BY created_at", [party]);
  const data = {
    exportedAt: new Date().toISOString(),
    party,
    tributes: rows.map((r) => ({
      id: r.id,
      personName: r.person_name,
      remembrance: r.remembrance,
      attribution: r.attribution,
      status: r.status,
      createdAt: new Date(r.created_at).toISOString(),
      displayCount: r.display_count,
      photoDownload: `/api/admin/tributes/${r.id}/download`,
    })),
  };
  return json(data, 200, { "content-disposition": `attachment; filename="afterlife-tributes-${party}.json"` });
});
