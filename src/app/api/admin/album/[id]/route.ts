import { adminRoute, body } from "@/server/admin/route";
import { HttpError, json } from "@/server/tributes/http";
import { getPhoto, parsePatch, removePhoto, toView, updatePhoto } from "@/server/album/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function load(db: Parameters<typeof getPhoto>[0], id: string) {
  const row = await getPhoto(db, id);
  if (!row || row.status === "deleted") throw new HttpError(404, "not_found", "Photo not found.");
  return row;
}

export const GET = adminRoute<{ id: string }>(async (_req, { db, params }) => json({ photo: toView(await load(db, params.id)) }));

/** PATCH {status?: published|hidden, caption?, takenBy?} */
export const PATCH = adminRoute<{ id: string }>(async (req, { db, params, admin }) => {
  const row = await load(db, params.id);
  return json({ photo: await updatePhoto(db, row, parsePatch(await body(req)), admin.actor) });
});

/** DELETE ?confirm=1 -> removes the row (status=deleted) and every stored object. */
export const DELETE = adminRoute<{ id: string }>(async (req, { db, params, admin }) => {
  if (new URL(req.url).searchParams.get("confirm") !== "1") throw new HttpError(400, "confirm_required", "Please confirm deletion.");
  await removePhoto(db, await load(db, params.id), admin.actor);
  return json({ ok: true });
});
