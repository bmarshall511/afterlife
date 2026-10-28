export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { getDb } from "@/server/db";
import { partyIdOf, teamAction } from "@/server/engine";
import { body, err, handle, json } from "@/server/http";
import { LIMITS, consume } from "@/server/ratelimit";
import { cookieName, memberForSecret } from "@/server/session";

/** POST /api/team {party, action:'away'|'resume'|'claim_captain'(confirm:true)|'rename'(name)} → MeView. */
export async function POST(req: Request) {
  try {
    const b = await body(req);
    const party = partyIdOf(b.party);
    const db = await getDb();
    const m = await memberForSecret(db, party, (await cookies()).get(cookieName(party))?.value);
    if (!m) return err("no_session", "Not joined", 401);
    if (!(await consume(db, `team:${m.memberId}`, LIMITS.teamPerMember.limit, LIMITS.teamPerMember.windowMs))) return err("rate_limited", "Slow down", 429);
    return json(await teamAction(party, m.memberId, b));
  } catch (e) {
    return handle(e);
  }
}
