import type { Q } from "@/server/db";
import type { PublicTribute } from "@/shared/types";

const DEFAULT_MIN = 45000;
const DEFAULT_MAX = 75000;

/** Casual pacing: 45s for photo+name only, ~55s for ~100 chars, up to 75s for a full 300-char remembrance. */
export function dwellFor(textLength: number, minMs = DEFAULT_MIN, maxMs = DEFAULT_MAX) {
  const ms = 45000 + textLength * 100;
  return Math.round(Math.min(maxMs, Math.max(minMs, ms)));
}

/**
 * Fair queue: featured (priority) first, then least shown, then longest since shown (never-shown first),
 * then oldest. Marks the chosen tribute as shown. Safe to call inside the engine tick transaction.
 */
export async function nextTribute(q: Q, partyId: string, now: number): Promise<PublicTribute | null> {
  const rows = await q.query(
    `SELECT t.*, p.settings FROM tribute t JOIN party p ON p.id = t.party_id
     WHERE t.party_id = $1 AND t.status = 'published'
     ORDER BY t.priority DESC, t.queue_round ASC, t.display_count ASC, t.last_shown_at ASC NULLS FIRST, t.created_at ASC, t.id ASC
     LIMIT 1`,
    [partyId],
  );
  const r = rows[0];
  if (!r) return null;
  const shown = new Date(now);
  const updated = await q.query(
    `UPDATE tribute SET display_count = display_count + 1, queue_round = queue_round + 1, last_shown_at = $2, priority = 0 WHERE id = $1 RETURNING updated_at`,
    [r.id, shown],
  );
  const settings = (r.settings ?? {}) as Record<string, unknown>;
  const min = Number(settings.tributeDwellMinMs) || DEFAULT_MIN;
  const max = Number(settings.tributeDwellMaxMs) || DEFAULT_MAX;
  const v = new Date(updated[0]?.updated_at ?? r.updated_at).getTime();
  return {
    id: r.id,
    personName: r.person_name,
    remembrance: r.remembrance,
    attribution: r.attribution,
    photoUrl: `/api/tributes/photo/${r.id}?size=display&v=${v}`,
    width: r.width,
    height: r.height,
    fit: r.fit === "cover" ? "cover" : "contain",
    focalX: Number(r.focal_x),
    focalY: Number(r.focal_y),
    dwellMs: dwellFor((r.remembrance ?? "").length + (r.attribution ?? "").length / 2, min, max),
  };
}

/** SQL expression: the current minimum queue round among published tributes of a party ($1). */
export const BASELINE_ROUND_SQL = "(SELECT COALESCE(MIN(queue_round), 0) FROM tribute WHERE party_id = $1 AND status = 'published')";

export async function isTributeVisible(q: Q, partyId: string, tributeId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(tributeId)) return false;
  const rows = await q.query("SELECT 1 FROM tribute WHERE id = $1 AND party_id = $2 AND status = 'published'", [tributeId, partyId]);
  return rows.length > 0;
}
