import crypto from "node:crypto";
import type { Q, Row } from "@/server/db";
import { deleteObject, getObjectFresh, putObject } from "@/server/storage";
import { HttpError } from "@/server/tributes/http";
import { audit, cleanText } from "@/server/tributes/service";
import { ALBUM_LIMITS, parseRawPathname } from "./config";
import { processAlbumPhoto } from "./process";

export type PartyId = "live" | "demo";
export type AlbumStatus = "published" | "hidden" | "deleted";

export interface AlbumPhotoView {
  id: string;
  partyId: PartyId;
  width: number;
  height: number;
  bytes: number;
  caption: string;
  takenBy: string;
  status: AlbumStatus;
  displayCount: number;
  createdAt: string;
  thumbUrl: string;
  displayUrl: string;
  /** Requires the album token (`t`) or an admin session; redirects to a short-lived signed URL. */
  fullUrl: string;
}

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export function photoUrl(id: string, size: "thumb" | "display" | "full", v: number) {
  return `/api/album/photo/${id}?size=${size}&v=${v}`;
}

export function toView(r: Row): AlbumPhotoView {
  const v = new Date(r.updated_at).getTime();
  return {
    id: r.id,
    partyId: r.party_id,
    width: r.width,
    height: r.height,
    bytes: r.bytes,
    caption: r.caption,
    takenBy: r.taken_by,
    status: r.status,
    displayCount: r.display_count,
    createdAt: new Date(r.created_at).toISOString(),
    thumbUrl: photoUrl(r.id, "thumb", v),
    displayUrl: photoUrl(r.id, "display", v),
    fullUrl: photoUrl(r.id, "full", v),
  };
}

export const cleanCaption = (s: unknown) => cleanText(s, ALBUM_LIMITS.maxCaptionChars).replace(/\n+/g, " ");
export const cleanTakenBy = (s: unknown) => cleanText(s, ALBUM_LIMITS.maxTakenByChars).replace(/\n+/g, " ");

function checkLengths(caption: unknown, takenBy: unknown) {
  if (typeof caption === "string" && caption.trim().length > ALBUM_LIMITS.maxCaptionChars)
    throw new HttpError(400, "caption_too_long", `Please keep the caption to ${ALBUM_LIMITS.maxCaptionChars} characters.`);
  if (typeof takenBy === "string" && takenBy.trim().length > ALBUM_LIMITS.maxTakenByChars)
    throw new HttpError(400, "name_too_long", `Please keep the name to ${ALBUM_LIMITS.maxTakenByChars} characters.`);
}

export async function getPhoto(q: Q, id: string): Promise<Row | null> {
  if (!isUuid(id)) return null;
  return (await q.query("SELECT * FROM album_photo WHERE id = $1", [id]))[0] ?? null;
}

export interface FinalizeInput {
  partyId: PartyId;
  pathname: unknown;
  caption?: unknown;
  takenBy?: unknown;
  teamId?: string | null;
}

/**
 * Turn a raw upload into a published album photo. Idempotent per raw pathname: a retry (or a
 * concurrent duplicate) returns the existing photo. The row is inserted only after every derivative
 * is stored; the raw object is deleted afterwards.
 */
export async function finalizePhoto(q: Q, input: FinalizeInput): Promise<{ photo: AlbumPhotoView; created: boolean }> {
  const parsed = parseRawPathname(input.pathname);
  if (!parsed) throw new HttpError(400, "invalid_upload", "That upload reference isn't valid. Please try uploading again.");
  if (parsed.party !== input.partyId) throw new HttpError(400, "invalid_upload", "That upload belongs to a different album.");
  const pathname = input.pathname as string;
  checkLengths(input.caption, input.takenBy);

  const existing = (await q.query("SELECT * FROM album_photo WHERE raw_pathname = $1", [pathname]))[0];
  if (existing) {
    if (existing.status === "deleted") throw new HttpError(410, "removed", "This photo was removed by the host.");
    return { photo: toView(existing), created: false };
  }

  const raw = await getObjectFresh(pathname);
  if (!raw) throw new HttpError(404, "upload_missing", "We couldn't find your upload. Please try again.");
  let d;
  try {
    d = await processAlbumPhoto(raw);
  } catch (e) {
    // Invalid input will never become valid: drop the raw object.
    if (e instanceof HttpError && e.status < 500) await deleteObject(pathname).catch(() => {});
    throw e;
  }

  const id = crypto.randomUUID();
  const prefix = `album/${input.partyId}/${id}/${crypto.randomBytes(9).toString("base64url")}`;
  const keys = { full: `${prefix}-full.jpg`, display: `${prefix}-display.jpg`, thumb: `${prefix}-thumb.webp` };
  const cleanup = () => Promise.all([deleteObject(keys.full), deleteObject(keys.display), deleteObject(keys.thumb)]).catch(() => {});
  try {
    await putObject(keys.full, d.full, "image/jpeg");
    await putObject(keys.display, d.display, "image/jpeg");
    await putObject(keys.thumb, d.thumb, "image/webp");
  } catch (e) {
    await cleanup();
    throw e;
  }

  let rows: Row[];
  try {
    rows = await q.query(
      `INSERT INTO album_photo (id, party_id, full_key, display_key, thumb_key, width, height, bytes, caption, taken_by, team_id,
         status, raw_pathname, queue_round)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'published',$12,
         (SELECT COALESCE(MIN(queue_round), 0) FROM album_photo WHERE party_id = $2 AND status = 'published'))
       ON CONFLICT (raw_pathname) DO NOTHING RETURNING *`,
      [id, input.partyId, keys.full, keys.display, keys.thumb, d.width, d.height, d.full.length,
        cleanCaption(input.caption ?? ""), cleanTakenBy(input.takenBy ?? ""), input.teamId ?? null, pathname],
    );
  } catch (e) {
    await cleanup();
    throw e;
  }
  if (!rows.length) {
    // Lost a race with a concurrent finalize of the same upload.
    await cleanup();
    const winner = (await q.query("SELECT * FROM album_photo WHERE raw_pathname = $1", [pathname]))[0];
    if (!winner || winner.status === "deleted") throw new HttpError(410, "removed", "This photo was removed by the host.");
    return { photo: toView(winner), created: false };
  }
  await deleteObject(pathname).catch(() => {});
  await audit(q, input.partyId, "guest", "album.upload", { id });
  return { photo: toView(rows[0]), created: true };
}

export async function listPhotos(q: Q, partyId: PartyId, opts: { includeHidden?: boolean } = {}): Promise<AlbumPhotoView[]> {
  const rows = await q.query(
    `SELECT * FROM album_photo WHERE party_id = $1 AND status ${opts.includeHidden ? "<> 'deleted'" : "= 'published'"}
     ORDER BY created_at DESC, id DESC`,
    [partyId],
  );
  return rows.map(toView);
}

export async function counts(q: Q, partyId: PartyId) {
  const rows = await q.query<{ status: string; n: number; bytes: string }>(
    "SELECT status, count(*)::int AS n, COALESCE(sum(bytes),0)::bigint AS bytes FROM album_photo WHERE party_id = $1 AND status <> 'deleted' GROUP BY status",
    [partyId],
  );
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  return { published: by.published ?? 0, hidden: by.hidden ?? 0, bytes: rows.reduce((s, r) => s + Number(r.bytes), 0) };
}

export interface AlbumPatch {
  status?: "published" | "hidden";
  caption?: string;
  takenBy?: string;
}

export function parsePatch(b: Record<string, unknown>): AlbumPatch {
  const p: AlbumPatch = {};
  if (b.status !== undefined) {
    if (b.status !== "published" && b.status !== "hidden") throw new HttpError(400, "invalid", "status must be published or hidden");
    p.status = b.status;
  }
  checkLengths(b.caption, b.takenBy);
  if (b.caption !== undefined) p.caption = cleanCaption(b.caption);
  if (b.takenBy !== undefined) p.takenBy = cleanTakenBy(b.takenBy);
  return p;
}

export async function updatePhoto(q: Q, row: Row, patch: AlbumPatch, actor: string): Promise<AlbumPhotoView> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  const add = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (patch.caption !== undefined) add("caption", patch.caption);
  if (patch.takenBy !== undefined) add("taken_by", patch.takenBy);
  if (patch.status !== undefined) {
    add("status", patch.status);
    if (patch.status === "published" && row.status !== "published") {
      vals.push(row.party_id);
      sets.push(`queue_round = GREATEST(queue_round, (SELECT COALESCE(MIN(queue_round), 0) FROM album_photo WHERE party_id = $${vals.length} AND status = 'published'))`);
    }
  }
  if (!sets.length) return toView(row);
  sets.push("updated_at = now()");
  vals.push(row.id);
  const rows = await q.query(`UPDATE album_photo SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`, vals);
  await audit(q, row.party_id, actor, "album.update", { id: row.id, fields: Object.keys(patch) });
  return toView(rows[0]);
}

/** Mark deleted (keeps raw_pathname so a stale finalize retry can't resurrect it), then delete all objects. */
export async function removePhoto(q: Q, row: Row, actor: string): Promise<void> {
  await q.query("UPDATE album_photo SET status = 'deleted', updated_at = now() WHERE id = $1", [row.id]);
  await Promise.all([row.full_key, row.display_key, row.thumb_key, row.raw_pathname].map((k) => deleteObject(k).catch(() => {})));
  await audit(q, row.party_id, actor, "album.delete", { id: row.id });
}
