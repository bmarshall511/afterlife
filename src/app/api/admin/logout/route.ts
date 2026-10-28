import { getDb } from "@/server/db";
import { logout } from "@/server/admin/auth";
import { errorResponse, json } from "@/server/tributes/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const setCookie = await logout(await getDb(), req);
    return json({ ok: true }, 200, { "set-cookie": setCookie });
  } catch (e) {
    return errorResponse(e);
  }
}
