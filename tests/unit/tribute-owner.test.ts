import crypto from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { jpeg, setupEnv } from "./tribute-helpers";

setupEnv();
const { getDb } = await import("@/server/db");
const { hashSecret, cookieName } = await import("@/server/session");
const postRoute = await import("@/app/api/tributes/route");
const idRoute = await import("@/app/api/tributes/[id]/route");
const mineRoute = await import("@/app/api/tributes/mine/route");
const photoRoute = await import("@/app/api/tributes/photo/[id]/route");
const { parseEditLink } = await import("@/app/remember/MyTributes");

let db: Awaited<ReturnType<typeof getDb>>;
let photo: Uint8Array<ArrayBuffer>;
beforeAll(async () => { db = await getDb(); photo = new Uint8Array(await jpeg(400, 300)); });

async function guest(party: "live" | "demo") {
  const teamId = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString("base64url");
  await db.query("INSERT INTO team (id, party_id, name, color, avatar, invite_code) VALUES ($1,$2,$3,'#fff','x',$4)", [teamId, party, "T" + teamId.slice(0, 4), teamId.slice(0, 8)]);
  await db.query("INSERT INTO member (id, party_id, team_id, display_name, session_hash) VALUES ($1,$2,$3,'M',$4)", [crypto.randomUUID(), party, teamId, hashSecret(secret)]);
  return { teamId, cookie: `${cookieName(party)}=${secret}` };
}
async function upload(party: "live" | "demo", cookie?: string, name = "Abuelo") {
  const fd = new FormData();
  fd.set("token", "test-invite-token");
  fd.set("party", party);
  fd.set("photo", new Blob([photo], { type: "image/jpeg" }), "p.jpg");
  fd.set("personName", name);
  fd.set("consent", "true");
  const r = await postRoute.POST(new Request("http://x/api/tributes", { method: "POST", body: fd, headers: cookie ? { cookie } : {} }));
  expect(r.status).toBe(201);
  return r.json() as Promise<{ id: string; editToken: string }>;
}
const mine = async (party: string, cookie?: string, items: unknown[] = []) =>
  (await mineRoute.POST(new Request("http://x/api/tributes/mine", { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ party, items }) }))).json();
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const owner = async (id: string) => (await db.query("SELECT submitted_team_id FROM tribute WHERE id=$1", [id]))[0].submitted_team_id;

describe("tribute ownership by team session", () => {
  it("submitted_team_id is set only with a valid session for that party", async () => {
    const g = await guest("demo");
    expect(await owner((await upload("demo", g.cookie)).id)).toBe(g.teamId);
    expect(await owner((await upload("demo")).id)).toBeNull();
    expect(await owner((await upload("demo", `${cookieName("demo")}=forged-secret-value-123456789`)).id)).toBeNull();
    expect(await owner((await upload("live", g.cookie)).id)).toBeNull(); // demo session doesn't count on live
  });

  it("team can list, edit and delete its tributes; other teams cannot", async () => {
    const a = await guest("demo"), b = await guest("demo");
    const t1 = await upload("demo", a.cookie, "Tía Lupe");
    const t2 = await upload("demo", a.cookie, "Tío Beto");
    const tb = await upload("demo", b.cookie, "B's");
    const la = await mine("demo", a.cookie);
    expect(la.tributes.map((t: any) => t.id).sort()).toEqual([t1.id, t2.id].sort());
    expect(la.tributes[0]).toMatchObject({ canEdit: true, via: "team", status: "published" });
    expect(la.tributes.some((t: any) => t.id === tb.id)).toBe(false);
    expect((await mine("demo")).tributes).toEqual([]);
    expect((await mine("live", a.cookie)).tributes).toEqual([]);
    // b can't touch a's
    const url = `http://x/api/tributes/${t1.id}`;
    expect((await idRoute.PATCH(new Request(url, { method: "PATCH", headers: { cookie: b.cookie }, body: JSON.stringify({ personName: "x" }) }), ctx(t1.id))).status).toBe(404);
    expect((await idRoute.DELETE(new Request(url, { method: "DELETE", headers: { cookie: b.cookie } }), ctx(t1.id))).status).toBe(404);
    expect((await idRoute.GET(new Request(url), ctx(t1.id))).status).toBe(404);
    // a can
    const p = await idRoute.PATCH(new Request(url, { method: "PATCH", headers: { cookie: a.cookie }, body: JSON.stringify({ personName: "Tía Lupita" }) }), ctx(t1.id));
    expect((await p.json()).tribute.personName).toBe("Tía Lupita");
    expect((await idRoute.DELETE(new Request(url, { method: "DELETE", headers: { cookie: a.cookie } }), ctx(t1.id))).status).toBe(200);
    expect((await mine("demo", a.cookie)).tributes.map((t: any) => t.id)).toEqual([t2.id]);
  });

  it("edit-token path still works and tokens add extra tributes to the list", async () => {
    const a = await guest("demo");
    const anon = await upload("demo", undefined, "Anon");
    const other = await upload("demo", undefined, "Other");
    const l = await mine("demo", a.cookie, [{ id: anon.id, token: anon.editToken }, { id: other.id, token: "wrong-token-xxxxxxxxxxxxxxxx" }]);
    expect(l.tributes.map((t: any) => t.id)).toEqual([anon.id]);
    expect(l.tributes[0].via).toBe("token");
    expect(l.unknown).toContain(other.id);
    const r = await idRoute.PATCH(new Request(`http://x/api/tributes/${anon.id}`, { method: "PATCH", headers: { authorization: `Bearer ${anon.editToken}` }, body: JSON.stringify({ remembrance: "hi" }) }), ctx(anon.id));
    expect(r.status).toBe(200);
    // GET variant with header
    const g = await (await mineRoute.GET(new Request("http://x/api/tributes/mine?party=demo", { headers: { "x-tribute-tokens": `${anon.id}:${anon.editToken}` } }))).json();
    expect(g.tributes.map((t: any) => t.id)).toEqual([anon.id]);
  });

  it("hidden-by-host status is shown and the owner team can still see its photo", async () => {
    const a = await guest("demo");
    const t = await upload("demo", a.cookie, "Hidden");
    await db.query("UPDATE tribute SET status='hidden' WHERE id=$1", [t.id]);
    const l = await mine("demo", a.cookie);
    expect(l.tributes.find((x: any) => x.id === t.id).status).toBe("hidden");
    const u = `http://x/api/tributes/photo/${t.id}?size=thumb`;
    expect((await photoRoute.GET(new Request(u), ctx(t.id))).status).toBe(404);
    expect((await photoRoute.GET(new Request(u, { headers: { cookie: a.cookie } }), ctx(t.id))).status).toBe(200);
  });

  it("parses pasted private edit links", () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
    const tok = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_";
    expect(parseEditLink(`https://party.example/remember/edit/${id}#${tok}`)).toEqual({ id, token: tok });
    expect(parseEditLink(`  http://localhost:3000/remember/edit/${id.toUpperCase()}#${tok}\n`)).toEqual({ id, token: tok });
    expect(parseEditLink(`https://x/remember/edit/${id}`)).toBeNull();
    expect(parseEditLink("hello")).toBeNull();
  });
});
