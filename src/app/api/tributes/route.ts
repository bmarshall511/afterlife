import { getDb } from "@/server/db";
import { HttpError, clientIp, errorResponse, json, parseParty } from "@/server/tributes/http";
import { isValidInvite, LIMITS } from "@/server/tributes/config";
import { rateLimit } from "@/server/tributes/ratelimit";
import { createTribute } from "@/server/tributes/service";
import { sessionTeam } from "@/server/tributes/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST multipart: token, party?, photo, personName, remembrance?, attribution?, fit?, focalX?, focalY?, consent=true */
export async function POST(req: Request) {
  try {
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > LIMITS.maxBytes + 64 * 1024) throw new HttpError(413, "too_large", "That photo is too large (15 MB max).");
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new HttpError(400, "invalid", "The upload didn't come through. Please try again.");
    }
    if (!isValidInvite(String(form.get("token") ?? ""))) throw new HttpError(404, "invalid_link", "This upload link isn't valid. Please ask the host for the current link.");
    const db = await getDb();
    await rateLimit(db, `tribute-upload:${clientIp(req)}`, 30, 10 * 60 * 1000);
    const photo = form.get("photo");
    if (!(photo instanceof Blob) || photo.size === 0) throw new HttpError(400, "no_photo", "Please choose a photo.");
    if (photo.size > LIMITS.maxBytes) throw new HttpError(413, "too_large", "That photo is too large (15 MB max). Try a smaller copy or a screenshot.");
    const buf = Buffer.from(await photo.arrayBuffer());
    const s = (k: string) => (form.get(k) == null ? undefined : String(form.get(k)));
    const partyId = parseParty(s("party"));
    const r = await createTribute(db, {
      partyId,
      submittedTeamId: await sessionTeam(db, req, partyId),
      photo: buf,
      personName: s("personName") ?? "",
      remembrance: s("remembrance"),
      attribution: s("attribution"),
      fit: s("fit"),
      focalX: s("focalX"),
      focalY: s("focalY"),
      consent: s("consent"),
    });
    return json({ id: r.id, editToken: r.editToken, tribute: r.tribute }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
