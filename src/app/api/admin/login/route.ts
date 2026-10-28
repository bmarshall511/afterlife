import { getDb } from "@/server/db";
import { login } from "@/server/admin/auth";
import { errorResponse, json } from "@/server/tributes/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const db = await getDb();
    const { setCookie } = await login(db, req, (b as { password?: unknown }).password);
    return json({ ok: true }, 200, { "set-cookie": setCookie });
  } catch (e) {
    return errorResponse(e);
  }
}
