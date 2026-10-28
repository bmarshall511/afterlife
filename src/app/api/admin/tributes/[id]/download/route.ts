import { adminRoute } from "@/server/admin/route";
import { getObject } from "@/server/storage";
import { HttpError } from "@/server/tributes/http";
import { getRow } from "@/server/tributes/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Host export: best-quality stored copy (normalized original, metadata stripped) as an attachment. */
export const GET = adminRoute<{ id: string }>(async (_req, { db, params }) => {
  const row = await getRow(db, params.id);
  if (!row || row.status === "deleted") throw new HttpError(404, "not_found", "Tribute not found.");
  const data = (row.original_key && (await getObject(row.original_key))) || (await getObject(row.photo_key));
  if (!data) throw new HttpError(404, "not_found", "Photo not found in storage.");
  const name = String(row.person_name).replace(/[^a-zA-Z0-9 _-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "tribute";
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": "image/jpeg",
      "content-disposition": `attachment; filename="${name}-${row.id.slice(0, 8)}.jpg"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});
