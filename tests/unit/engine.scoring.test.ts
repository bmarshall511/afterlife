import { describe, expect, it } from "vitest";
import { scoreCalavera, scoreCase, scoreClosest, scoreLine, scoreRoom, roomActual, roomVoid, closestBase } from "@/server/engine/scoring";
import { isFiltered } from "@/server/engine/wordfilter";
import { validateValue } from "@/server/engine/validate";
import { familyOrder } from "@/server/engine/select";
import { settingsOf } from "@/server/engine/settings";
import type { VoteEntry } from "@/server/engine/types";

describe("line (Kendall)", () => {
  const truth = ["a", "b", "c", "d"];
  it("exact 100, reversed 0, one adjacent swap 5/6", () => {
    expect(scoreLine(["a", "b", "c", "d"], truth)).toBe(100);
    expect(scoreLine(["d", "c", "b", "a"], truth)).toBe(0);
    expect(scoreLine(["b", "a", "c", "d"], truth)).toBe(83);
    expect(scoreLine(["a", "b", "c", "e", "d"].slice(0, 5), ["a", "b", "c", "d", "e"])).toBe(90); // 9/10
  });
});

describe("closest", () => {
  it("brackets, over, exact", () => {
    expect(closestBase(101, 100)).toBe(0);
    expect(closestBase(100, 100)).toBe(100);
    expect(closestBase(95, 100)).toBe(100);
    expect(closestBase(94, 100)).toBe(75);
    expect(closestBase(85, 100)).toBe(75);
    expect(closestBase(70, 100)).toBe(50);
    expect(closestBase(50, 100)).toBe(25);
    expect(closestBase(49, 100)).toBe(10);
    expect(closestBase(0, 100)).toBe(10);
  });
  it("+25 to closest not-over (ties share) only with ≥2 answering; capped at 100", () => {
    const r = scoreClosest([{ teamId: "a", guess: 80 }, { teamId: "b", guess: 80 }, { teamId: "c", guess: 120 }, { teamId: "d", guess: 60 }], 100);
    expect(r.get("a")).toEqual({ points: 75, over: false, closest: true });
    expect(r.get("b")!.points).toBe(75);
    expect(r.get("c")).toEqual({ points: 0, over: true, closest: false });
    expect(r.get("d")!.points).toBe(25);
    expect(scoreClosest([{ teamId: "a", guess: 97 }, { teamId: "b", guess: 10 }], 100).get("a")!.points).toBe(100);
    expect(scoreClosest([{ teamId: "a", guess: 80 }], 100).get("a")!.points).toBe(50);
    // everyone over: no bonus
    expect(scoreClosest([{ teamId: "a", guess: 101 }, { teamId: "b", guess: 102 }], 100).get("a")!.points).toBe(0);
  });
});

describe("room", () => {
  it("actual share, score, void <3", () => {
    expect(roomActual([2, 1, 1, 0], 0)).toBe(50);
    expect(roomActual([1, 1, 1, 0], 0)).toBe(33);
    expect(scoreRoom(50, 50)).toBe(100);
    expect(scoreRoom(40, 50)).toBe(70);
    expect(scoreRoom(0, 50)).toBe(0);
    expect(roomVoid([1, 1, 0, 0])).toBe(true);
    expect(roomVoid([1, 1, 1, 0])).toBe(false);
  });
});

describe("case", () => {
  const sol = { p1: "s1", p2: "s2", p3: "s3", p4: "s4" };
  it("lock round & partial pairs", () => {
    expect(scoreCase(sol, sol, 0)).toBe(300);
    expect(scoreCase(sol, sol, 1)).toBe(225);
    expect(scoreCase(sol, sol, 2)).toBe(150);
    const two = { p1: "s2", p2: "s1", p3: "s3", p4: "s4" };
    expect(scoreCase(two, sol, 0)).toBe(150);
    expect(scoreCase(two, sol, 1)).toBe(113);
    expect(scoreCase({ p1: "s2", p2: "s3", p3: "s4", p4: "s1" }, sol, 0)).toBe(0);
  });
});

describe("calavera", () => {
  const E = (id: string, teamId: string | null, answerId: string | null = id + "-a"): VoteEntry => ({ id, text: id, teamId, answerId, house: !teamId });
  it("votes / voters other than self, +10 for voting, self-vote ignored, hidden discarded, house unscored", () => {
    const entries = [E("ea", "A"), E("eb", "B"), E("ec", "C"), E("h", null, null)];
    const votes = [
      { teamId: "A", entryId: "eb" },
      { teamId: "B", entryId: "ea" },
      { teamId: "C", entryId: "ea" },
      { teamId: "D", entryId: "ec" }, // non-writer votes
      { teamId: "E", entryId: "ea" }, // self-vote shape (E wrote nothing) – fine
    ];
    const r = scoreCalavera(entries, votes, new Set());
    // voters = A,B,C,D,E. A: 3 votes / 4 others = 75 + 10 = 85; B: 1/4 = 25 + 10; C: 1/4 = 25 + 10
    expect(r.points.get("A")).toBe(85);
    expect(r.points.get("B")).toBe(35);
    expect(r.points.get("C")).toBe(35);
    expect(r.points.has("D")).toBe(false);
    // cap 100
    const r2 = scoreCalavera([E("ea", "A"), E("eb", "B")], [{ teamId: "A", entryId: "eb" }, { teamId: "B", entryId: "ea" }], new Set());
    expect(r2.points.get("A")).toBe(100);
    // self-votes never count
    const r3 = scoreCalavera([E("ea", "A"), E("eb", "B")], [{ teamId: "A", entryId: "ea" }, { teamId: "B", entryId: "ea" }], new Set());
    expect(r3.points.get("A")).toBe(100); // 1 vote / 1 other voter (B); A did not validly vote
    expect(r3.points.get("B")).toBe(10);
    // hidden entry: its votes are discarded (voter counts as not voting) and its author scores 0
    const r4 = scoreCalavera([E("ea", "A"), E("eb", "B"), E("ec", "C")], [{ teamId: "A", entryId: "eb" }, { teamId: "C", entryId: "eb" }, { teamId: "B", entryId: "ec" }], new Set(["ec-a"]));
    expect(r4.points.has("C")).toBe(false);
    expect(r4.points.get("B")).toBe(100); // 2 votes / 2 other voters; B's own vote discarded → no +10
    expect(r4.points.get("A")).toBe(10);
    // votes for house are valid votes (+10) but score nobody
    const r5 = scoreCalavera(entries, [{ teamId: "A", entryId: "h" }, { teamId: "B", entryId: "h" }], new Set());
    expect(r5.points.get("A")).toBe(10);
    expect(r5.points.get("C")).toBe(0);
  });
});

describe("word filter", () => {
  it("normalizes leetspeak/accents/separators, avoids obvious false positives", () => {
    for (const bad of ["what the fuck", "sh1t happens", "s.h.i.t", "f u c k", "PENDEJO", "pëndéjo", "cabrón", "b!tch", "shiiiit"]) expect(isFiltered(bad), bad).toBe(true);
    for (const ok of ["He took the shortcut home", "therapist says relax", "happens is fine", "Scrapbook cocktail hour", "class assignment", "a classic tamale"]) expect(isFiltered(ok), ok).toBe(false);
  });
});

describe("InputSpec validation", () => {
  it("rejects malformed values per kind", () => {
    const bad = (s: any, v: unknown) => expect(() => validateValue(s, v)).toThrow();
    const choice = { kind: "choice", options: [{ label: "A", text: "a" }, { label: "B", text: "b" }] };
    expect(validateValue(choice as any, 1)).toBe(1);
    bad(choice, 2); bad(choice, "1"); bad(choice, 0.5);
    const order = { kind: "order", items: [{ id: "x", text: "" }, { id: "y", text: "" }], lowLabel: "", highLabel: "" };
    expect(validateValue(order as any, ["y", "x"])).toEqual(["y", "x"]);
    bad(order, ["x", "x"]); bad(order, ["x"]); bad(order, ["x", "z"]);
    const num = { kind: "number", min: 0, max: 100, step: 5 };
    expect(validateValue(num as any, 15)).toBe(15);
    bad(num, 101); bad(num, 7); bad(num, NaN); bad(num, "10");
    bad({ kind: "percent", optionText: "" }, 101);
    bad({ kind: "percent", optionText: "" }, 5.5);
    const text = { kind: "text", maxLength: 10, placeholder: "" };
    expect(validateValue(text as any, "  hi \n there ")).toBe("hi there");
    bad(text, "x".repeat(11)); bad(text, "   "); bad(text, 5);
    bad({ kind: "vote", entries: [{ id: "e1", text: "" }] }, "e2");
    const assign = { kind: "assign", people: [{ id: "p1", name: "" }, { id: "p2", name: "" }], slots: [{ id: "s1", label: "" }, { id: "s2", label: "" }] };
    expect(validateValue(assign as any, { p1: "s2", p2: "s1" })).toEqual({ p1: "s2", p2: "s1" });
    bad(assign, { p1: "s1", p2: "s1" }); bad(assign, { p1: "s1" }); bad(assign, { p1: "s1", p2: "s2", p3: "s1" }); bad(assign, ["s1", "s2"]);
  });
});

describe("scheduling rules", () => {
  const s = settingsOf({});
  it("1–2 teams objective only; ≥3 social allowed but never right after social; never repeat family", () => {
    for (const n of [1, 2]) expect(familyOrder({ lastFamily: "line" }, s, n, "x").sort()).toEqual(["case", "closest", "loteria"]);
    expect(familyOrder({ lastFamily: "line" }, s, 4, "x").sort()).toEqual(["calavera", "case", "closest", "loteria", "room"]);
    expect(familyOrder({ lastFamily: "room" }, s, 4, "x").sort()).toEqual(["case", "closest", "line", "loteria"]);
    expect(familyOrder({ lastFamily: "line", forceObjective: true }, s, 4, "x")).not.toContain("room");
    expect(familyOrder({ lastFamily: null, played: { line: 3, case: 0, loteria: 2, closest: 1 } }, s, 1, "x")).toEqual(["case", "closest", "loteria", "line"]);
  });
});
