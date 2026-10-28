import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { jpeg, setupEnv } from "./tribute-helpers";

setupEnv();
const { getDb } = await import("@/server/db");
const svc = await import("@/server/tributes/service");
const { nextTribute, isTributeVisible, dwellFor } = await import("@/server/tributes/queue");

let db: Awaited<ReturnType<typeof getDb>>;
let photo: Buffer;
beforeAll(async () => { db = await getDb(); photo = await jpeg(300, 200); });
beforeEach(async () => { await db.query("DELETE FROM tribute"); });

const add = (name: string, party: "live" | "demo" = "live", remembrance = "") =>
  svc.createTribute(db, { partyId: party, photo, personName: name, remembrance, consent: true });

describe("tribute queue", () => {
  it("returns null when empty", async () => {
    expect(await nextTribute(db, "live", Date.now())).toBeNull();
  });

  it("rotates fairly across 3+ tributes and persists counts", async () => {
    await add("A"); await add("B"); await add("C");
    let now = Date.now();
    const seen: string[] = [];
    for (let i = 0; i < 9; i++) seen.push((await nextTribute(db, "live", (now += 30000)))!.personName);
    expect(seen.slice(0, 3).sort()).toEqual(["A", "B", "C"]);
    for (const n of ["A", "B", "C"]) expect(seen.filter((s) => s === n).length).toBe(3);
    const counts = await db.query("SELECT display_count FROM tribute");
    expect(counts.every((c) => c.display_count === 3)).toBe(true);
  });

  it("includes newly added tributes promptly without starving older ones", async () => {
    await add("Old1"); await add("Old2");
    let now = Date.now();
    for (let i = 0; i < 4; i++) await nextTribute(db, "live", (now += 30000));
    await add("New");
    expect((await nextTribute(db, "live", (now += 30000)))!.personName).toBe("New");
    const next2 = [(await nextTribute(db, "live", (now += 30000)))!.personName, (await nextTribute(db, "live", (now += 30000)))!.personName];
    expect(next2.sort()).toEqual(["Old1", "Old2"]);
  });

  it("feature-next priority wins once, then normal order resumes", async () => {
    await add("A"); const b = await add("B");
    await db.query("UPDATE tribute SET priority=100 WHERE id=$1", [b.id]);
    let now = Date.now();
    expect((await nextTribute(db, "live", (now += 1000)))!.personName).toBe("B");
    expect((await nextTribute(db, "live", (now += 1000)))!.personName).toBe("A");
  });

  it("hidden and deleted tributes leave the rotation and are not visible", async () => {
    const a = await add("A"); const b = await add("B");
    expect(await isTributeVisible(db, "live", a.id)).toBe(true);
    await svc.updateTribute(db, (await svc.getRow(db, a.id))!, { status: "hidden" }, "admin");
    await svc.removeTribute(db, (await svc.getRow(db, b.id))!, "admin");
    expect(await isTributeVisible(db, "live", a.id)).toBe(false);
    expect(await isTributeVisible(db, "live", b.id)).toBe(false);
    expect(await nextTribute(db, "live", Date.now())).toBeNull();
  });

  it("keeps demo and live tributes separate", async () => {
    const d = await add("DemoOnly", "demo");
    expect(await nextTribute(db, "live", Date.now())).toBeNull();
    expect((await nextTribute(db, "demo", Date.now()))!.id).toBe(d.id);
    expect(await isTributeVisible(db, "live", d.id)).toBe(false);
  });

  it("dwell is 45-75s by text length (casual pacing)", async () => {
    expect(dwellFor(0)).toBe(45000);
    expect(dwellFor(100)).toBe(55000);
    expect(dwellFor(300)).toBe(75000);
    await add("Long", "live", "y".repeat(300));
    const t = await nextTribute(db, "live", Date.now());
    expect(t!.dwellMs).toBe(75000);
    expect(t!.photoUrl).toMatch(/^\/api\/tributes\/photo\/[0-9a-f-]+\?size=display&v=\d+$/);
  });
});

describe("tribute queue (unhide)", () => {
  it("an unhidden tribute rejoins at the current round, not replayed repeatedly", async () => {
    const a = await add("A"); await add("B"); await add("C");
    await svc.updateTribute(db, (await svc.getRow(db, a.id))!, { status: "hidden" }, "admin");
    let now = Date.now();
    for (let i = 0; i < 6; i++) await nextTribute(db, "live", (now += 30000));
    await svc.updateTribute(db, (await svc.getRow(db, a.id))!, { status: "published" }, "admin");
    const seq: string[] = [];
    for (let i = 0; i < 3; i++) seq.push((await nextTribute(db, "live", (now += 30000)))!.personName);
    expect(seq[0]).toBe("A");
    expect(seq.slice(1).sort()).toEqual(["B", "C"]);
  });
});
