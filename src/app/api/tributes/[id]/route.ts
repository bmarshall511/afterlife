import { getDb } from "@/server/db";
import { errorResponse, json } from "@/server/tributes/http";
import { bearer, getWithToken, parseOr400, patchSchema, removeTribute, toView, updateTribute } from "@/server/tributes/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const db = await getDb();
    return json({ tribute: toView(await getWithToken(db, id, bearer(req))) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const db = await getDb();
    const row = await getWithToken(db, id, bearer(req));
    const patch = parseOr400(patchSchema, await req.json().catch(() => ({})));
    return json({ tribute: await updateTribute(db, row, patch, "guest") });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const db = await getDb();
    const row = await getWithToken(db, id, bearer(req));
    await removeTribute(db, row, "guest");
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
