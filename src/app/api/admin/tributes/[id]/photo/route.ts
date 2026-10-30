import { adminRoute } from "@/server/admin/route";
import { LIMITS } from "@/server/tributes/config";
import { HttpError, json } from "@/server/tributes/http";
import { getRow, replaceTributePhoto } from "@/server/tributes/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST multipart {photo} — host replaces a tribute's photo. */
export const POST = adminRoute<{ id: string }>(async (req, { db, params, admin }) => {
  const row = await getRow(db, params.id);
  if (!row || row.status === "deleted") throw new HttpError(404, "not_found", "Tribute not found.");
  const form = await req.formData().catch(() => null);
  const photo = form?.get("photo");
  if (!(photo instanceof Blob) || photo.size === 0) throw new HttpError(400, "no_photo", "Please choose a photo.");
  if (photo.size > LIMITS.maxBytes) throw new HttpError(413, "too_large", "That photo is too large (15 MB max).");
  const tribute = await replaceTributePhoto(db, row, Buffer.from(await photo.arrayBuffer()), admin.actor);
  return json({ tribute });
});
