import { getDb, type Db } from "@/server/db";
import { errorResponse } from "@/server/tributes/http";
import { requireAdmin, type AdminCtx } from "./auth";

type Handler<C> = (req: Request, ctx: { db: Db; admin: AdminCtx; params: C }) => Promise<Response>;

/** Wraps an admin route: enforces requireAdmin() before anything else, then maps errors to JSON. */
export function adminRoute<C = Record<string, never>>(h: Handler<C>) {
  return async (req: Request, ctx?: { params?: Promise<C> }) => {
    try {
      const admin = await requireAdmin(req);
      if (admin instanceof Response) return admin;
      const db = await getDb();
      const params = ((await ctx?.params) ?? {}) as C;
      return await h(req, { db, admin, params });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function body(req: Request): Promise<Record<string, any>> {
  const b = await req.json().catch(() => null);
  return b && typeof b === "object" ? b : {};
}
