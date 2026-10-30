import { beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { jpeg, setupEnv } from "./tribute-helpers";

setupEnv();
const { getDb } = await import("@/server/db");
const svc = await import("@/server/tributes/service");
const { getObject } = await import("@/server/storage");
const photoRoute = await import("@/app/api/admin/tributes/[id]/photo/route");

let db: Awaited<ReturnType<typeof getDb>>;
beforeAll(async () => { db = await getDb(); });

describe("host replaces a tribute photo", () => {
  it("stores the new photo (metadata stripped), resets framing, keeps the text, deletes the old files", async () => {
    const r = await svc.createTribute(db, { partyId: "live", personName: "Tío Beto", remembrance: "Told the best jokes.", consent: "true", photo: await jpeg(800, 1200) });
    const before = (await db.query("SELECT * FROM tribute WHERE id=$1", [r.id]))[0];
    await svc.updateTribute(db, before, { fit: "cover", focalX: 0.2 }, "admin");
    const row = (await db.query("SELECT * FROM tribute WHERE id=$1", [r.id]))[0];
    const t = await svc.replaceTributePhoto(db, row, await jpeg(1600, 900, { gps: true }), "admin");
    const after = (await db.query("SELECT * FROM tribute WHERE id=$1", [r.id]))[0];
    expect(t.width).toBe(1600);
    expect(after.person_name).toBe("Tío Beto");
    expect(after.remembrance).toBe("Told the best jokes.");
    expect(after.fit).toBe("contain");
    expect(after.focal_x).toBe(0.5);
    expect(after.photo_key).not.toBe(row.photo_key);
    expect(await getObject(row.photo_key)).toBeNull();
    expect(await getObject(row.thumb_key)).toBeNull();
    const meta = await sharp((await getObject(after.photo_key))!).metadata();
    expect(meta.exif).toBeUndefined();
    const audit = await db.query("SELECT 1 FROM audit WHERE action='tribute.photo_replace' AND detail->>'id'=$1", [r.id]);
    expect(audit.length).toBe(1);
  });

  it("the admin photo route refuses requests without an admin session", async () => {
    const fd = new FormData();
    fd.set("photo", new Blob([await jpeg(400, 400)], { type: "image/jpeg" }), "p.jpg");
    const res = await photoRoute.POST(new Request("http://x/api/admin/tributes/abc/photo", { method: "POST", body: fd }), { params: Promise.resolve({ id: "abc" }) } as any);
    expect(res.status).toBe(401);
  });
});
