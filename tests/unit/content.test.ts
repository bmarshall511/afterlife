import { describe, expect, it } from "vitest";
import { allContent, caseSet, generateFresh, publicQuestion, revealInfo, validateAll, type ContentItem } from "@/content";
import { ALL_PERMS } from "@/content/case";
import { secretsOf } from "@/content/validate";
import { ICON_IDS } from "@/games/scenes/icons";
import type { GameFamily, Stage } from "@/shared/types";

const items = allContent();
const fam = (f: GameFamily) => items.filter((i) => i.family === f);
const STAGES: Record<GameFamily, Stage[]> = { calavera: ["write", "vote"], line: ["answer"], loteria: ["answer"], room: ["answer", "guess"], closest: ["answer"], case: ["clue", "answer"], dichos: ["answer"], price: ["answer"], fib: ["write", "vote"] };

describe("v2 content pool", () => {
  it("meets GAMES-V2 minimums and validates", () => {
    expect(fam("calavera").length).toBeGreaterThanOrEqual(70);
    expect(fam("line").length).toBeGreaterThanOrEqual(70);
    expect(fam("loteria").length).toBeGreaterThanOrEqual(80);
    expect(fam("room").length).toBeGreaterThanOrEqual(70);
    expect(fam("closest").length).toBeGreaterThanOrEqual(70);
    expect(new Set(fam("case").map((i) => (i.data as { puzzleId: string }).puzzleId)).size).toBeGreaterThanOrEqual(40);
    expect(fam("dichos").length).toBeGreaterThanOrEqual(40);
    expect(fam("price").length).toBeGreaterThanOrEqual(35);
    expect(fam("fib").length).toBeGreaterThanOrEqual(20);
    for (const i of items) expect(["classic", "spicy", "after-dark"]).toContain(i.rating);
    expect(items.filter((i) => i.rating === "spicy").length).toBeGreaterThanOrEqual(40);
    const ad = (f: GameFamily) => fam(f).filter((i) => i.rating === "after-dark").length;
    expect([ad("room"), ad("loteria"), ad("fib")]).toEqual([20, 10, 10]);
    expect(items.filter((i) => i.rating === "after-dark").every((i) => ["room", "loteria", "fib"].includes(i.family))).toBe(true);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(validateAll(items, publicQuestion)).toEqual([]);
  });

  it("factual families carry a source with verification", () => {
    for (const i of [...fam("line"), ...fam("closest"), ...fam("dichos"), ...fam("price")]) {
      expect(i.source?.url).toMatch(/^https:\/\//);
      expect(i.source?.verification.length).toBeGreaterThan(20);
    }
  });

  it("lotería uses >=12 cards at least twice, all with icons", () => {
    const counts = new Map<string, number>();
    for (const i of fam("loteria")) { const c = (i.data as { card: { id: string } }).card.id; counts.set(c, (counts.get(c) ?? 0) + 1); }
    expect([...counts.values()].filter((n) => n >= 2).length).toBeGreaterThanOrEqual(24);
    const byD = [1, 2, 3].map((d) => fam("loteria").filter((i) => i.difficulty === d).length);
    expect(Math.min(...byD)).toBeGreaterThanOrEqual(24);
    for (const i of fam("loteria")) for (const o of (publicQuestion(i, { stage: "answer", index: 0 }).input as { options: { icon: string }[] }).options) expect(ICON_IDS).toContain(o.icon);
  });
});

describe("publicQuestion", () => {
  it("never leaks secrets for any item × stage × round", () => {
    for (const it of items) for (const stage of STAGES[it.family]) for (const round of [0, 1, 2]) {
      const q = publicQuestion(it, { stage, round, index: 1 });
      const json = JSON.stringify(q).replace(/":-?\d+(\.\d+)?/g, '":#');
      for (const s of secretsOf(it)) expect(json.includes(s), `${it.id} ${stage} leaks ${s}`).toBe(false);
      expect(json).not.toMatch(/"answer"|"house"|"solution"|"value"|"why"|"verification"/);
    }
  });

  it("gives the right InputSpec per stage", () => {
    const kind = (it: ContentItem, stage: Stage) => publicQuestion(it, { stage, round: 0, index: 0 }).input?.kind ?? null;
    expect(kind(fam("calavera")[0], "write")).toBe("text");
    expect(kind(fam("calavera")[0], "vote")).toBe("vote");
    expect(kind(fam("line")[0], "answer")).toBe("order");
    expect(kind(fam("loteria")[0], "answer")).toBe("choice");
    expect(kind(fam("room")[0], "answer")).toBe("choice");
    expect(kind(fam("room")[0], "guess")).toBe("percent");
    expect(kind(fam("closest")[0], "answer")).toBe("number");
    expect(kind(fam("dichos")[0], "answer")).toBe("choice");
    expect(kind(fam("price")[0], "answer")).toBe("number");
    expect(kind(fam("fib")[0], "write")).toBe("fib");
    expect(kind(fam("fib")[0], "vote")).toBeNull();
    expect(kind(fam("case")[0], "clue")).toBeNull();
    expect(kind(fam("case")[0], "answer")).toBe("assign");
  });

  it("line items are presented out of true order", () => {
    for (const it of fam("line")) {
      const q = publicQuestion(it, { stage: "answer", index: 0 }).input as { items: { id: string }[] };
      expect(q.items.map((x) => x.id)).not.toEqual(it.answer);
      expect([...q.items.map((x) => x.id)].sort()).toEqual([...(it.answer as string[])].sort());
    }
  });
});

describe("case puzzles", () => {
  it("caseSet is deterministic, 3 rounds, shared puzzle, clues accumulate", () => {
    const a = caseSet("party-7"), b = caseSet("party-7");
    expect(a).toEqual(b);
    expect(new Set(a.map((i) => (i.data as { puzzleId: string }).puzzleId)).size).toBe(1);
    const n = a.map((i) => i.detail!.split("\n").length);
    expect(n[0]).toBeLessThan(n[1]); expect(n[1]).toBeLessThan(n[2]);
    expect(revealInfo(a[0]).correct).toBeNull();
    expect(revealInfo(a[2]).correct).toEqual(a[2].answer);
    expect(ALL_PERMS.length).toBe(24);
  });
  it("generateFresh: case only", () => {
    expect(generateFresh("case", 3)?.family).toBe("case");
    for (const f of ["calavera", "line", "loteria", "room", "closest", "dichos", "price", "fib"] as GameFamily[]) expect(generateFresh(f, 3)).toBeNull();
    expect(validateAll(Array.from({ length: 30 }, (_, i) => caseSet(`t${i}`)).flat(), publicQuestion)).toEqual([]);
  });
});

describe("revealInfo", () => {
  it("returns family-specific detail", () => {
    expect((revealInfo(fam("calavera")[0]).detail as { house: string[] }).house).toHaveLength(4);
    expect(revealInfo(fam("room")[0]).correct).toBeNull();
    const l = revealInfo(fam("line")[0]);
    expect(l.correct).toEqual(fam("line")[0].answer); expect(l.source?.url).toMatch(/^https/);
    expect(revealInfo(fam("closest")[0]).correct).toBe(fam("closest")[0].answer);
    expect((revealInfo(fam("loteria")[0]).detail as { card: { es: string } }).card.es).toBeTruthy();
  });
});
