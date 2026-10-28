import type { Q } from "@/server/db";
import { cookieName, memberForSecret } from "@/server/session";

function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

/** The guest's team for this party from the al_s_<party> session cookie, if any. */
export async function guestTeam(q: Q, partyId: string, cookieHeader: string | null): Promise<{ teamId: string; teamName: string } | null> {
  try {
    const m = await memberForSecret(q, partyId, readCookie(cookieHeader, cookieName(partyId)));
    if (!m) return null;
    const t = (await q.query("SELECT name FROM team WHERE id = $1", [m.teamId]))[0];
    return t ? { teamId: m.teamId, teamName: String(t.name) } : null;
  } catch {
    return null;
  }
}
