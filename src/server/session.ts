import { createHash, randomBytes } from "node:crypto";
import type { Q } from "@/server/db";

/** Guest sessions: random 32-byte bearer secret in httpOnly cookie `al_s_<party>`; only sha256 stored. */
export const cookieName = (party: string) => `al_s_${party}`;
export const newSecret = () => randomBytes(32).toString("base64url");
export const hashSecret = (s: string) => createHash("sha256").update(s).digest("hex");

export function sessionCookie(party: string, secret: string) {
  return {
    name: cookieName(party),
    value: secret,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  };
}

/** Resolve the member for a session secret (team must not be removed). Returns null when invalid. */
export async function memberForSecret(q: Q, party: string, secret: string | undefined | null): Promise<{ memberId: string; teamId: string } | null> {
  if (!secret || secret.length < 20 || secret.length > 200) return null;
  const r = await q.query(
    `SELECT m.id, m.team_id FROM member m JOIN team t ON t.id = m.team_id
      WHERE m.session_hash=$1 AND m.party_id=$2 AND t.status IN ('active','away')`,
    [hashSecret(secret), party],
  );
  return r[0] ? { memberId: r[0].id, teamId: r[0].team_id } : null;
}

/** Throttled presence update (at most every 2 s per member). `now` is server time. */
export async function touch(q: Q, memberId: string, now: number) {
  await q.query(`UPDATE member SET last_seen=$2 WHERE id=$1 AND last_seen < $3`, [memberId, new Date(now).toISOString(), new Date(now - 2000).toISOString()]);
}
