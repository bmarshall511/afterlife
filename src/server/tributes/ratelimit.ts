import type { Q } from "@/server/db";
import { HttpError } from "./http";

/** Fixed-window DB rate limiter (shared via rate_limit table, safe across serverless instances). */
export async function rateLimit(q: Q, key: string, limit: number, windowMs: number): Promise<void> {
  const rows = await q.query<{ count: number }>(
    `INSERT INTO rate_limit (key, window_start, count) VALUES ($1, now(), 1)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limit.window_start < now() - ($2::double precision * interval '1 millisecond') THEN 1 ELSE rate_limit.count + 1 END,
       window_start = CASE WHEN rate_limit.window_start < now() - ($2::double precision * interval '1 millisecond') THEN now() ELSE rate_limit.window_start END
     RETURNING count`,
    [key, windowMs],
  );
  if ((rows[0]?.count ?? 0) > limit) throw new HttpError(429, "rate_limited", "Too many attempts. Please wait a few minutes and try again.");
}
