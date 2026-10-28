/** Structural + secrecy validation for v2 content. Returns a list of human-readable errors (empty = OK). */
import type { Stage } from "@/shared/types";
import { isFiltered } from "@/server/engine/wordfilter";
import { solveCount, type CasePuzzle } from "./case";
import type { CalaveraData, CaseData, ClosestData, ContentItem, LineData, LoteriaData, RoomData } from "./types";

export const MINIMUMS = { calavera: 70, line: 70, loteria: 80, room: 70, closest: 70, case: 120 } as const;
const FACTUAL = new Set(["line", "closest"]);
const STAGES: Record<string, Stage[]> = { calavera: ["write", "vote"], line: ["answer"], loteria: ["answer"], room: ["answer", "guess"], closest: ["answer"], case: ["clue", "answer"] };

/** Strings that must never appear in a publicQuestion payload for this item. */
export function secretsOf(it: ContentItem): string[] {
  const dt = it.data;
  switch (it.family) {
    case "calavera": return (dt as unknown as CalaveraData).house;
    case "line": return [...(dt as unknown as LineData).items.map((x) => x.display), it.explanation, it.source!.verification];
    case "closest": return [it.explanation, it.source!.verification];
    case "loteria": { const L = dt as unknown as LoteriaData; return [L.card.es, L.why]; }
    case "case": { const s = it.answer as Record<string, string>; return Object.entries(s).map(([p, v]) => `"${p}":"${v}"`); }
    default: return [];
  }
}

export function validateItem(it: ContentItem, publicQuestion?: (i: ContentItem, c: { stage: Stage; round: number; index: number }) => unknown): string[] {
  const e: string[] = [];
  const err = (m: string) => e.push(`${it.id}: ${m}`);
  if (!it.prompt?.trim()) err("empty prompt");
  if (![1, 2, 3].includes(it.difficulty)) err("bad difficulty");
  if (!(it.readingSeconds > 0)) err("readingSeconds");
  const texts = [it.prompt, it.detail ?? "", it.explanation];
  if (FACTUAL.has(it.family) && !(it.source?.url?.startsWith("https://") && it.source.verification?.length > 20)) err("factual item needs source + verification");
  switch (it.family) {
    case "calavera": {
      const h = (it.data as unknown as CalaveraData).house;
      if (h.length !== 4 || new Set(h).size !== 4) err("needs 4 distinct house punchlines");
      texts.push(...h); break;
    }
    case "line": {
      const L = it.data as unknown as LineData;
      const n = L.items.length;
      if (!(n === 4 || n === 5)) err("line needs 4-5 items");
      if (n === 5 && it.difficulty !== 3) err("5-item lines are difficulty 3");
      if (new Set(L.items.map((x) => x.value)).size !== n) err("line values must be distinct");
      for (let i = 1; i < n; i++) if (!(L.items[i].value > L.items[i - 1].value)) err("line values not strictly ascending");
      if (new Set(L.items.map((x) => x.text)).size !== n) err("duplicate item text");
      if (new Set(L.items.map((x) => x.id)).size !== n || L.items.some((x) => /\d/.test(x.id))) err("bad opaque ids");
      if (JSON.stringify(it.answer) !== JSON.stringify(L.items.map((x) => x.id))) err("answer mismatch");
      if (L.presented.join() === (it.answer as string[]).join()) err("presented order equals answer");
      texts.push(...L.items.map((x) => x.text)); break;
    }
    case "closest": {
      const C = it.data as unknown as ClosestData;
      if (!(C.value >= C.min && C.value <= C.max)) err("value out of range");
      if (!Number.isInteger((C.value - C.min) / C.step)) err("value not step-aligned");
      if (C.value === C.max) err("value equals max (gives it away)");
      if (it.answer !== C.value) err("answer mismatch"); break;
    }
    case "loteria": {
      const L = it.data as unknown as LoteriaData;
      const want = it.difficulty === 1 ? 9 : 12;
      if (L.options.length !== want) err(`grid needs ${want} cards`);
      if (new Set(L.options.map((o) => o.card)).size !== L.options.length) err("duplicate cards");
      const a = it.answer as number;
      if (!(Number.isInteger(a) && a >= 0 && a < L.options.length) || L.options[a].card !== L.card.id) err("answer not in grid");
      if (it.prompt.toLowerCase().includes(L.card.en.replace(/^The /, "").toLowerCase())) err("riddle names its own card");
      break;
    }
    case "room": {
      const R = it.data as unknown as RoomData;
      if (R.options.length !== 4 || new Set(R.options).size !== 4) err("needs 4 distinct options");
      texts.push(...R.options); break;
    }
    case "case": {
      const C = it.data as unknown as CaseData;
      const sol = it.answer as Record<string, string>;
      if (C.people.length !== 4 || C.slots.length !== 4) err("case needs 4 people + 4 slots");
      if (new Set(Object.values(sol)).size !== 4 || C.people.some((p) => !C.slots.some((s) => s.id === sol[p.id]))) err("solution not a bijection");
      const p = { rounds: C.rounds } as CasePuzzle;
      const c = [0, 1, 2].map((k) => solveCount(p, k as 0 | 1 | 2, C.seed));
      if (!(c[0] > 1 && c[2] === 1)) err(`case solution counts ${c.join("/")}`);
      texts.push(...C.rounds.flat(), ...C.people.map((x) => x.bio)); break;
    }
  }
  for (const t of texts) if (t && isFiltered(t)) err(`word filter trips on: ${t.slice(0, 40)}`);
  if (publicQuestion) {
    for (const stage of STAGES[it.family]) {
      const json = JSON.stringify(publicQuestion(it, { stage, round: 0, index: 0 })).replace(/":-?\d+(\.\d+)?/g, "\":#");
      for (const s of secretsOf(it)) if (s && json.includes(s)) err(`publicQuestion(${stage}) leaks secret "${s.slice(0, 30)}"`);
      if (it.family === "closest" && new RegExp(`(^|[^0-9])${(it.answer as number)}([^0-9]|$)`).test(it.prompt + (it.detail ?? ""))) err("prompt contains the answer");
      if (it.family === "case" && stage === "clue" && json.includes('"input":{')) err("clue stage must have null input");
    }
  }
  return e;
}

export function validateAll(items: ContentItem[], publicQuestion?: Parameters<typeof validateItem>[1]): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  for (const it of items) { if (ids.has(it.id)) errs.push(`duplicate id ${it.id}`); ids.add(it.id); errs.push(...validateItem(it, publicQuestion)); }
  if (new Set(items.map((i) => i.family)).size > 1) {
    for (const [f, n] of Object.entries(MINIMUMS)) {
      const have = items.filter((i) => i.family === f).length;
      if (have < n) errs.push(`${f}: ${have} items < minimum ${n}`);
    }
    const lot = items.filter((i) => i.family === "loteria").map((i) => (i.data as unknown as LoteriaData).card.id);
    const cards = new Map<string, number>(); for (const c of lot) cards.set(c, (cards.get(c) ?? 0) + 1);
    if ([...cards.values()].filter((n) => n >= 2).length < 12) errs.push("loteria: need >=12 cards used >=2 times");
    const pz = new Set(items.filter((i) => i.family === "case").map((i) => (i.data as unknown as CaseData).puzzleId));
    if (pz.size < 40) errs.push(`case: ${pz.size} puzzles < 40`);
  }
  return errs;
}
