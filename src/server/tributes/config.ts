import crypto from "node:crypto";

/** Fixed dev-only invite token so /remember/<token> works locally without configuration. */
export const DEV_INVITE_TOKEN = "dev-ofrenda-2026";

export function inviteToken(): string | null {
  const t = process.env.TRIBUTE_INVITE_TOKEN?.trim();
  if (t) return t;
  return process.env.NODE_ENV === "production" ? null : DEV_INVITE_TOKEN;
}

export function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const x = crypto.createHash("sha256").update(a).digest();
  const y = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(x, y);
}

export function isValidInvite(token: string | null | undefined) {
  const t = inviteToken();
  return !!t && typeof token === "string" && safeEqual(token, t);
}

export function publicBaseUrl(req?: Request) {
  const env = process.env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (env) return env;
  if (req) return new URL(req.url).origin;
  return "http://localhost:3000";
}

export const LIMITS = {
  maxBytes: 15 * 1024 * 1024,
  maxNameChars: 80,
  maxRemembranceChars: 300,
  maxAttributionChars: 80,
  minDimension: 64,
  displayLongEdge: 1920,
  thumbLongEdge: 400,
  originalLongEdge: 2400,
};
