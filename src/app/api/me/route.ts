export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { getDb } from "@/server/db";
import { buildMe, partyIdOf } from "@/server/engine";
import { albumPath } from "@/server/album/config";
import { err, handle, json } from "@/server/http";
import { cookieName, memberForSecret, touch } from "@/server/session";

/** GET /api/me?party= → MeView (401 without a valid session). Updates last_seen. */
export async function GET(req: Request) {
  try {
    const party = partyIdOf(new URL(req.url).searchParams.get("party"));
    const db = await getDb();
    const m = await memberForSecret(db, party, (await cookies()).get(cookieName(party))?.value);
    if (!m) return err("no_session", "Not joined", 401);
    const now = Date.now();
    await touch(db, m.memberId, now);
    return json({ ...(await buildMe(db, party, m.memberId, now)), albumUrl: albumPath(party) });
  } catch (e) {
    return handle(e);
  }
}
