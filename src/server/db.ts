import fs from "node:fs";
import path from "node:path";

/**
 * Minimal SQL access layer. Production: Postgres (Neon) via `pg` when DATABASE_URL is set.
 * Local/dev/test: embedded PGlite persisted under .data/ (or in-memory when PGLITE_MEMORY=1).
 * All authoritative state lives here; never in process memory.
 */
export type Row = Record<string, any>;
export interface Q {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}
export interface Db extends Q {
  tx<T>(fn: (q: Q) => Promise<T>): Promise<T>;
}

let dbPromise: Promise<Db> | null = null;
const g = globalThis as unknown as { __afterlifeDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (g.__afterlifeDb) return g.__afterlifeDb;
  dbPromise = init();
  g.__afterlifeDb = dbPromise;
  return dbPromise;
}

async function init(): Promise<Db> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  // Embedded PGlite is for local/dev only; on Vercel it would be per-instance and ephemeral.
  if (!url && process.env.VERCEL) throw new Error("DATABASE_URL is not set: connect a Postgres (Neon) database to this project.");
  const db = url ? await pgDb(url) : await pgliteDb();
  await migrate(db);
  return db;
}

async function pgDb(url: string): Promise<Db> {
  const { Pool } = (await import("pg")).default ?? (await import("pg"));
  const pool = new Pool({ connectionString: url, max: 5, ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false } });
  const run = (c: { query: (s: string, p?: unknown[]) => Promise<{ rows: Row[] }> }): Q => ({
    query: async (s, p) => (await c.query(s, p)).rows as any,
  });
  return {
    ...run(pool),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const r = await fn(run(client));
        await client.query("COMMIT");
        return r;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

async function pgliteDb(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const mem = process.env.PGLITE_MEMORY === "1";
  const dir = path.resolve(process.cwd(), ".data", process.env.PGLITE_DIR ?? "pglite");
  if (!mem) fs.mkdirSync(dir, { recursive: true });
  const pg = mem ? new PGlite() : new PGlite(dir);
  await pg.waitReady;
  const wrap = (c: { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }): Q => ({
    query: async (s, p) => (await c.query(s, p as any[])).rows as any,
  });
  // PGlite is single-connection; serialize transactions through a promise chain.
  let chain: Promise<unknown> = Promise.resolve();
  return {
    ...wrap(pg),
    tx(fn) {
      const next = chain.then(() => pg.transaction((t) => fn(wrap(t))));
      chain = next.catch(() => {});
      return next;
    },
  };
}

export async function migrate(db: Q) {
  await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const dir = path.resolve(process.cwd(), "db", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const done = new Set((await db.query<{ name: string }>("SELECT name FROM schema_migrations")).map((r) => r.name));
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    for (const stmt of splitSql(sql)) await db.query(stmt);
    await db.query("INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [f]);
  }
}

function splitSql(sql: string) {
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
}
