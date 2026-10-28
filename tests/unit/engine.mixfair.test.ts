import { describe, expect, it } from "vitest";
import { questionFamilyOrder } from "@/server/engine/select";
import type { GameFamily } from "@/shared/types";

// Replays the engine's per-question choice (always the first family in order) to check fairness.
function play(fams: GameFamily[], socialOk: boolean, n: number) {
  const played: Partial<Record<GameFamily, number>> = {};
  let prev: GameFamily | null = null;
  const seq: GameFamily[] = [];
  for (let i = 0; i < n; i++) {
    const f = questionFamilyOrder(fams, prev, socialOk, played, `seed:${Math.floor(i / 3)}:q${i % 3}`)[0];
    seq.push(f); played[f] = (played[f] ?? 0) + 1; prev = f;
  }
  return { seq, played };
}

describe("mixed rounds share turns fairly", () => {
  it("with 1–2 families every objective game keeps coming up (no long droughts)", () => {
    const { seq, played } = play(["calavera", "line", "loteria", "room", "closest"], false, 30);
    expect(Object.keys(played).sort()).toEqual(["closest", "line", "loteria"]);
    for (const f of ["closest", "line", "loteria"] as const) expect(played[f]).toBeGreaterThanOrEqual(9);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
  });
  it("with 3+ families all five games appear within the first two rounds and stay balanced", () => {
    const { seq, played } = play(["calavera", "line", "loteria", "room", "closest"], true, 30);
    expect(new Set(seq.slice(0, 6)).size).toBeGreaterThanOrEqual(5);
    const counts = Object.values(played) as number[];
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
});
