import crypto from "node:crypto";
import { getDb, type Q } from "@/server/db";
import { HttpError, clientIp, json } from "@/server/tributes/http";
import { safeEqual, sha256 } from "@/server/tributes/config";
import { rateLimit } from "@/server/tributes/ratelimit";

export const ADMIN_COOKIE = "al_admin";
export const SESSION_MS = 12 * 60 * 60 * 1000;
/** Dev-only fallback so local admin works without configuration. Never used in production. */
export const DEV_ADMIN_PASSWORD = "afterlife-dev";

export function adminPassword(): string | null {
  const p = process.env.ADMIN_PASSWORD;
  if (p) return p;
  return process.env.NODE_ENV === "production" ? null : DEV_ADMIN_PASSWORD;
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function cookie(value: string, maxAgeSec: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure}`;
}

export async function login(q: Q, req: Request, password: unknown): Promise<{ token: string; setCookie: string }> {
  await rateLimit(q, `admin-login:${clientIp(req)}`, 10, 10 * 60 * 1000);
  const expected = adminPassword();
  if (!expected) throw new HttpError(503, "not_configured", "ADMIN_PASSWORD is not configured on the server.");
  if (typeof password !== "string" || !safeEqual(password, expected)) throw new HttpError(401, "bad_password", "That password isn't right.");
  const token = crypto.randomBytes(32).toString("base64url");
  await q.query("DELETE FROM admin_session WHERE expires_at < now()");
  await q.query("INSERT INTO admin_session (id_hash, expires_at) VALUES ($1, $2)", [sha256(token), new Date(Date.now() + SESSION_MS)]);
  await q.query("INSERT INTO audit (party_id, actor, action, detail) VALUES (NULL,'admin','admin.login',$1)", [JSON.stringify({ ip: clientIp(req) })]);
  return { token, setCookie: cookie(token, SESSION_MS / 1000) };
}

export async function logout(q: Q, req: Request): Promise<string> {
  const t = readCookie(req, ADMIN_COOKIE);
  if (t) await q.query("DELETE FROM admin_session WHERE id_hash = $1", [sha256(t)]);
  return cookie("", 0);
}

/** True when the request carries a valid, unexpired admin session cookie. */
export async function isAdmin(req: Request, q?: Q): Promise<boolean> {
  const t = readCookie(req, ADMIN_COOKIE);
  if (!t || t.length > 200) return false;
  const db = q ?? (await getDb());
  const rows = await db.query("SELECT 1 FROM admin_session WHERE id_hash = $1 AND expires_at > now()", [sha256(t)]);
  return rows.length > 0;
}

export interface AdminCtx {
  actor: "admin";
}

/**
 * Gate for EVERY /api/admin route (except login/logout):
 *   const a = await requireAdmin(req); if (a instanceof Response) return a;
 */
export async function requireAdmin(req: Request): Promise<AdminCtx | Response> {
  if (await isAdmin(req)) return { actor: "admin" };
  return json({ error: "Admin sign-in required.", code: "unauthorized" }, 401);
}
