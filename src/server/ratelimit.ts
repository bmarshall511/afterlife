import type { Q } from "@/server/db";

/**
 * DB-backed fixed-window rate limiter (works across serverless instances).
 * Returns true if allowed. Limits are generous: a whole party often shares one NAT IP.
 */
export const LIMITS = {
  joinPerIp: { limit: 120, windowMs: 60_000 },
  answerPerMember: { limit: 60, windowMs: 60_000 },
  teamPerMember: { limit: 30, windowMs: 60_000 },
} as const;

export async function consume(q: Q, key: string, limit: number, windowMs: number, now: number = Date.now()): Promise<boolean> {
  const start = new Date(Math.floor(now / windowMs) * windowMs).toISOString();
  const r = await q.query(
    `INSERT INTO rate_limit (key, window_start, count) VALUES ($1, $2, 1)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limit.window_start < $2 THEN 1 ELSE rate_limit.count + 1 END,
       window_start = GREATEST(rate_limit.window_start, $2)
     RETURNING count`,
    [key.slice(0, 200), start],
  );
  return Number(r[0].count) <= limit;
}

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  return (xf?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}
