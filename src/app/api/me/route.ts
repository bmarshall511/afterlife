export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { getDb } from "@/server/db";
import { buildMe, partyIdOf } from "@/server/engine";
import { albumPath, albumToken, ALBUM_LIMITS } from "@/server/album/config";
import { storageKind } from "@/server/storage";
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
    const t = albumToken();
    const album = t ? { token: t, mode: storageKind() === "vercel-blob" ? "blob" : "local", maxCaption: ALBUM_LIMITS.maxCaptionChars } : null;
    return json({ ...(await buildMe(db, party, m.memberId, now)), albumUrl: albumPath(party), album });
  } catch (e) {
    return handle(e);
  }
}
