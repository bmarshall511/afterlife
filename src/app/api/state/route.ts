export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { getDb } from "@/server/db";
import { buildSnapshot, partyIdOf, tick } from "@/server/engine";
import { handle, json } from "@/server/http";
import { cookieName, memberForSecret, touch } from "@/server/session";

/** GET /api/state?party=&v=&audience=tv|phone — runs tick; 204 when ?v matches and nothing changed. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const party = partyIdOf(url.searchParams.get("party"));
    const now = Date.now();
    const db = await getDb();
    const secret = (await cookies()).get(cookieName(party))?.value;
    if (secret) {
      const m = await memberForSecret(db, party, secret);
      if (m) await touch(db, m.memberId, now);
    }
    const { version } = await tick(party, now);
    const v = url.searchParams.get("v");
    if (v != null && Number(v) === version) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    const audience = url.searchParams.get("audience") === "tv" ? "tv" : "phone";
    const snap = await buildSnapshot(db, party, now, audience);
    // QR codes need an absolute public URL; never a relative path.
    if (snap.joinUrl.startsWith("/")) {
      const base = (process.env.PUBLIC_BASE_URL || url.origin).replace(/\/$/, "");
      snap.joinUrl = base + snap.joinUrl;
    }
    return json(snap);
  } catch (e) {
    return handle(e);
  }
}
