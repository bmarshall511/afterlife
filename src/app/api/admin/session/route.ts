import { adminRoute } from "@/server/admin/route";
import { json } from "@/server/tributes/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = adminRoute(async () => json({ ok: true }));
