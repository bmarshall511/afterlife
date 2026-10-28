export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { partyIdOf, tick } from "@/server/engine";
import { handle, json } from "@/server/http";

/** GET /api/tick — cron-safe, idempotent; advances both parties (or ?party=). */
export async function GET(req: Request) {
  try {
    const p = new URL(req.url).searchParams.get("party");
    const parties = p ? [partyIdOf(p)] : (["live", "demo"] as const);
    const out: Record<string, number> = {};
    for (const party of parties) out[party] = (await tick(party)).version;
    return json({ ok: true, versions: out });
  } catch (e) {
    return handle(e);
  }
}
