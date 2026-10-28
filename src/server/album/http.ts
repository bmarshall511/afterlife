import type { Q } from "@/server/db";
import { HttpError, clientIp } from "@/server/tributes/http";
import { rateLimit } from "@/server/tributes/ratelimit";
import { isValidAlbumToken } from "./config";

export function requireAlbumToken(token: unknown) {
  if (!isValidAlbumToken(typeof token === "string" ? token : null))
    throw new HttpError(404, "invalid_link", "This album link isn't valid. Please ask the host for the current link.");
}

/** Generous per-IP limit: party Wi-Fi puts everyone behind one address. */
export async function uploadRateLimit(q: Q, req: Request, kind: string) {
  await rateLimit(q, `album-${kind}:${clientIp(req)}`, 600, 10 * 60 * 1000);
}
