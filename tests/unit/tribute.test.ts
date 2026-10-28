import { beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { jpeg, setupEnv } from "./tribute-helpers";

setupEnv();
const { getDb } = await import("@/server/db");
const svc = await import("@/server/tributes/service");
const { getObject } = await import("@/server/storage");
const { HttpError } = await import("@/server/tributes/http");
const postRoute = await import("@/app/api/tributes/route");
const idRoute = await import("@/app/api/tributes/[id]/route");
const photoRoute = await import("@/app/api/tributes/photo/[id]/route");

let db: Awaited<ReturnType<typeof getDb>>;
beforeAll(async () => { db = await getDb(); });

const base = { partyId: "live" as const, personName: "Abuela Rosa", remembrance: "She sang every morning.", consent: "true" };
async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof HttpError && e.code === code);
}

describe("tribute validation & processing", () => {
  it("creates a published tribute with derivatives only after storage", async () => {
    const r = await svc.createTribute(db, { ...base, photo: await jpeg(1200, 800) });
    const row = (await db.query("SELECT * FROM tribute WHERE id=$1", [r.id]))[0];
    expect(row.status).toBe("published");
    expect(row.edit_token_hash).not.toBe(r.editToken);
    expect(await getObject(row.photo_key)).toBeTruthy();
    expect(await getObject(row.thumb_key)).toBeTruthy();
    expect(r.tribute.width).toBe(1200);
    expect(r.tribute.height).toBe(800);
  });

  it("rejects non-image types", async () => {
    await expectCode(svc.createTribute(db, { ...base, photo: Buffer.from("#!/bin/sh\necho pwned\n".repeat(10)) }), "bad_type");
    await expectCode(svc.createTribute(db, { ...base, photo: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>") }), "bad_type");
  });

  it("rejects oversize uploads", async () => {
    const big = Buffer.concat([await jpeg(100, 100), Buffer.alloc(16 * 1024 * 1024)]);
    await expectCode(svc.createTribute(db, { ...base, photo: big }), "too_large");
  });

  it("rejects corrupt images without inserting a row", async () => {
    const good = await jpeg(400, 300);
    const corrupt = Buffer.concat([good.subarray(0, 40), Buffer.alloc(500, 7)]);
    const before = (await db.query("SELECT count(*)::int n FROM tribute"))[0].n;
    await expectCode(svc.createTribute(db, { ...base, photo: corrupt }), "undecodable");
    expect((await db.query("SELECT count(*)::int n FROM tribute"))[0].n).toBe(before);
  });

  it("requires consent and a name; limits remembrance to 300 chars", async () => {
    const photo = await jpeg(300, 300);
    await expectCode(svc.createTribute(db, { ...base, consent: undefined, photo }), "consent_required");
    await expectCode(svc.createTribute(db, { ...base, personName: "   ", photo }), "invalid");
    await expectCode(svc.createTribute(db, { ...base, remembrance: "x".repeat(301), photo }), "invalid");
    const ok = await svc.createTribute(db, { ...base, remembrance: "x".repeat(300), photo });
    expect(ok.tribute.remembrance.length).toBe(300);
  });

  it("applies EXIF orientation (rotated portrait)", async () => {
    const photo = await jpeg(400, 200, { orientation: 6 }); // stored landscape, displays portrait
    const r = await svc.createTribute(db, { ...base, photo });
    expect(r.tribute.width).toBe(200);
    expect(r.tribute.height).toBe(400);
  });

  it("keeps landscape and portrait dimensions and caps display at 1920", async () => {
    const land = await svc.createTribute(db, { ...base, photo: await jpeg(4000, 2000) });
    expect([land.tribute.width, land.tribute.height]).toEqual([1920, 960]);
    const port = await svc.createTribute(db, { ...base, photo: await jpeg(900, 1600) });
    expect([port.tribute.width, port.tribute.height]).toEqual([900, 1600]);
    expect(port.tribute.fit).toBe("contain");
  });

  it("strips GPS/EXIF metadata from derivatives", async () => {
    const photo = await jpeg(800, 600, { gps: true });
    expect((await sharp(photo).metadata()).exif).toBeTruthy();
    const r = await svc.createTribute(db, { ...base, photo });
    const row = (await db.query("SELECT * FROM tribute WHERE id=$1", [r.id]))[0];
    for (const key of [row.photo_key, row.thumb_key, row.original_key]) {
      const m = await sharp((await getObject(key))!).metadata();
      expect(m.exif).toBeUndefined();
      expect(m.orientation).toBeUndefined();
    }
  });

  it("escapes nothing but strips control characters from text", async () => {
    const r = await svc.createTribute(db, { ...base, personName: "<b>Tío\u0000 Juan</b>", photo: await jpeg(300, 300) });
    expect(r.tribute.personName).toBe("<b>Tío Juan</b>"); // stored as plain text; React escapes on render
  });
});

describe("tribute HTTP routes & edit token scoping", () => {
  async function upload(extra: Record<string, string> = {}) {
    const fd = new FormData();
    fd.set("token", "test-invite-token");
    fd.set("photo", new Blob([new Uint8Array(await jpeg(640, 480))], { type: "image/jpeg" }), "p.jpg");
    fd.set("personName", "Don Pedro");
    fd.set("consent", "true");
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return postRoute.POST(new Request("http://x/api/tributes", { method: "POST", body: fd }));
  }
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const auth = (t: string) => ({ authorization: `Bearer ${t}` });

  it("rejects a wrong invite token", async () => {
    const r = await upload({ token: "nope" });
    expect(r.status).toBe(404);
  });

  it("only the matching edit token can read/edit/delete", async () => {
    const a = await (await upload()).json();
    const b = await (await upload()).json();
    expect(a.id && a.editToken).toBeTruthy();
    const url = `http://x/api/tributes/${a.id}`;
    expect((await idRoute.GET(new Request(url), ctx(a.id))).status).toBe(404);
    expect((await idRoute.GET(new Request(url, { headers: auth(b.editToken) }), ctx(a.id))).status).toBe(404);
    expect((await idRoute.GET(new Request(url, { headers: auth(a.editToken) }), ctx(a.id))).status).toBe(200);
    const bad = await idRoute.PATCH(new Request(url, { method: "PATCH", headers: auth(b.editToken), body: JSON.stringify({ personName: "Hacked" }) }), ctx(a.id));
    expect(bad.status).toBe(404);
    const ok = await idRoute.PATCH(new Request(url, { method: "PATCH", headers: auth(a.editToken), body: JSON.stringify({ personName: "Don Pedro R.", rotation: 90, fit: "cover", focalX: 0.3 }) }), ctx(a.id));
    const j = await ok.json();
    expect(j.tribute.personName).toBe("Don Pedro R.");
    expect([j.tribute.width, j.tribute.height]).toEqual([480, 640]);
    expect(j.tribute.focalX).toBeCloseTo(0.3);
    const row = (await db.query("SELECT * FROM tribute WHERE id=$1", [a.id]))[0];
    expect((await idRoute.DELETE(new Request(url, { method: "DELETE", headers: auth(b.editToken) }), ctx(a.id))).status).toBe(404);
    expect((await idRoute.DELETE(new Request(url, { method: "DELETE", headers: auth(a.editToken) }), ctx(a.id))).status).toBe(200);
    expect((await db.query("SELECT status FROM tribute WHERE id=$1", [a.id]))[0].status).toBe("deleted");
    expect(await getObject(row.photo_key)).toBeNull();
    expect(await getObject(row.original_key)).toBeNull();
    expect((await idRoute.GET(new Request(url, { headers: auth(a.editToken) }), ctx(a.id))).status).toBe(404);
  });

  it("photo route serves published derivatives with safe headers, hides others", async () => {
    const a = await (await upload()).json();
    const res = await photoRoute.GET(new Request(`http://x/api/tributes/photo/${a.id}?size=thumb`), ctx(a.id));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toContain("private");
    await db.query("UPDATE tribute SET status='hidden' WHERE id=$1", [a.id]);
    expect((await photoRoute.GET(new Request(`http://x/api/tributes/photo/${a.id}`), ctx(a.id))).status).toBe(404);
    expect((await photoRoute.GET(new Request(`http://x/api/tributes/photo/${a.id}`, { headers: auth(a.editToken) }), ctx(a.id))).status).toBe(200);
    expect((await photoRoute.GET(new Request(`http://x/api/tributes/photo/not-a-uuid`), ctx("not-a-uuid"))).status).toBe(404);
  });
});
