import { getDb } from "@/server/db";
import { putObject, storageKind } from "@/server/storage";
import { HttpError, errorResponse, json, parseParty } from "@/server/tributes/http";
import { ALBUM_CONTENT_TYPES, ALBUM_LIMITS, parseRawPathname } from "@/server/album/config";
import { requireAlbumToken, uploadRateLimit } from "@/server/album/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Local/dev fallback only (no Blob store): multipart {token, party, pathname, photo} -> raw object. */
export async function POST(req: Request) {
  try {
    if (storageKind() !== "local") throw new HttpError(409, "use_direct_upload", "Uploads go directly to storage; please refresh the page.");
    if (Number(req.headers.get("content-length") ?? 0) > ALBUM_LIMITS.maxBytes + 64 * 1024) throw new HttpError(413, "too_large", "That photo is too large (25 MB max).");
    let form: FormData;
    try { form = await req.formData(); } catch { throw new HttpError(400, "invalid", "The upload didn't come through. Please try again."); }
    requireAlbumToken(form.get("token"));
    const party = parseParty(String(form.get("party") ?? ""));
    const pathname = String(form.get("pathname") ?? "");
    const parsed = parseRawPathname(pathname);
    if (!parsed || parsed.party !== party) throw new HttpError(400, "invalid_upload", "Invalid upload name.");
    const db = await getDb();
    await uploadRateLimit(db, req, "token");
    const photo = form.get("photo");
    if (!(photo instanceof Blob) || photo.size === 0) throw new HttpError(400, "no_photo", "Please choose a photo.");
    if (photo.size > ALBUM_LIMITS.maxBytes) throw new HttpError(413, "too_large", "That photo is too large (25 MB max).");
    if (photo.type && !ALBUM_CONTENT_TYPES.includes(photo.type)) throw new HttpError(415, "bad_type", "Only photos can be added (JPEG, PNG, WebP or iPhone photos).");
    await putObject(pathname, Buffer.from(await photo.arrayBuffer()), photo.type || "application/octet-stream");
    return json({ pathname }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
