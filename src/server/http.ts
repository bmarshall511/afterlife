import { NextResponse } from "next/server";
import { EngineError } from "@/server/engine/types";

/** Shared JSON helpers for engine routes. Errors are `{error, code}` with a proper status. */
export function json(data: unknown, init: number | ResponseInit = 200) {
  const r = NextResponse.json(data, typeof init === "number" ? { status: init } : init);
  r.headers.set("Cache-Control", "no-store");
  return r;
}

export function err(code: string, error: string, status = 400) {
  return json({ error, code }, status);
}

export function handle(e: unknown) {
  if (e instanceof EngineError) return err(e.code, e.message, e.status);
  if (e instanceof SyntaxError) return err("invalid", "malformed JSON", 400);
  console.error("[api]", e);
  return err("server", "Something went wrong", 500);
}

export async function body(req: Request): Promise<Record<string, any>> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 16_384) throw new EngineError("invalid", "body too large", 413);
  const t = await req.text();
  if (t.length > 16_384) throw new EngineError("invalid", "body too large", 413);
  const v = t ? JSON.parse(t) : {};
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new EngineError("invalid", "expected object", 400);
  return v;
}
