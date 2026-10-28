export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getDb } from "@/server/db";
import { join, listTeamsForRejoin, partyIdOf } from "@/server/engine";
import { body, err, handle, json } from "@/server/http";
import { LIMITS, clientIp, consume } from "@/server/ratelimit";
import { sessionCookie } from "@/server/session";

/** POST /api/join {party, name, teamName?, inviteCode?} → MeView + session cookie. */
export async function POST(req: Request) {
  try {
    const b = await body(req);
    const party = partyIdOf(b.party);
    const db = await getDb();
    if (!(await consume(db, `join:${party}:${clientIp(req)}`, LIMITS.joinPerIp.limit, LIMITS.joinPerIp.windowMs))) return err("rate_limited", "Too many joins, try again in a minute", 429);
    const { secret, me } = await join(party, { name: b.name, teamName: b.teamName, inviteCode: b.inviteCode, teamId: b.teamId, asMemberId: b.asMemberId });
    const res = json(me);
    res.cookies.set(sessionCookie(party, secret));
    return res;
  } catch (e) {
    return handle(e);
  }
}

/** GET /api/join?party= → teams and their people, for the "Already playing? Get back in" list. */
export async function GET(req: Request) {
  try {
    const party = partyIdOf(new URL(req.url).searchParams.get("party"));
    return json({ teams: await listTeamsForRejoin(party) });
  } catch (e) {
    return handle(e);
  }
}
