import { adminRoute } from "@/server/admin/route";
import { HttpError } from "@/server/tributes/http";
import { getPhoto } from "@/server/album/service";
import { serveFull } from "@/server/album/serve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full-quality download for the host (works for hidden photos too). */
export const GET = adminRoute<{ id: string }>(async (_req, { db, params }) => {
  const row = await getPhoto(db, params.id);
  if (!row || row.status === "deleted") throw new HttpError(404, "not_found", "Photo not found.");
  return serveFull(row, true);
});
