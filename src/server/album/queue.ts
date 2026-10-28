import type { Q } from "@/server/db";
import { photoUrl } from "./service";

export interface AlbumSlide {
  id: string;
  /** Display derivative (<=1920px JPEG), streamed by /api/album/photo/[id]. */
  url: string;
  width: number;
  height: number;
  caption: string;
  takenBy: string;
  dwellMs: number;
}

export const ALBUM_DWELL_MS = 15000;

/**
 * Fair rotation for TV breaks. Persistent counters (queue_round/display_count/last_shown_at).
 * Order: lowest queue round (new/unhidden photos join at the current minimum round, so they are
 * shown soon without starving older ones), then never/least-recently shown, then newest first.
 * Only published photos qualify, so hide/delete takes effect on the next call. Marks the pick shown.
 * Safe to call inside the engine tick transaction.
 */
export async function nextAlbumSlide(q: Q, partyId: string, now: number): Promise<AlbumSlide | null> {
  const r = (await q.query(
    `SELECT * FROM album_photo WHERE party_id = $1 AND status = 'published'
     ORDER BY queue_round ASC, last_shown_at ASC NULLS FIRST, created_at DESC, id ASC LIMIT 1`,
    [partyId],
  ))[0];
  if (!r) return null;
  await q.query(
    "UPDATE album_photo SET display_count = display_count + 1, queue_round = queue_round + 1, last_shown_at = $2 WHERE id = $1",
    [r.id, new Date(now)],
  );
  return {
    id: r.id,
    url: photoUrl(r.id, "display", new Date(r.updated_at).getTime()),
    width: r.width,
    height: r.height,
    caption: r.caption,
    takenBy: r.taken_by,
    dwellMs: ALBUM_DWELL_MS,
  };
}

/** For swapping a slide off-screen promptly when the host hides/deletes it. */
export async function isAlbumPhotoVisible(q: Q, partyId: string, id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  return (await q.query("SELECT 1 FROM album_photo WHERE id = $1 AND party_id = $2 AND status = 'published'", [id, partyId])).length > 0;
}
