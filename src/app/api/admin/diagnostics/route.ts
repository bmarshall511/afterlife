import { adminRoute } from "@/server/admin/route";
import { json, parseParty } from "@/server/tributes/http";
import { storageKind } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = adminRoute(async (req, { db }) => {
  const party = parseParty(new URL(req.url).searchParams.get("party"));
  const p = await db.query("SELECT status, mode, phase, version, updated_at FROM party WHERE id = $1", [party]);
  const counts = await db.query(
    "SELECT status, COUNT(*)::int AS n FROM tribute WHERE party_id = $1 GROUP BY status",
    [party],
  );
  const audit = await db.query("SELECT id, party_id, actor, action, detail, at FROM audit WHERE party_id = $1 OR party_id IS NULL ORDER BY id DESC LIMIT 50", [party]);
  return json({
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.npm_package_version ?? "dev",
    serverTime: new Date().toISOString(),
    serverNow: Date.now(),
    db: process.env.DATABASE_URL ? "postgres" : process.env.PGLITE_MEMORY === "1" ? "pglite-memory" : "pglite",
    storage: storageKind(),
    party: p[0] ?? null,
    tributeCounts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
    env: {
      adminPassword: !!process.env.ADMIN_PASSWORD,
      publicBaseUrl: process.env.PUBLIC_BASE_URL ?? null,
      tributeInviteToken: !!process.env.TRIBUTE_INVITE_TOKEN,
      blob: !!process.env.BLOB_READ_WRITE_TOKEN,
    },
    audit,
  });
});
