import { beforeAll, describe, expect, it } from "vitest";
import { jpeg, setupEnv } from "./tribute-helpers";

setupEnv();
const { getDb } = await import("@/server/db");
const loginRoute = await import("@/app/api/admin/login/route");
const svc = await import("@/server/tributes/service");

let cookie = "";
let db: Awaited<ReturnType<typeof getDb>>;
beforeAll(async () => {
  db = await getDb();
  const r = await loginRoute.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ password: "correct horse battery" }) }));
  cookie = r.headers.get("set-cookie")!.split(";")[0];
});
const req = (url: string, method = "GET", body?: unknown) =>
  new Request(`http://x${url}`, { method, headers: { cookie, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("admin routes (authenticated)", () => {
  it("party overview, pause/resume, settings via engine", async () => {
    const party = await import("@/app/api/admin/party/route");
    const g = await (await party.GET(req("/api/admin/party?party=demo"))).json();
    expect(g.urls.remember).toContain("/remember/test-invite-token?party=demo");
    const s = await party.POST(req("/api/admin/party", "POST", { party: "demo", action: "settings", patch: { intervalMs: 90000 } }));
    expect(s.status).toBe(200);
    const row = (await db.query("SELECT settings FROM party WHERE id='demo'"))[0];
    expect(row.settings.intervalMs).toBe(90000);
  });

  it("content listing and toggles persist", async () => {
    const content = await import("@/app/api/admin/content/route");
    const g = await (await content.GET(req("/api/admin/content?party=demo"))).json();
    expect(g.items.length).toBeGreaterThan(10);
    const id = g.items[0].id;
    expect((await content.POST(req("/api/admin/content", "POST", { contentId: id, enabled: false }))).status).toBe(200);
    expect((await db.query("SELECT enabled FROM content_override WHERE content_id=$1", [id]))[0].enabled).toBe(false);
    const f = await content.POST(req("/api/admin/content", "POST", { party: "demo", family: "truth", enabled: false }));
    expect((await f.json()).disabledFamilies).toContain("truth");
  });

  it("QR png/svg and diagnostics", async () => {
    const qr = await import("@/app/api/admin/qr/route");
    const png = await qr.GET(req("/api/admin/qr?target=join&format=png"));
    expect(png.headers.get("content-type")).toBe("image/png");
    const svg = await qr.GET(req("/api/admin/qr?target=remember&format=svg"));
    expect(await svg.text()).toContain("<svg");
    const diag = await import("@/app/api/admin/diagnostics/route");
    const d = await (await diag.GET(req("/api/admin/diagnostics"))).json();
    expect(d.storage).toBe("local");
  });

  it("tribute admin: list, hide, feature, delete, demo reset keeps live tributes", async () => {
    const photo = await jpeg(300, 200);
    const live = await svc.createTribute(db, { partyId: "live", photo, personName: "Real", consent: true });
    await svc.createTribute(db, { partyId: "demo", photo, personName: "Sample", consent: true });
    const list = await import("@/app/api/admin/tributes/route");
    const one = await import("@/app/api/admin/tributes/[id]/route");
    const l = await (await list.GET(req("/api/admin/tributes?party=live&q=rea"))).json();
    expect(l.tributes.map((t: any) => t.personName)).toEqual(["Real"]);
    const h = await (await one.PATCH(req(`/api/admin/tributes/${live.id}`, "PATCH", { status: "hidden", priority: 100 }), ctx(live.id))).json();
    expect(h.tribute.status).toBe("hidden");
    expect((await one.DELETE(req(`/api/admin/tributes/${live.id}`, "DELETE"), ctx(live.id))).status).toBe(400);
    const party = await import("@/app/api/admin/party/route");
    expect((await party.POST(req("/api/admin/party", "POST", { party: "demo", action: "reset", confirm: true }))).status).toBe(200);
    expect((await db.query("SELECT count(*)::int n FROM tribute WHERE party_id='demo'"))[0].n).toBe(0);
    expect((await db.query("SELECT status FROM tribute WHERE id=$1", [live.id]))[0].status).toBe("hidden");
    expect((await one.DELETE(req(`/api/admin/tributes/${live.id}?confirm=1`, "DELETE"), ctx(live.id))).status).toBe(200);
  });

  it("teams list and score adjustment requires a reason", async () => {
    const teams = await import("@/app/api/admin/teams/route");
    expect((await teams.GET(req("/api/admin/teams?party=demo"))).status).toBe(200);
    const r = await teams.POST(req("/api/admin/teams", "POST", { party: "demo", action: "adjust", teamId: "00000000-0000-4000-8000-000000000000", points: 50, reason: "" }));
    expect((await r.json()).code).toBe("reason_required");
  });
});
