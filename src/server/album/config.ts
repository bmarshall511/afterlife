import { safeEqual } from "@/server/tributes/config";

/** Fixed dev-only album token so /album/<token> works locally without configuration. */
export const DEV_ALBUM_TOKEN = "dev-album-2026";

/** Album invite token (ALBUM_INVITE_TOKEN). Production without it => album feature is off (null). */
export function albumToken(): string | null {
  const t = process.env.ALBUM_INVITE_TOKEN?.trim();
  if (t) return t;
  return process.env.NODE_ENV === "production" ? null : DEV_ALBUM_TOKEN;
}

export function isValidAlbumToken(token: string | null | undefined): boolean {
  const t = albumToken();
  return !!t && typeof token === "string" && token.length <= 200 && safeEqual(token, t);
}

/**
 * Relative album URL for a party, e.g. `/album/<token>` or `/album/<token>?party=demo`.
 * Returns null when the album is not configured. Server-only (the token is a capability):
 * UI should receive this string from a server component / API response, never hard-code it.
 */
export function albumPath(partyId: string): string | null {
  const t = albumToken();
  if (!t) return null;
  return `/album/${encodeURIComponent(t)}${partyId === "demo" ? "?party=demo" : ""}`;
}

export const ALBUM_LIMITS = {
  maxBytes: 25 * 1024 * 1024,
  maxCaptionChars: 140,
  maxTakenByChars: 60,
  minDimension: 64,
  displayLongEdge: 1920,
  thumbLongEdge: 480,
  fullQuality: 92,
  maxInputPixels: 120_000_000,
};

export const ALBUM_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/** Raw upload pathname: album-raw/<party>/<random 16-64 url-safe chars>.<ext> */
export const RAW_PATHNAME_RE = /^album-raw\/(live|demo)\/[A-Za-z0-9_-]{16,64}\.(jpg|jpeg|png|webp|heic|heif)$/;

export function parseRawPathname(p: unknown): { party: "live" | "demo"; ext: string } | null {
  if (typeof p !== "string") return null;
  const m = RAW_PATHNAME_RE.exec(p);
  return m ? { party: m[1] as "live" | "demo", ext: m[2] } : null;
}
