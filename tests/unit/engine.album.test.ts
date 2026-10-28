import { describe, expect, it, beforeEach } from "vitest";
import { P, T0, phase, setup } from "./engine-helpers";
import { tick } from "@/server/engine";
import { setTributeOnly } from "./engine-album-helpers";

const tribute = (id: string) => ({ id, personName: id, remembrance: "", attribution: "", photoUrl: "/x", width: 1, height: 1, fit: "contain" as const, focalX: 0.5, focalY: 0.5, dwellMs: 25000 });
const slide = (id: string) => ({ id, url: "/a", width: 1, height: 1, caption: "", takenBy: "", dwellMs: 7000 });

describe("break media rotation", () => {
  let n = 0;
  let d: any;
  beforeEach(async () => {
    n = 0;
    d = await setup({
      tributes: { nextTribute: async () => tribute("t" + n++), isTributeVisible: async () => true },
      album: { nextAlbumSlide: async () => slide("s" + n++), isAlbumPhotoVisible: async () => true },
    });
  });

  it("shows tributes first, then party photos, never both, and never cuts a tribute short", async () => {
    await setTributeOnly(T0); // interval starts at T0
    await tick(P, T0 + 1000);
    let ph = await phase(d); expect(ph.tribute).toBeTruthy(); expect(ph.slide ?? null).toBeNull();
    const firstUntil = ph.tributeUntil!;
    await tick(P, T0 + 20_000);
    expect((await phase(d)).tributeUntil).toBe(firstUntil); // not interrupted
    // past the tribute share (70 s) the next turn is a photo
    await tick(P, firstUntil + 1); await tick(P, T0 + 72_000);
    for (let t = T0 + 72_000; t < T0 + 110_000; t += 1000) await tick(P, t);
    ph = await phase(d);
    expect(ph.tribute ?? null).toBeNull();
    expect(ph.slide).toBeTruthy();
  });
});
