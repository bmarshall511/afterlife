/** Small JSON/error helpers for tribute + admin routes. */
export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
  // Errors from other modules (e.g. EngineError) that carry an HTTP status + code.
  const x = e as { status?: unknown; code?: unknown; message?: unknown } | null;
  if (x && typeof x.status === "number" && x.status >= 400 && x.status < 500 && typeof x.code === "string")
    return json({ error: String(x.message ?? x.code), code: x.code }, x.status);
  console.error(e);
  return json({ error: "Something went wrong on our side. Please try again.", code: "server_error" }, 500);
}

export function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

export function parseParty(v: string | null | undefined): "live" | "demo" {
  return v === "demo" ? "demo" : "live";
}

export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}
