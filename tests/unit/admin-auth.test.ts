import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { setupEnv } from "./tribute-helpers";

setupEnv();
const { getDb } = await import("@/server/db");
const auth = await import("@/server/admin/auth");
const loginRoute = await import("@/app/api/admin/login/route");

let db: Awaited<ReturnType<typeof getDb>>;
beforeAll(async () => { db = await getDb(); });

const ROOT = path.resolve(__dirname, "../../src/app/api/admin");
function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? routeFiles(path.join(dir, e.name)) : e.name === "route.ts" ? [path.join(dir, e.name)] : []);
}
const PUBLIC = new Set(["login/route.ts", "logout/route.ts"]);
const ID = "00000000-0000-4000-8000-000000000000";

async function login(password: string, ip = "1.2.3.4") {
  return loginRoute.POST(new Request("http://x/api/admin/login", { method: "POST", headers: { "x-forwarded-for": ip }, body: JSON.stringify({ password }) }));
}

describe("admin auth", () => {
  it("every admin route handler returns 401 without a session", async () => {
    const files = routeFiles(ROOT).filter((f) => !PUBLIC.has(path.relative(ROOT, f)));
    expect(files.length).toBeGreaterThanOrEqual(9);
    let checked = 0;
    for (const f of files) {
      const mod = await import(f);
      for (const m of ["GET", "POST", "PATCH", "DELETE", "PUT"]) {
        if (typeof mod[m] !== "function") continue;
        const req = new Request(`http://x/api/admin/x?party=live&confirm=1`, {
          method: m,
          headers: { cookie: "al_admin=forged-value", "content-type": "application/json" },
          body: m === "GET" ? undefined : JSON.stringify({ action: "reset", party: "demo", confirm: true }),
        });
        const res = await mod[m](req, { params: Promise.resolve({ id: ID }) });
        expect(res.status, `${m} ${path.relative(ROOT, f)}`).toBe(401);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(12);
  });

  it("rejects the wrong password and accepts the right one with a strict httpOnly cookie", async () => {
    expect((await login("wrong")).status).toBe(401);
    const ok = await login("correct horse battery");
    expect(ok.status).toBe(200);
    const c = ok.headers.get("set-cookie")!;
    expect(c).toMatch(/^al_admin=[\w-]{40,};/);
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Strict");
    const token = /al_admin=([^;]+)/.exec(c)![1];
    const req = new Request("http://x", { headers: { cookie: `al_admin=${token}` } });
    expect(await auth.isAdmin(req)).toBe(true);
    const sessionRoute = await import("@/app/api/admin/session/route");
    expect((await sessionRoute.GET(req)).status).toBe(200);
    // logout invalidates
    const logoutRoute = await import("@/app/api/admin/logout/route");
    await logoutRoute.POST(req);
    expect(await auth.isAdmin(req)).toBe(false);
  });

  it("expired sessions are rejected", async () => {
    const ok = await login("correct horse battery", "5.5.5.5");
    const token = /al_admin=([^;]+)/.exec(ok.headers.get("set-cookie")!)![1];
    const req = new Request("http://x", { headers: { cookie: `al_admin=${token}` } });
    expect(await auth.isAdmin(req)).toBe(true);
    await db.query("UPDATE admin_session SET expires_at = now() - interval '1 second'");
    expect(await auth.isAdmin(req)).toBe(false);
  });

  it("rate-limits repeated login attempts", async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await login("nope", "9.9.9.9")).status;
    expect(last).toBe(429);
  });

  it("admin can edit/hide a tribute; reset refuses live party", async () => {
    const ok = await login("correct horse battery", "7.7.7.7");
    const cookie = ok.headers.get("set-cookie")!.split(";")[0];
    const party = await import("@/app/api/admin/party/route");
    const res = await party.POST(new Request("http://x/api/admin/party", { method: "POST", headers: { cookie }, body: JSON.stringify({ action: "reset", party: "live", confirm: true }) }));
    expect(res.status).toBe(403);
    const noConfirm = await party.POST(new Request("http://x/api/admin/party", { method: "POST", headers: { cookie }, body: JSON.stringify({ action: "reset", party: "demo" }) }));
    expect(noConfirm.status).toBe(400);
  });
});
