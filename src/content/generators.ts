/**
 * Deterministic seeded generators. The answer is always computed from scene data,
 * and validate.ts recomputes it independently.
 */
import { ALL_KINDS, OBJECTS, shapesFor, intersects, type ObjectKind } from "@/games/scenes/library";
import type { QuestionOption } from "@/shared/types";
import { ALTAR_CLUES, ALTAR_SYMBOL_KINDS, type AltarClue } from "./facts";
import type { ContentItem } from "./types";

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed: string) {
  let a = hashSeed(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  const pick = <T,>(arr: readonly T[]) => arr[int(arr.length)];
  const shuffle = <T,>(arr: readonly T[]) => { const a2 = [...arr]; for (let i = a2.length - 1; i > 0; i--) { const j = int(i + 1); [a2[i], a2[j]] = [a2[j], a2[i]]; } return a2; };
  return { next, int, pick, shuffle };
}
type Rng = ReturnType<typeof rng>;

export const LETTERS = ["A", "B", "C", "D"];
export function readingSecondsFor(prompt: string, options: { text: string }[]): number {
  const words = (prompt + " " + options.map((o) => o.text).join(" ")).split(/\s+/).filter(Boolean).length;
  return Math.max(4, Math.ceil(words / 3) + 2);
}
const kindOpts = (kinds: ObjectKind[]): QuestionOption[] => kinds.map((k, i) => ({ label: LETTERS[i], text: OBJECTS[k].label, icon: k }));
const lc = (k: ObjectKind) => OBJECTS[k].label.toLowerCase().replace("pan de muerto", "pan de muerto");

function finish(base: Omit<ContentItem, "readingSeconds" | "version" | "enabled">): ContentItem {
  return { version: 1, enabled: true, ...base, readingSeconds: readingSecondsFor(base.prompt, base.options) };
}

// ---------------------------------------------------------------- memory
export type MemoryQ =
  | { type: "count"; target: ObjectKind }
  | { type: "beside"; target: ObjectKind; side: "left" | "right" }
  | { type: "corner"; corner: "top-left" | "top-right" | "bottom-left" | "bottom-right" }
  | { type: "absent" };

export function memoryAnswerValue(cells: ObjectKind[], cols: number, rows: number, q: MemoryQ): string | number | null {
  switch (q.type) {
    case "count": return cells.filter((c) => c === q.target).length;
    case "beside": {
      const idx = cells.indexOf(q.target);
      if (idx < 0 || cells.lastIndexOf(q.target) !== idx) return null;
      const col = idx % cols, nc = q.side === "right" ? col + 1 : col - 1;
      if (nc < 0 || nc >= cols) return null;
      return cells[idx - col + nc];
    }
    case "corner": {
      const i = { "top-left": 0, "top-right": cols - 1, "bottom-left": (rows - 1) * cols, "bottom-right": rows * cols - 1 }[q.corner];
      return cells[i];
    }
    case "absent": return null; // checked via options
  }
}

export function genMemory(seed: string): ContentItem {
  const r = rng("memory:" + seed);
  const difficulty = (1 + r.int(3)) as 1 | 2 | 3;
  const cols = difficulty + 2, rows = 2, n = cols * rows;
  const qtype = r.pick(["count", "beside", "corner", "absent"] as const);
  let cells: ObjectKind[]; let q: MemoryQ; let options: QuestionOption[]; let answer: number; let prompt: string; let explanation: string;
  if (qtype === "count") {
    const target = r.pick(ALL_KINDS);
    const k = 1 + r.int(Math.min(n - 2, difficulty + 2));
    const others = r.shuffle(ALL_KINDS.filter((x) => x !== target)).slice(0, 2 + difficulty);
    cells = r.shuffle([...Array(k).fill(target), ...Array.from({ length: n - k }, () => r.pick(others))]);
    const cand = r.shuffle([k - 2, k - 1, k + 1, k + 2, k + 3].filter((x) => x >= 0)).slice(0, 3);
    const nums = [...cand, k].sort((a, b) => a - b);
    options = nums.map((v, i) => ({ label: LETTERS[i], text: String(v) }));
    answer = nums.indexOf(k);
    q = { type: "count", target };
    prompt = `How many ${OBJECTS[target].plural} were there?`;
    explanation = `There ${k === 1 ? "was" : "were"} ${k} ${k === 1 ? lc(target) : OBJECTS[target].plural}.`;
  } else {
    cells = r.shuffle(ALL_KINDS).slice(0, n);
    if (qtype === "absent") {
      const missing = r.pick(ALL_KINDS.filter((k) => !cells.includes(k)));
      const kinds = r.shuffle([missing, ...r.shuffle(cells).slice(0, 3)]);
      options = kindOpts(kinds); answer = kinds.indexOf(missing);
      q = { type: "absent" };
      prompt = "Which object was NOT in the picture?";
      explanation = `The ${lc(missing)} was not shown.`;
    } else {
      let target: ObjectKind; let ans: ObjectKind;
      if (qtype === "beside") {
        const side = r.pick(["left", "right"] as const);
        const valid = cells.map((_, i) => i).filter((i) => (side === "right" ? i % cols < cols - 1 : i % cols > 0));
        const i = r.pick(valid);
        target = cells[i]; ans = cells[side === "right" ? i + 1 : i - 1];
        q = { type: "beside", target, side };
        prompt = `Which object was directly to the ${side.toUpperCase()} of the ${lc(target)}?`;
        explanation = `The ${lc(ans)} sat just ${side} of the ${lc(target)}.`;
      } else {
        const corner = r.pick(["top-left", "top-right", "bottom-left", "bottom-right"] as const);
        q = { type: "corner", corner };
        ans = memoryAnswerValue(cells, cols, rows, q) as ObjectKind; target = ans;
        prompt = `Which object was in the ${corner.replace("-", " ").toUpperCase()} corner?`;
        explanation = `The ${lc(ans)} was in the ${corner.replace("-", " ")} corner.`;
      }
      const distractPool = cells.filter((c) => c !== ans && c !== target);
      const kinds = r.shuffle([ans, ...r.shuffle(distractPool).slice(0, 3)]);
      options = kindOpts(kinds); answer = kinds.indexOf(ans);
    }
  }
  return finish({
    id: `memory-${seed}`, family: "memory", difficulty, prompt, promptEs: "La Memoria", options, answer, explanation,
    scene: { template: "memory-shelf", seed, data: { cols, rows, cells, q } },
  });
}

// ---------------------------------------------------------------- difference
export const REGION_TEXT = ["Top left", "Top right", "Bottom left", "Bottom right"];

export function genDifference(seed: string): ContentItem {
  const r = rng("difference:" + seed);
  const difficulty = (1 + r.int(3)) as 1 | 2 | 3;
  const pool = r.shuffle(ALL_KINDS);
  let p = 0;
  const regions: ObjectKind[][] = [0, 1, 2, 3].map(() => (r.next() < 0.5 ? [pool[p++ % pool.length]] : [pool[p++ % pool.length], pool[p++ % pool.length]]));
  const changed = r.int(4);
  const variant = regions.map((g) => [...g]);
  const g = variant[changed];
  let change: string;
  if (difficulty === 1) {
    if (g.length === 1) { const add = r.pick(ALL_KINDS.filter((k) => !g.includes(k))); g.push(add); change = `a ${lc(add)} appeared`; }
    else { const gone = g.pop()!; change = `the ${lc(gone)} disappeared`; }
  } else if (difficulty === 2 || g.length === 1) {
    const i = r.int(g.length); const old = g[i];
    const nk = r.pick(ALL_KINDS.filter((k) => !g.includes(k) && k !== old)); g[i] = nk;
    change = `the ${lc(old)} became a ${lc(nk)}`;
  } else { g.reverse(); change = `the ${lc(g[1])} and ${lc(g[0])} swapped places`; }
  const options: QuestionOption[] = LETTERS.map((l, i) => ({ label: l, text: REGION_TEXT[i] }));
  return finish({
    id: `difference-${seed}`, family: "difference", difficulty, promptEs: "Flores y Sombras",
    prompt: "Which region changed between the two pictures?", options, answer: changed,
    explanation: `Region ${LETTERS[changed]} (${REGION_TEXT[changed].toLowerCase()}): ${change}.`,
    scene: { template: "difference-pair", seed, data: { regions }, variant: { regions: variant } },
  });
}

// ---------------------------------------------------------------- reveal (¿Qué Es?)
const CROP: Record<1 | 2 | 3, number> = { 1: 56, 2: 44, 3: 34 };
export function genReveal(seed: string, subjectHint?: ObjectKind): ContentItem {
  const r = rng("reveal:" + seed);
  const difficulty = (1 + r.int(3)) as 1 | 2 | 3;
  const subject = subjectHint ?? r.pick(ALL_KINDS);
  const shapes = shapesFor(subject);
  const s = CROP[difficulty];
  const main = shapes.filter((x) => !x.d);
  let crop = { x: 0, y: 0, s };
  for (let tries = 0; tries < 20; tries++) {
    const p = r.pick(main);
    const c = p.t === "c" || p.t === "e" ? [p.cx, p.cy] : p.t === "r" ? [p.x + p.w / 2, p.y + p.h / 2] : [p.pts[0], p.pts[1]];
    const clamp = (v: number) => Math.max(0, Math.min(100 - s, Math.round(v - s / 2 + (r.next() - 0.5) * s * 0.4)));
    crop = { x: clamp(c[0]), y: clamp(c[1]), s };
    if (shapes.some((x) => intersects(x, crop))) break;
  }
  const kinds = r.shuffle([subject, ...r.shuffle(ALL_KINDS.filter((k) => k !== subject)).slice(0, 3)]);
  const options: QuestionOption[] = kinds.map((k, i) => ({ label: LETTERS[i], text: OBJECTS[k].label })); // no icons: would spoil
  return finish({
    id: `reveal-${seed}`, family: "reveal", difficulty, promptEs: "¿Qué Es?", prompt: "What is the mystery picture?",
    options, answer: kinds.indexOf(subject),
    explanation: `It was a ${lc(subject)} (an original illustration for this game).`,
    scene: { template: "reveal-object", seed, data: { shapes, crop } },
  });
}

// ---------------------------------------------------------------- altar
export type AltarQ = { type: "clue"; clue: string } | { type: "level"; level: 0 | 1 | 2 } | { type: "end"; level: 0 | 1 | 2; side: "left" | "right" };
const LEVEL_NAME = ["TOP", "MIDDLE", "BOTTOM"];

function buildTiers(r: Rng, must: ObjectKind[]): ObjectKind[][] {
  const fill = r.shuffle(ALL_KINDS.filter((k) => !must.includes(k)));
  const all = r.shuffle([...must, ...fill.slice(0, 9 - must.length)]);
  return [all.slice(0, 2), all.slice(2, 5), all.slice(5, 9)];
}

export function altarAnswerKind(tiers: ObjectKind[][], q: AltarQ): ObjectKind | null {
  if (q.type === "clue") return ALTAR_CLUES.find((c) => c.id === q.clue)?.answer ?? null;
  if (q.type === "end") { const t = tiers[q.level]; return q.side === "left" ? t[0] : t[t.length - 1]; }
  return null; // level: validated via membership
}

export function genAltarClue(clue: AltarClue, variant: number): ContentItem {
  const r = rng(`altar:${clue.id}:${variant}`);
  const pool = ALTAR_SYMBOL_KINDS.filter((k) => k !== clue.answer && !clue.exclude.includes(k));
  const kinds = r.shuffle([clue.answer, ...r.shuffle(pool).slice(0, 3)]);
  const tiers = buildTiers(r, kinds);
  return finish({
    id: `altar-${clue.id}-${variant}`, family: "altar", difficulty: (variant === 0 ? 1 : 2) as 1 | 2, promptEs: "El Altar",
    prompt: clue.prompts[variant % clue.prompts.length], options: kindOpts(kinds), answer: kinds.indexOf(clue.answer),
    explanation: clue.explanation + " Ofrendas differ from family to family and region to region.", source: clue.source,
    scene: { template: "altar-tiers", seed: `${clue.id}:${variant}`, data: { tiers, q: { type: "clue", clue: clue.id } } },
  });
}

export function genAltarLayout(seed: string): ContentItem {
  const r = rng("altar-layout:" + seed);
  const tiers = buildTiers(r, []);
  const level = r.int(3) as 0 | 1 | 2;
  let q: AltarQ; let ans: ObjectKind; let prompt: string; let difficulty: 1 | 2 | 3;
  if (r.next() < 0.5) {
    q = { type: "level", level }; ans = r.pick(tiers[level]); difficulty = 1;
    prompt = `Which of these sits on the ${LEVEL_NAME[level]} level of the altar?`;
  } else {
    const side = r.pick(["left", "right"] as const);
    q = { type: "end", level, side }; ans = altarAnswerKind(tiers, q)!; difficulty = level === 1 ? 3 : 2;
    prompt = `Which object is at the far ${side.toUpperCase()} of the ${LEVEL_NAME[level]} level?`;
  }
  const others = tiers.flat().filter((k) => (q.type === "level" ? !tiers[level].includes(k) : k !== ans));
  const kinds = r.shuffle([ans, ...r.shuffle(others).slice(0, 3)]);
  return finish({
    id: `altar-layout-${seed}`, family: "altar", difficulty, promptEs: "El Altar", prompt, options: kindOpts(kinds), answer: kinds.indexOf(ans),
    explanation: `The ${lc(ans)} is on the ${LEVEL_NAME[level].toLowerCase()} level. This is our own illustrated arrangement: real ofrendas vary by family and region.`,
    scene: { template: "altar-tiers", seed, data: { tiers, q } },
  });
}
