import crypto from "node:crypto";
import { z } from "zod";
import type { Q, Row } from "@/server/db";
import { deleteObject, getObject, putObject } from "@/server/storage";
import { HttpError } from "./http";
import { LIMITS, safeEqual, sha256 } from "./config";
import { normalizeUpload, renderDerivatives } from "./process";

export type PartyId = "live" | "demo";

/** Plain-text cleanup: strip control chars, collapse whitespace runs (keep single newlines). */
export function cleanText(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  return s
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f​-‏‪-‮]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, max);
}

const unit = z.coerce.number().min(0).max(1);
export const textFields = z.object({
  personName: z.string().transform((s) => cleanText(s, LIMITS.maxNameChars)).pipe(z.string().min(1, "Please add their name.")),
  remembrance: z.string().optional().default("").refine((s) => s.replace(/\r\n?/g, "\n").trim().length <= LIMITS.maxRemembranceChars, "Please keep the remembrance to 300 characters.").transform((s) => cleanText(s, LIMITS.maxRemembranceChars)),
  attribution: z.string().optional().default("").transform((s) => cleanText(s, LIMITS.maxAttributionChars)),
});
export const layoutFields = z.object({
  fit: z.enum(["contain", "cover"]).default("contain"),
  focalX: unit.default(0.5),
  focalY: unit.default(0.5),
});
export const patchSchema = z.object({
  personName: textFields.shape.personName.optional(),
  remembrance: textFields.shape.remembrance.optional(),
  attribution: textFields.shape.attribution.optional(),
  fit: z.enum(["contain", "cover"]).optional(),
  focalX: unit.optional(),
  focalY: unit.optional(),
  rotation: z.coerce.number().refine((n) => [0, 90, 180, 270].includes(n), "rotation must be 0/90/180/270").optional(),
});
export const adminPatchSchema = patchSchema.extend({
  status: z.enum(["published", "hidden"]).optional(),
  priority: z.coerce.number().int().min(0).max(1000).optional(),
});
export type TributePatch = z.infer<typeof adminPatchSchema>;

function zodMessage(e: z.ZodError) {
  return e.issues[0]?.message ?? "Invalid input";
}
export function parseOr400<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new HttpError(400, "invalid", zodMessage(r.error));
  return r.data;
}

export interface TributeView {
  id: string;
  partyId: PartyId;
  personName: string;
  remembrance: string;
  attribution: string;
  width: number;
  height: number;
  fit: "contain" | "cover";
  focalX: number;
  focalY: number;
  rotation: number;
  status: "published" | "hidden" | "deleted";
  displayCount: number;
  lastShownAt: string | null;
  priority: number;
  createdAt: string;
  version: number;
  photoUrl: string;
  thumbUrl: string;
}

export function toView(r: Row): TributeView {
  const v = new Date(r.updated_at).getTime();
  return {
    id: r.id,
    partyId: r.party_id,
    personName: r.person_name,
    remembrance: r.remembrance,
    attribution: r.attribution,
    width: r.width,
    height: r.height,
    fit: r.fit,
    focalX: Number(r.focal_x),
    focalY: Number(r.focal_y),
    rotation: r.rotation,
    status: r.status,
    displayCount: r.display_count,
    lastShownAt: r.last_shown_at ? new Date(r.last_shown_at).toISOString() : null,
    priority: r.priority,
    createdAt: new Date(r.created_at).toISOString(),
    version: v,
    photoUrl: `/api/tributes/photo/${r.id}?size=display&v=${v}`,
    thumbUrl: `/api/tributes/photo/${r.id}?size=thumb&v=${v}`,
  };
}

const rand = () => crypto.randomBytes(12).toString("base64url");
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

async function storeDerivatives(partyId: string, id: string, original: Buffer | null, d: Awaited<ReturnType<typeof renderDerivatives>>) {
  const prefix = `tributes/${partyId}/${id}/${rand()}`;
  const keys = { display: `${prefix}-display.jpg`, thumb: `${prefix}-thumb.webp`, original: original ? `${prefix}-original.jpg` : null };
  await putObject(keys.display, d.display, "image/jpeg");
  await putObject(keys.thumb, d.thumb, "image/webp");
  if (original && keys.original) await putObject(keys.original, original, "image/jpeg");
  return keys;
}

export interface CreateInput {
  partyId: PartyId;
  photo: Buffer;
  personName: unknown;
  remembrance?: unknown;
  attribution?: unknown;
  fit?: unknown;
  focalX?: unknown;
  focalY?: unknown;
  consent: unknown;
}

/** Validate, process and store a tribute. The row is inserted (published) only after storage succeeds. */
export async function createTribute(q: Q, input: CreateInput): Promise<{ id: string; editToken: string; tribute: TributeView }> {
  if (input.consent !== true && input.consent !== "true" && input.consent !== "on")
    throw new HttpError(400, "consent_required", "Please confirm it's okay to show this photo and text on the party TV.");
  const text = parseOr400(textFields, { personName: input.personName ?? "", remembrance: input.remembrance ?? "", attribution: input.attribution ?? "" });
  const layout = parseOr400(layoutFields, {
    fit: input.fit || undefined,
    focalX: input.focalX ?? undefined,
    focalY: input.focalY ?? undefined,
  });
  const original = await normalizeUpload(input.photo);
  const d = await renderDerivatives(original, 0);
  const id = crypto.randomUUID();
  const editToken = crypto.randomBytes(32).toString("base64url");
  const keys = await storeDerivatives(input.partyId, id, original, d);
  try {
    const rows = await q.query(
      `INSERT INTO tribute (id, party_id, person_name, remembrance, attribution, photo_key, thumb_key, original_key,
         width, height, fit, focal_x, focal_y, rotation, status, consent, edit_token_hash, queue_round)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,0,'published',true,$14,
         (SELECT COALESCE(MIN(queue_round), 0) FROM tribute WHERE party_id = $2 AND status = 'published')) RETURNING *`,
      [id, input.partyId, text.personName, text.remembrance, text.attribution, keys.display, keys.thumb, keys.original,
        d.width, d.height, layout.fit, layout.focalX, layout.focalY, sha256(editToken)],
    );
    await audit(q, input.partyId, "guest", "tribute.create", { id });
    return { id, editToken, tribute: toView(rows[0]) };
  } catch (e) {
    await Promise.all([deleteObject(keys.display), deleteObject(keys.thumb), deleteObject(keys.original)]).catch(() => {});
    throw e;
  }
}

export async function getRow(q: Q, id: string): Promise<Row | null> {
  if (!isUuid(id)) return null;
  const rows = await q.query("SELECT * FROM tribute WHERE id = $1", [id]);
  return rows[0] ?? null;
}

/** Bearer edit-token check; only this tribute is reachable, deleted tributes are gone. */
export async function getWithToken(q: Q, id: string, token: string | null): Promise<Row> {
  const row = await getRow(q, id);
  if (!row || row.status === "deleted" || !token || !safeEqual(sha256(token), row.edit_token_hash))
    throw new HttpError(404, "not_found", "We couldn't find that tribute. The link may be incomplete or it was removed.");
  return row;
}

export function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

export async function updateTribute(q: Q, row: Row, patch: TributePatch, actor: string): Promise<TributeView> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  const add = (col: string, v: unknown) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  };
  if (patch.personName !== undefined) add("person_name", patch.personName);
  if (patch.remembrance !== undefined) add("remembrance", patch.remembrance);
  if (patch.attribution !== undefined) add("attribution", patch.attribution);
  if (patch.fit !== undefined) add("fit", patch.fit);
  if (patch.focalX !== undefined) add("focal_x", patch.focalX);
  if (patch.focalY !== undefined) add("focal_y", patch.focalY);
  if (patch.status !== undefined) {
    add("status", patch.status);
    if (patch.status === "published" && row.status !== "published") {
      vals.push(row.party_id);
      sets.push(`queue_round = GREATEST(queue_round, (SELECT COALESCE(MIN(queue_round), 0) FROM tribute WHERE party_id = $${vals.length} AND status = 'published'))`);
    }
  }
  if (patch.priority !== undefined) add("priority", patch.priority);
  let oldKeys: (string | null)[] = [];
  if (patch.rotation !== undefined && patch.rotation !== row.rotation) {
    const src = (row.original_key && (await getObject(row.original_key))) || (await getObject(row.photo_key));
    if (!src) throw new HttpError(500, "photo_missing", "The stored photo could not be found.");
    // If we only have the display derivative (no original), rotate relative to the current state.
    const rel = row.original_key ? patch.rotation : (patch.rotation - row.rotation + 360) % 360;
    const d = await renderDerivatives(src, rel);
    const keys = await storeDerivatives(row.party_id, row.id, null, d);
    oldKeys = [row.photo_key, row.thumb_key];
    add("rotation", patch.rotation);
    add("photo_key", keys.display);
    add("thumb_key", keys.thumb);
    add("width", d.width);
    add("height", d.height);
  }
  if (!sets.length) return toView(row);
  sets.push("updated_at = now()");
  vals.push(row.id);
  const rows = await q.query(`UPDATE tribute SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`, vals);
  await Promise.all(oldKeys.map((k) => deleteObject(k).catch(() => {})));
  await audit(q, row.party_id, actor, "tribute.update", { id: row.id, fields: Object.keys(patch) });
  return toView(rows[0]);
}

/** Removal: mark deleted (keeps queue history consistent), then delete every stored photo object. */
export async function removeTribute(q: Q, row: Row, actor: string): Promise<void> {
  await q.query("UPDATE tribute SET status = 'deleted', updated_at = now() WHERE id = $1", [row.id]);
  await Promise.all([deleteObject(row.photo_key), deleteObject(row.thumb_key), deleteObject(row.original_key)].map((p) => p.catch(() => {})));
  await audit(q, row.party_id, actor, "tribute.delete", { id: row.id });
}

export async function audit(q: Q, partyId: string | null, actor: string, action: string, detail: unknown = {}) {
  await q.query("INSERT INTO audit (party_id, actor, action, detail) VALUES ($1,$2,$3,$4)", [partyId, actor, action, JSON.stringify(detail)]);
}
