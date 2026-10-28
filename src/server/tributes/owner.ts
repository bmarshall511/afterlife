import { migrate, type Q, type Row } from "@/server/db";
import { cookieName, memberForSecret } from "@/server/session";
import { HttpError, readCookie } from "./http";
import { safeEqual, sha256 } from "./config";
import { getRow } from "./service";

const g = globalThis as unknown as { __afterlifeTributeSchema?: Promise<void> };
/**
 * Applies pending migrations once per process (idempotent). getDb() only migrates at first init, so a
 * long-running server that predates a new tribute migration would otherwise miss submitted_team_id.
 */
export function ensureSchema(q: Q): Promise<void> {
  g.__afterlifeTributeSchema ??= migrate(q).catch((e) => { g.__afterlifeTributeSchema = undefined; throw e; });
  return g.__afterlifeTributeSchema;
}

/** Team of the guest session cookie for this party, or null. */
export async function sessionTeam(q: Q, req: Request, party: string): Promise<string | null> {
  await ensureSchema(q);
  const m = await memberForSecret(q, party, readCookie(req, cookieName(party)));
  return m?.teamId ?? null;
}

export function tokenMatches(row: Row, token: string | null | undefined) {
  return !!token && typeof token === "string" && token.length < 200 && safeEqual(sha256(token), row.edit_token_hash);
}

/**
 * Ownership: (a) the private edit token, or (b) the caller's guest session team == submitted_team_id
 * (session for the tribute's own party only, so demo/live stay isolated). Anything else → 404.
 */
export async function getOwned(q: Q, req: Request, id: string, token: string | null): Promise<{ row: Row; via: "token" | "team" }> {
  await ensureSchema(q);
  const row = await getRow(q, id);
  const missing = new HttpError(404, "not_found", "We couldn't find that tribute. The link may be incomplete or it was removed.");
  if (!row || row.status === "deleted") throw missing;
  if (tokenMatches(row, token)) return { row, via: "token" };
  if (row.submitted_team_id) {
    const team = await sessionTeam(q, req, row.party_id);
    if (team && team === row.submitted_team_id) return { row, via: "team" };
  }
  throw missing;
}
