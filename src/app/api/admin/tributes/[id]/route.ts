import { adminRoute, body } from "@/server/admin/route";
import { HttpError, json } from "@/server/tributes/http";
import { adminPatchSchema, getRow, parseOr400, removeTribute, toView, updateTribute } from "@/server/tributes/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function load(db: Parameters<typeof getRow>[0], id: string) {
  const row = await getRow(db, id);
  if (!row || row.status === "deleted") throw new HttpError(404, "not_found", "Tribute not found.");
  return row;
}

export const GET = adminRoute<{ id: string }>(async (_req, { db, params }) => json({ tribute: toView(await load(db, params.id)) }));

export const PATCH = adminRoute<{ id: string }>(async (req, { db, params, admin }) => {
  const row = await load(db, params.id);
  const patch = parseOr400(adminPatchSchema, await body(req));
  return json({ tribute: await updateTribute(db, row, patch, admin.actor) });
});

export const DELETE = adminRoute<{ id: string }>(async (req, { db, params, admin }) => {
  if (new URL(req.url).searchParams.get("confirm") !== "1") throw new HttpError(400, "confirm_required", "Please confirm deletion.");
  await removeTribute(db, await load(db, params.id), admin.actor);
  return json({ ok: true });
});
