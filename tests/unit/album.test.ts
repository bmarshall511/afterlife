import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { jpeg, setupEnv } from "./tribute-helpers";

const BLOBS = setupEnv();
process.env.ALBUM_INVITE_TOKEN = "test-album-token";
const TOKEN = "test-album-token";

const { getDb } = await import("@/server/db");
const { putObject, getObject } = await import("@/server/storage");
const svc = await import("@/server/album/service");
const { nextAlbumSlide, isAlbumPhotoVisible } = await import("@/server/album/queue");
const finalizeRoute = await import("@/app/api/album/finalize/route");
const uploadRoute = await import("@/app/api/album/upload/route");
const photosRoute = await import("@/app/api/album/photos/route");
const photoRoute = await import("@/app/api/album/photo/[id]/route");
const loginRoute = await import("@/app/api/admin/login/route");
const adminList = await import("@/app/api/admin/album/route");
const adminOne = await import("@/app/api/admin/album/[id]/route");
const adminDl = await import("@/app/api/admin/album/[id]/download/route");

let db: Awaited<ReturnType<typeof getDb>>;
let adminCookie = "";
beforeAll(async () => {
  db = await getDb();
  const r = await loginRoute.POST(new Request("http://x", { method: "POST", headers: { "x-forwarded-for": "9.9.9.9" }, body: JSON.stringify({ password: "correct horse battery" }) }));
  adminCookie = r.headers.get("set-cookie")!.split(";")[0];
});

const rawName = (party = "live", ext = "jpg") => `album-raw/${party}/${crypto.randomBytes(18).toString("base64url")}.${ext}`;
async function raw(buf: Buffer, party = "live", ext = "jpg") {
  const p = rawName(party, ext);
  await putObject(p, buf, "image/jpeg");
  return p;
}
const post = (body: unknown, headers: Record<string, string> = {}) =>
  finalizeRoute.POST(new Request("http://x/api/album/finalize", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const admin = (url: string, method = "GET", body?: unknown) =>
  new Request(`http://x${url}`, { method, headers: { cookie: adminCookie, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
async function keysOf(id: string) {
  return (await db.query("SELECT * FROM album_photo WHERE id=$1", [id]))[0];
}

describe("album finalize validation", () => {
  it("rejects non-images, corrupt images and oversize files with clear messages", async () => {
    const txt = await raw(Buffer.from("hello, this is definitely not a photo at all"));
    let r = await post({ token: TOKEN, party: "live", pathname: txt });
    expect(r.status).toBe(415);
    expect((await r.json()).code).toBe("bad_type");
    expect(await getObject(txt)).toBeNull(); // raw dropped

    const good = await jpeg(400, 300);
    const corrupt = Buffer.concat([good.subarray(0, 40), Buffer.alloc(200, 7)]);
    r = await post({ token: TOKEN, party: "live", pathname: await raw(corrupt) });
    expect(r.status).toBe(422);
    expect((await r.json()).error).toMatch(/couldn't read/i);

    const big = Buffer.concat([good, Buffer.alloc(26 * 1024 * 1024)]);
    r = await post({ token: TOKEN, party: "live", pathname: await raw(big) });
    expect(r.status).toBe(413);

    r = await post({ token: TOKEN, party: "live", pathname: "album-raw/live/../../etc/passwd" });
    expect(r.status).toBe(400);
    r = await post({ token: TOKEN, party: "live", pathname: rawName("live") });
    expect(r.status).toBe(404);
    expect((await post({ token: TOKEN, party: "live", pathname: await raw(good), caption: "x".repeat(141) })).status).toBe(400);
  });

  it("strips all metadata (GPS) from every output and applies EXIF orientation", async () => {
    const src = await jpeg(300, 200, { gps: true, orientation: 6 });
    expect((await sharp(src).metadata()).exif).toBeTruthy();
    const p = await raw(src);
    const r = await post({ token: TOKEN, party: "live", pathname: p, caption: "  Ofrenda <b>glow</b> ", takenBy: "Las Calacas" });
    expect(r.status).toBe(201);
    const { photo } = await r.json();
    expect(photo.width).toBe(200);
    expect(photo.height).toBe(300);
    expect(photo.caption).toBe("Ofrenda <b>glow</b>"); // stored as plain text; React escapes on render
    const row = await keysOf(photo.id);
    for (const k of [row.full_key, row.display_key, row.thumb_key]) {
      const buf = (await getObject(k))!;
      const m = await sharp(buf).metadata();
      expect(m.exif, k).toBeUndefined();
      expect(m.xmp, k).toBeUndefined();
      expect(m.iptc, k).toBeUndefined();
      expect(m.orientation ?? 1, k).toBe(1);
      expect(buf.includes(Buffer.from("TestCam"))).toBe(false);
      expect(buf.includes(Buffer.from("GPS"))).toBe(false);
    }
    expect((await sharp((await getObject(row.full_key))!).metadata()).width).toBe(200);
    expect(await getObject(p)).toBeNull(); // raw deleted
  });

  it("keeps full resolution, bounds display/thumb", async () => {
    const p = await raw(await jpeg(2600, 1300));
    const { photo } = await (await post({ token: TOKEN, party: "live", pathname: p })).json();
    const row = await keysOf(photo.id);
    expect((await sharp((await getObject(row.full_key))!).metadata()).width).toBe(2600);
    expect((await sharp((await getObject(row.display_key))!).metadata()).width).toBe(1920);
    expect((await sharp((await getObject(row.thumb_key))!).metadata()).width).toBe(480);
  });

  it("finalize is idempotent per pathname, including concurrent calls", async () => {
    const p = await raw(await jpeg(300, 300));
    const [a, b] = await Promise.all([
      svc.finalizePhoto(db, { partyId: "live", pathname: p }),
      svc.finalizePhoto(db, { partyId: "live", pathname: p }).catch((e) => e),
    ]);
    const again = await post({ token: TOKEN, party: "live", pathname: p });
    expect(again.status).toBe(200);
    const ids = new Set([a.photo.id, (await again.json()).photo.id, ...(b?.photo ? [b.photo.id] : [])]);
    expect(ids.size).toBe(1);
    expect((await db.query("SELECT count(*)::int n FROM album_photo WHERE raw_pathname=$1", [p]))[0].n).toBe(1);
    // No orphaned derivative objects from a losing racer: exactly 3 objects per live row.
    const files = (fs.readdirSync(path.join(BLOBS, "album", "live"), { recursive: true }) as string[]).filter((f) => /\.(jpg|webp)$/.test(f));
    const n = (await db.query("SELECT count(*)::int n FROM album_photo WHERE party_id='live'"))[0].n;
    expect(files.length).toBe(n * 3);
  });

  it("defaults takenBy to the guest's team name from the session cookie", async () => {
    const { newSecret, hashSecret } = await import("@/server/session");
    const teamId = crypto.randomUUID();
    const secret = newSecret();
    await db.query("INSERT INTO team (id, party_id, name, color, avatar, invite_code) VALUES ($1,'live','Team Marigold','#f5a524','x','ABCD')", [teamId]);
    await db.query("INSERT INTO member (id, party_id, team_id, display_name, session_hash) VALUES ($1,'live',$2,'Ana',$3)", [crypto.randomUUID(), teamId, hashSecret(secret)]);
    const r = await post({ token: TOKEN, party: "live", pathname: await raw(await jpeg(200, 200)) }, { cookie: `al_s_live=${secret}` });
    const { photo } = await r.json();
    expect(photo.takenBy).toBe("Team Marigold");
    expect((await keysOf(photo.id)).team_id).toBe(teamId);
    const r2 = await post({ token: TOKEN, party: "live", pathname: await raw(await jpeg(200, 200)), takenBy: "Ana" }, { cookie: `al_s_live=${secret}` });
    expect((await r2.json()).photo.takenBy).toBe("Ana");
  });
});

describe("album access", () => {
  it("scopes everything to the album token", async () => {
    const p = await raw(await jpeg(200, 200));
    expect((await post({ token: "wrong", party: "live", pathname: p })).status).toBe(404);
    expect((await post({ party: "live", pathname: p })).status).toBe(404);
    expect((await post({ token: TOKEN, party: "demo", pathname: p })).status).toBe(400); // pathname belongs to live
    expect((await photosRoute.GET(new Request("http://x/api/album/photos?token=nope"))).status).toBe(404);
    const { photo } = await (await post({ token: TOKEN, party: "live", pathname: p })).json();
    expect((await photoRoute.GET(new Request(`http://x${photo.fullUrl}`), ctx(photo.id))).status).toBe(404);
    expect((await photoRoute.GET(new Request(`http://x${photo.fullUrl}&t=bad`), ctx(photo.id))).status).toBe(404);
    const full = await photoRoute.GET(new Request(`http://x${photo.fullUrl}&t=${TOKEN}&dl=1`), ctx(photo.id));
    expect(full.status).toBe(200);
    expect(full.headers.get("content-disposition")).toMatch(/^attachment; filename="afterlife-/);
    const thumb = await photoRoute.GET(new Request(`http://x${photo.thumbUrl}`), ctx(photo.id));
    expect(thumb.headers.get("content-type")).toBe("image/webp");
  });

  it("local multipart upload fallback validates token + pathname", async () => {
    const mk = (token: string, pathname: string, blob: Blob) => {
      const fd = new FormData();
      fd.set("token", token); fd.set("party", "live"); fd.set("pathname", pathname); fd.set("photo", blob, "a.jpg");
      return uploadRoute.POST(new Request("http://x/api/album/upload", { method: "POST", body: fd }));
    };
    const img = new Blob([new Uint8Array(await jpeg(200, 200))], { type: "image/jpeg" });
    expect((await mk("bad", rawName(), img)).status).toBe(404);
    expect((await mk(TOKEN, "album/live/x.jpg", img)).status).toBe(400);
    expect((await mk(TOKEN, rawName(), new Blob(["x"], { type: "video/mp4" }))).status).toBe(415);
    const p = rawName();
    expect((await mk(TOKEN, p, img)).status).toBe(201);
    expect((await post({ token: TOKEN, party: "live", pathname: p })).status).toBe(201);
  });
});

describe("hidden/deleted, queue and isolation", () => {
  it("demo and live albums are isolated", async () => {
    await db.query("DELETE FROM album_photo");
    const d = await svc.finalizePhoto(db, { partyId: "demo", pathname: await raw(await jpeg(200, 200), "demo") });
    const l = await svc.finalizePhoto(db, { partyId: "live", pathname: await raw(await jpeg(200, 200)) });
    const ids = async (party: string) => (await (await photosRoute.GET(new Request(`http://x/api/album/photos?token=${TOKEN}&party=${party}`))).json()).photos.map((p: any) => p.id);
    expect(await ids("demo")).toEqual([d.photo.id]);
    expect(await ids("live")).toEqual([l.photo.id]);
    expect((await nextAlbumSlide(db, "demo", Date.now()))!.id).toBe(d.photo.id);
    expect(await isAlbumPhotoVisible(db, "live", d.photo.id)).toBe(false);
  });

  it("fair rotation: least shown first, newest boosted, hidden excluded promptly", async () => {
    await db.query("DELETE FROM album_photo");
    const mk = async () => (await svc.finalizePhoto(db, { partyId: "live", pathname: await raw(await jpeg(200, 200)), caption: "c" })).photo.id;
    const a = await mk(); const b = await mk(); const c = await mk();
    let t = Date.now();
    const shown: string[] = [];
    for (let i = 0; i < 6; i++) shown.push((await nextAlbumSlide(db, "live", (t += 1000)))!.id);
    expect(shown.slice(0, 3)).toEqual([c, b, a]); // never-shown, newest first
    for (const id of [a, b, c]) expect(shown.filter((x) => x === id).length).toBe(2);
    const s = (await nextAlbumSlide(db, "live", (t += 1000)))!;
    expect(s).toMatchObject({ caption: "c", dwellMs: 7000 });
    expect(s.url).toMatch(/^\/api\/album\/photo\/.+size=display/);
    const fresh = await mk();
    expect((await nextAlbumSlide(db, "live", (t += 1000)))!.id).toBe(fresh); // new photo shown promptly

    // hide via admin => excluded from slides, guest list and derivative route
    const h = await adminOne.PATCH(admin(`/api/admin/album/${a}`, "PATCH", { status: "hidden" }), ctx(a));
    expect((await h.json()).photo.status).toBe("hidden");
    for (let i = 0; i < 8; i++) expect((await nextAlbumSlide(db, "live", (t += 1000)))!.id).not.toBe(a);
    expect(await isAlbumPhotoVisible(db, "live", a)).toBe(false);
    const list = (await (await photosRoute.GET(new Request(`http://x/api/album/photos?token=${TOKEN}`))).json()).photos.map((p: any) => p.id);
    expect(list).not.toContain(a);
    expect((await photoRoute.GET(new Request(`http://x/api/album/photo/${a}?size=display`), ctx(a))).status).toBe(404);
    expect((await photoRoute.GET(admin(`/api/album/photo/${a}?size=display`), ctx(a))).status).toBe(200);
    // unhide rejoins at the current round (not starved, not replayed endlessly)
    await adminOne.PATCH(admin(`/api/admin/album/${a}`, "PATCH", { status: "published" }), ctx(a));
    const after: string[] = [];
    for (let i = 0; i < 8; i++) after.push((await nextAlbumSlide(db, "live", (t += 1000)))!.id);
    expect(after.filter((x) => x === a).length).toBeGreaterThanOrEqual(1);
    expect(after.filter((x) => x === a).length).toBeLessThanOrEqual(3);
  });

  it("admin: list with counts, edit caption, download, delete removes every object", async () => {
    const { photo } = await svc.finalizePhoto(db, { partyId: "live", pathname: await raw(await jpeg(300, 200)), caption: "old" });
    const l = await (await adminList.GET(admin("/api/admin/album?party=live"))).json();
    expect(l.url).toContain(`/album/${TOKEN}`);
    expect(l.counts.published).toBeGreaterThan(0);
    const e = await (await adminOne.PATCH(admin(`/api/admin/album/${photo.id}`, "PATCH", { caption: "  new  caption ", takenBy: "Host" }), ctx(photo.id))).json();
    expect(e.photo).toMatchObject({ caption: "new caption", takenBy: "Host" });
    expect((await adminOne.PATCH(admin(`/api/admin/album/${photo.id}`, "PATCH", { status: "deleted" }), ctx(photo.id))).status).toBe(400);
    expect((await adminDl.GET(admin(`/api/admin/album/${photo.id}/download`), ctx(photo.id))).status).toBe(200);
    const row = await keysOf(photo.id);
    expect((await adminOne.DELETE(admin(`/api/admin/album/${photo.id}`, "DELETE"), ctx(photo.id))).status).toBe(400);
    expect((await adminOne.DELETE(admin(`/api/admin/album/${photo.id}?confirm=1`, "DELETE"), ctx(photo.id))).status).toBe(200);
    for (const k of [row.full_key, row.display_key, row.thumb_key]) expect(await getObject(k)).toBeNull();
    expect((await photoRoute.GET(new Request(`http://x${photo.thumbUrl}`), ctx(photo.id))).status).toBe(404);
    // A stale finalize retry cannot resurrect a deleted photo.
    expect((await post({ token: TOKEN, party: "live", pathname: row.raw_pathname })).status).toBe(410);
  });

  it("admin album routes require a session", async () => {
    const anon = (url: string, method = "GET") => new Request(`http://x${url}`, { method, headers: { cookie: "al_admin=forged" } });
    const id = "00000000-0000-4000-8000-000000000000";
    expect((await adminList.GET(anon("/api/admin/album"))).status).toBe(401);
    expect((await adminOne.PATCH(anon(`/api/admin/album/${id}`, "PATCH"), ctx(id))).status).toBe(401);
    expect((await adminOne.DELETE(anon(`/api/admin/album/${id}?confirm=1`, "DELETE"), ctx(id))).status).toBe(401);
    expect((await adminDl.GET(anon(`/api/admin/album/${id}/download`), ctx(id))).status).toBe(401);
  });
});
