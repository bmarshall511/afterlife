import { describe, expect, it } from "vitest";
import { allContent, generateFresh, publicQuestion, revealInfo, toPublicRecord, validateAll, validateItem, type ContentItem } from "@/content";
import { genDifference, genMemory, genReveal } from "@/content/generators";
import { OBJECTS, isKind, matchKind } from "@/games/scenes/library";
import type { GameFamily, Stage } from "@/shared/types";

const items = allContent();
const stagesFor = (f: GameFamily): Stage[] => (f === "memory" ? ["expose", "answer"] : f === "family" ? ["prefer", "predict"] : ["answer"]);

describe("content pool", () => {
  it("has >=150 unique validated items across all six families, visual-heavy", () => {
    expect(items.length).toBeGreaterThanOrEqual(150);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    const by = (f: GameFamily) => items.filter((i) => i.family === f).length;
    for (const f of ["memory", "truth", "difference", "reveal", "altar", "family"] as GameFamily[]) expect(by(f)).toBeGreaterThan(10);
    expect(by("memory") + by("difference") + by("reveal") + by("altar")).toBeGreaterThan(by("truth") * 2);
    expect(validateAll(items)).toEqual([]);
  });

  it("mixes difficulty and gives every item readingSeconds", () => {
    expect(new Set(items.map((i) => i.difficulty))).toEqual(new Set([1, 2, 3]));
    for (const i of items) expect(i.readingSeconds).toBeGreaterThan(0);
  });

  it("every factual item has a source with verification note; truth has both answers", () => {
    const truth = items.filter((i) => i.family === "truth");
    for (const t of truth) expect(t.source?.url).toMatch(/^https:\/\//);
    expect(truth.some((t) => t.answer === 0) && truth.some((t) => t.answer === 1)).toBe(true);
    for (const a of items.filter((i) => i.family === "altar" && (i.scene!.data.q as { type: string }).type === "clue")) expect(a.source?.verification).toBeTruthy();
  });
});

describe("determinism & generators", () => {
  it("same seed -> same item; allContent stable", () => {
    expect(genMemory("x1")).toEqual(genMemory("x1"));
    expect(genDifference("x1")).toEqual(genDifference("x1"));
    expect(genReveal("x1")).toEqual(genReveal("x1"));
    for (const f of ["memory", "difference", "reveal", "altar"] as GameFamily[]) expect(generateFresh(f, 42)).toEqual(generateFresh(f, 42));
    expect(JSON.stringify(allContent())).toBe(JSON.stringify(items));
  });
  it("generateFresh returns null for non-generated families", () => {
    expect(generateFresh("truth", 1)).toBeNull();
    expect(generateFresh("family", 1)).toBeNull();
  });
  it("fresh instances are valid and mostly unique", () => {
    for (const f of ["memory", "difference", "reveal", "altar"] as GameFamily[]) {
      const gen = Array.from({ length: 60 }, (_, i) => generateFresh(f, i)!);
      expect(validateAll(gen)).toEqual([]);
      const sigs = new Set(gen.map((g) => JSON.stringify([g.prompt, g.options, g.scene?.data, g.scene?.variant])));
      expect(sigs.size).toBeGreaterThan(50);
    }
  });
});

describe("no answer leakage", () => {
  it("publicQuestion never carries answer/explanation/source/hidden rule", () => {
    for (const it of items) for (const stage of stagesFor(it.family)) for (const audience of ["tv", "phone"] as const)
      for (const elapsedMs of [0, 13000, 30000]) {
        const pq = publicQuestion(it, { stage, elapsedMs, audience });
        const json = JSON.stringify(pq);
        expect(json).not.toMatch(/"(answer|correct|explanation|source|verification|q|changed|subject|highlight)"/);
        expect(json).not.toContain(it.explanation);
        if (it.family === "memory" && (audience === "phone" || stage === "answer")) expect(pq.scene).toBeNull();
        if (it.family === "truth" || it.family === "family") expect(pq.scene).toBeNull();
        if (it.family === "reveal") {
          expect(pq.scene!.template).toBe("reveal-stage");
          expect(json).not.toContain("reveal-object");
          expect(matchKind(pq.scene!.data.shapes)).toBeNull(); // never the full verified art before reveal
          for (const k of Object.keys(OBJECTS)) expect(json).not.toContain(`"${k}"`); // no kind ids in reveal payloads
        }
      }
  });
  it("memory scene only for TV during expose", () => {
    const m = items.find((i) => i.family === "memory")!;
    expect(publicQuestion(m, { stage: "expose", elapsedMs: 0, audience: "tv" }).scene).toBeTruthy();
    expect(publicQuestion(m, { stage: "expose", elapsedMs: 0, audience: "phone" }).scene).toBeNull();
  });
  it("reveal payload grows over three stages", () => {
    const r = items.find((i) => i.family === "reveal")!;
    const st = [0, 13000, 25000].map((e) => publicQuestion(r, { stage: "answer", elapsedMs: e, audience: "tv" }).scene!.data.stage);
    expect(st).toEqual([0, 1, 2]);
  });
  it("public record is JSON-safe, answer-free and re-renders identically", () => {
    for (const it of items) {
      const rec = JSON.parse(JSON.stringify(toPublicRecord(it)));
      expect(rec).not.toHaveProperty("answer");
      expect(rec).not.toHaveProperty("explanation");
      expect(publicQuestion(rec, { stage: stagesFor(it.family)[0], elapsedMs: 0, audience: "tv" })).toEqual(publicQuestion(it, { stage: stagesFor(it.family)[0], elapsedMs: 0, audience: "tv" }));
    }
  });
});

describe("reveal info", () => {
  it("gives correct index and highlight", () => {
    const d = items.find((i) => i.family === "difference")!;
    expect(revealInfo(d).correct).toBe(d.answer);
    expect(revealInfo(d).highlight?.regionIndex).toBe(d.answer);
    const f = items.find((i) => i.family === "family")!;
    expect(revealInfo(f).correct).toBeNull();
    const r = items.find((i) => i.family === "reveal")!;
    const full = (revealInfo(r).highlight!.scene as { data: { shapes: unknown[]; stage: number } }).data;
    expect(full.stage).toBe(3);
    expect(full.shapes.length).toBe((r.scene!.data.shapes as unknown[]).length);
  });
});

describe("validation rejects malformed content", () => {
  const base = () => structuredClone(items.find((i) => i.family === "memory" && (i.scene!.data.q as { type: string }).type === "count")!) as ContentItem;
  it("duplicate ids / options, bad answers, bad scenes, ambiguity, missing sources", () => {
    const a = base();
    expect(validateAll([a, structuredClone(a)]).some((e) => e.includes("duplicate id"))).toBe(true);
    const dup = base(); dup.options[1] = { ...dup.options[0], label: "B" }; expect(validateItem(dup).length).toBeGreaterThan(0);
    const oob = base(); oob.answer = 7; expect(validateItem(oob)).toContainEqual(expect.stringContaining("answer"));
    const miss = base(); miss.answer = null; expect(validateItem(miss).length).toBeGreaterThan(0);
    const tpl = base(); tpl.scene!.template = "nope"; expect(validateItem(tpl)).toContainEqual(expect.stringContaining("template"));
    const amb = base(); const n = amb.options[amb.answer!].text; amb.options[(amb.answer! + 1) % 4].text = n + " "; expect(validateItem(amb).length).toBeGreaterThan(0);
    const diff = structuredClone(items.find((i) => i.family === "difference")!);
    diff.scene!.variant = { regions: diff.scene!.data.regions }; expect(validateItem(diff)).toContainEqual(expect.stringContaining("exactly 1"));
    const two = structuredClone(items.find((i) => i.family === "difference")!);
    const regs = (two.scene!.variant!.regions as string[][]); const k = (two.answer! + 1) % 4; regs[k] = [regs[k][0] === "candle" ? "guitar" : "candle"];
    expect(validateItem(two)).toContainEqual(expect.stringContaining("exactly 1"));
    const t = structuredClone(items.find((i) => i.family === "truth")!); delete t.source; expect(validateItem(t)).toContainEqual(expect.stringContaining("source"));
    const rv = structuredClone(items.find((i) => i.family === "reveal")!); rv.answer = (rv.answer! + 1) % 4; expect(validateItem(rv)).toContainEqual(expect.stringContaining("match"));
  });
  it("option icons reference library objects", () => {
    for (const i of items) for (const o of i.options) if (o.icon) expect(isKind(o.icon)).toBe(true);
  });
});
