import { adminRoute } from "@/server/admin/route";
import { json, parseParty } from "@/server/tributes/http";
import { toView } from "@/server/tributes/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = adminRoute(async (req, { db }) => {
  const sp = new URL(req.url).searchParams;
  const party = parseParty(sp.get("party"));
  const search = (sp.get("q") ?? "").trim().slice(0, 80);
  const rows = await db.query(
    `SELECT * FROM tribute WHERE party_id = $1 AND status <> 'deleted'
       AND ($2 = '' OR person_name ILIKE '%' || $2 || '%' OR remembrance ILIKE '%' || $2 || '%' OR attribution ILIKE '%' || $2 || '%')
     ORDER BY created_at DESC`,
    [party, search.replace(/[%_\\]/g, (c) => "\\" + c)],
  );
  return json({ tributes: rows.map(toView) });
});
