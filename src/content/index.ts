/**
 * Content API v2 (docs/GAMES-V2.md "Shared module interfaces").
 * Server-side: allContent, revealInfo, generateFresh, caseSet. publicQuestion never includes secrets.
 */
import type { GameFamily, InputSpec, PublicQuestion, RevealInfo, SceneSpec, Stage } from "@/shared/types";
import { CALAVERAS } from "./calavera";
import { tryPuzzle } from "./case";
import closestJson from "./data/closest.json";
import lineJson from "./data/line.json";
import { CARDS, RIDDLES } from "./loteria";
import { POLLS } from "./room";
import { hashStr, mulberry, opaqueId, shuffle } from "./rng";
import type { CalaveraData, CaseData, ClosestData, ContentItem, LineData, LoteriaData, RoomData } from "./types";
import { validateAll } from "./validate";

export type { ContentItem, ContentSource } from "./types";
export { validateAll } from "./validate";

export const LETTERS = "ABCDEFGHIJKL".split("");
export const CASE_PUZZLES = 48;

export function readingSecondsFor(...texts: string[]): number {
  const words = texts.join(" ").split(/\s+/).filter(Boolean).length;
  return Math.max(4, Math.min(20, Math.round(words / 3.2) + 2));
}

interface RawLine { id: string; prompt: string; lowLabel: string; highLabel: string; unit: string; difficulty: number;
  items: { text: string; value: number; display: string }[]; explanation: string; source: { title: string; url: string; verification: string } }
interface RawClosest { id: string; prompt: string; value: number; unit: string; min: number; max: number; step: number; difficulty: number;
  explanation: string; source: { title: string; url: string; verification: string } }

const d = (n: number): 1 | 2 | 3 => (n <= 1 ? 1 : n >= 3 ? 3 : 2);

function lineItem(r: RawLine): ContentItem {
  const id = `line-${r.id}`;
  const items = r.items.map((it) => ({ id: opaqueId(`${id}:${it.text}`), text: it.text, value: it.value, display: it.display }));
  const sorted = [...items].sort((a, b) => a.value - b.value);
  const truth = sorted.map((x) => x.id);
  // deterministic presentation that is neither the true order nor its reverse
  let presented = truth; let k = 0;
  const rev = [...truth].reverse().join();
  while (presented.join() === truth.join() || presented.join() === rev) presented = shuffle(truth, mulberry(hashStr(`${id}:${k++}`)));
  const data: LineData = { items: sorted, lowLabel: r.lowLabel, highLabel: r.highLabel, unit: r.unit, presented };
  return { id, version: 1, family: "line", difficulty: d(r.difficulty), enabled: true, prompt: r.prompt, promptEs: "La Línea",
    detail: `${r.lowLabel} → ${r.highLabel}`, readingSeconds: readingSecondsFor(r.prompt, ...items.map((i) => i.text)),
    data: data as unknown as Record<string, unknown>, answer: truth, explanation: r.explanation, source: r.source };
}

function closestItem(r: RawClosest): ContentItem {
  const data: ClosestData = { min: r.min, max: r.max, step: r.step, unit: r.unit, value: r.value };
  return { id: `closest-${r.id}`, version: 1, family: "closest", difficulty: d(r.difficulty), enabled: true, prompt: r.prompt,
    promptEs: "Sin pasarse", detail: `Answer in ${r.unit}. Go over and you bust.`, readingSeconds: readingSecondsFor(r.prompt),
    data: data as unknown as Record<string, unknown>, answer: r.value, explanation: r.explanation, source: r.source };
}

const cardById = new Map(CARDS.map((c) => [c.id, c]));
function loteriaItem(r: (typeof RIDDLES)[number]): ContentItem {
  const id = r.id;
  const n = r.difficulty === 1 ? 9 : 12;
  const rnd = mulberry(hashStr(`${id}:grid`));
  const answer = cardById.get(r.card)!;
  const tagged = shuffle(CARDS.filter((c) => c.id !== r.card && !r.near.includes(c.id)), rnd)
    .sort((a, b) => b.tags.filter((t) => answer.tags.includes(t)).length - a.tags.filter((t) => answer.tags.includes(t)).length);
  const chosen = [answer, ...r.near.map((x) => cardById.get(x)!), ...tagged].slice(0, n);
  const grid = shuffle(chosen, rnd);
  const options = grid.map((c, i) => ({ label: LETTERS[i], text: c.en, icon: `lot-${c.id}`, card: c.id }));
  const data: LoteriaData = { options, card: { id: answer.id, es: answer.es, en: answer.en, icon: `lot-${answer.id}` }, why: r.why };
  return { id, version: 1, family: "loteria", difficulty: r.difficulty, enabled: true, prompt: r.verse, promptEs: "¡Lotería!",
    readingSeconds: readingSecondsFor(r.verse), data: data as unknown as Record<string, unknown>,
    answer: grid.findIndex((c) => c.id === r.card), explanation: `${answer.es} — ${answer.en}. ${r.why}`, ...(r.source ? { source: r.source } : {}) };
}

function roomItem(r: (typeof POLLS)[number]): ContentItem {
  const data: RoomData = { options: [...r.options] };
  return { id: r.id, version: 1, family: "room", difficulty: r.difficulty, enabled: true, prompt: r.prompt, promptEs: "Lee el cuarto",
    readingSeconds: readingSecondsFor(r.prompt, ...r.options), data: data as unknown as Record<string, unknown>, answer: null,
    explanation: "No wrong answers — just how well you know this room." };
}

function calaveraItem(r: (typeof CALAVERAS)[number]): ContentItem {
  const data: CalaveraData = { house: [...r.house] };
  return { id: r.id, version: 1, family: "calavera", difficulty: r.difficulty, enabled: true, prompt: r.setup, promptEs: "Calaverita",
    ...(r.detail ? { detail: r.detail } : {}), readingSeconds: readingSecondsFor(r.setup), data: data as unknown as Record<string, unknown>,
    answer: null, explanation: "Calaveras literarias: playful verse epitaphs that tease the living (and La Catrina) every Día de Muertos." };
}

const CASE_PROMPTS = [
  "Four ancestors, four altars. Who goes where? Here are your first clues.",
  "A new clue arrives. Lock now for more points — or wait for more.",
  "Final clue. Exactly one arrangement fits them all.",
];

function caseItems(seed: string): ContentItem[] | null {
  const p = tryPuzzle(seed);
  if (!p) return null;
  return ([0, 1, 2] as const).map((round) => {
    const data: CaseData = { puzzleId: p.puzzleId, seed, round, people: p.people, slots: p.slots, rounds: p.rounds };
    const clues = p.rounds.slice(0, round + 1).flat();
    return { id: `case-${p.puzzleId}-r${round + 1}`, version: 1, family: "case" as const, difficulty: (round + 1) as 1 | 2 | 3, enabled: true,
      prompt: CASE_PROMPTS[round], promptEs: "El Caso de la Ofrenda", detail: clues.map((c, i) => `${i + 1}. ${c}`).join("\n"),
      readingSeconds: readingSecondsFor(...clues), data: data as unknown as Record<string, unknown>, answer: p.solution,
      explanation: round === 2 ? "Every clue together leaves exactly one way to seat the family." : "Still more than one arrangement fits — the next clue narrows it down." };
  });
}

/** Three clue-round items for one deterministic puzzle (scans seeds `${seed}`, `${seed}~1`, … until one validates). */
export function caseSet(seed: string | number): [ContentItem, ContentItem, ContentItem] {
  for (let i = 0; i < 500; i++) {
    const s = i === 0 ? String(seed) : `${seed}~${i}`;
    const it = caseItems(s);
    if (it) return it as [ContentItem, ContentItem, ContentItem];
  }
  throw new Error(`no case puzzle for seed ${seed}`);
}

function buildAll(): ContentItem[] {
  const items: ContentItem[] = [];
  items.push(...CALAVERAS.map(calaveraItem));
  items.push(...(lineJson as RawLine[]).map(lineItem));
  items.push(...RIDDLES.map(loteriaItem));
  items.push(...POLLS.map(roomItem));
  items.push(...(closestJson as RawClosest[]).map(closestItem));
  const seen = new Set<string>();
  for (let i = 0; seen.size < CASE_PUZZLES && i < 5000; i++) {
    const set = caseItems(`pool-${i}`);
    if (!set) continue;
    const pid = (set[0].data as unknown as CaseData).puzzleId;
    if (seen.has(pid)) continue;
    seen.add(pid); items.push(...set);
  }
  return items;
}

let CACHE: ContentItem[] | null = null;
/** All validated content. Throws on malformed content. */
export function allContent(): ContentItem[] {
  if (!CACHE) {
    const items = buildAll();
    const errs = validateAll(items, publicQuestion);
    if (errs.length) throw new Error(`Content validation failed:\n${errs.join("\n")}`);
    CACHE = items;
  }
  return CACHE.map((x) => structuredClone(x));
}

/** Fresh content when the pool is exhausted: only `case` can generate; others return null. */
export function generateFresh(family: GameFamily, seed: string | number): ContentItem | null {
  if (family !== "case") return null;
  return caseSet(`fresh-${seed}`)[0];
}

function inputFor(item: ContentItem, stage: Stage): InputSpec | null {
  const dt = item.data;
  switch (item.family) {
    case "calavera":
      if (stage === "write") return { kind: "text", maxLength: 90, placeholder: "Finish the verse…" };
      if (stage === "vote") return { kind: "vote", entries: [] }; // engine fills entries (shuffled by question id)
      return null;
    case "line": {
      if (stage !== "answer") return null;
      const L = dt as unknown as LineData;
      const byId = new Map(L.items.map((x) => [x.id, x.text]));
      return { kind: "order", items: L.presented.map((id) => ({ id, text: byId.get(id)! })), lowLabel: L.lowLabel, highLabel: L.highLabel };
    }
    case "loteria": {
      if (stage !== "answer") return null;
      const L = dt as unknown as LoteriaData;
      return { kind: "choice", layout: "grid", options: L.options.map(({ label, text, icon }) => ({ label, text, icon })) };
    }
    case "room": {
      const R = dt as unknown as RoomData;
      if (stage === "answer") return { kind: "choice", layout: "list", options: R.options.map((text, i) => ({ label: LETTERS[i], text })) };
      if (stage === "guess") return { kind: "percent", optionText: "" }; // engine fills the team's own option text
      return null;
    }
    case "closest": {
      if (stage !== "answer") return null;
      const C = dt as unknown as ClosestData;
      return { kind: "number", min: C.min, max: C.max, step: C.step, unit: C.unit };
    }
    case "case": {
      if (stage !== "answer") return null; // `clue` stage: watch the TV
      const C = dt as unknown as CaseData;
      return { kind: "assign", people: C.people.map(({ id, name }) => ({ id, name })), slots: C.slots.map(({ id, label }) => ({ ...{ id, label } })) };
    }
  }
}

function sceneFor(item: ContentItem): SceneSpec | null {
  const dt = item.data;
  switch (item.family) {
    case "loteria": {
      const L = dt as unknown as LoteriaData;
      return { template: "loteria-grid", seed: item.id, data: { cards: L.options.map(({ label, icon }) => ({ label, icon })) } };
    }
    case "case": {
      const C = dt as unknown as CaseData;
      return { template: "case-board", seed: C.puzzleId, data: { people: C.people, slots: C.slots, clues: C.rounds.slice(0, C.round + 1).flat(), round: C.round } };
    }
    case "line": {
      const L = dt as unknown as LineData;
      const byId = new Map(L.items.map((x) => [x.id, x.text]));
      return { template: "line-axis", seed: item.id, data: { items: L.presented.map((id) => ({ id, text: byId.get(id)! })), lowLabel: L.lowLabel, highLabel: L.highLabel } };
    }
    case "closest": {
      const C = dt as unknown as ClosestData;
      return { template: "closest-numberline", seed: item.id, data: { min: C.min, max: C.max, unit: C.unit } };
    }
    default: return null;
  }
}

/** Public payload for a stage. Never contains answers, values, house punchlines or case solutions. */
export function publicQuestion(item: ContentItem, ctx: { stage: Stage; round?: number; index: number }): PublicQuestion {
  let detail = item.detail;
  if (item.family === "case") {
    const C = item.data as unknown as CaseData;
    detail = C.rounds.slice(0, C.round + 1).flat().map((c, i) => `${i + 1}. ${c}`).join("\n");
  }
  return structuredClone({
    id: item.id, family: item.family, index: ctx.index, difficulty: item.difficulty, prompt: item.prompt,
    ...(item.promptEs ? { promptEs: item.promptEs } : {}), ...(detail ? { detail } : {}),
    input: inputFor(item, ctx.stage), scene: sceneFor(item), readingSeconds: item.readingSeconds,
  });
}

/** Server-only reveal info (engine adds `outcomes`). */
export function revealInfo(item: ContentItem): Omit<RevealInfo, "outcomes"> {
  const source = item.source ? { title: item.source.title, url: item.source.url } : null;
  const base = { explanation: item.explanation, source };
  const dt = item.data;
  switch (item.family) {
    case "calavera": return { ...base, correct: null, detail: { house: [...(dt as unknown as CalaveraData).house] } };
    case "room": return { ...base, correct: null, detail: { options: [...(dt as unknown as RoomData).options] } };
    case "line": {
      const L = dt as unknown as LineData;
      return { ...base, correct: item.answer, detail: { lowLabel: L.lowLabel, highLabel: L.highLabel, unit: L.unit, items: L.items.map((x) => ({ ...x })) } };
    }
    case "closest": {
      const C = dt as unknown as ClosestData;
      return { ...base, correct: C.value, detail: { value: C.value, unit: C.unit, min: C.min, max: C.max, display: /^years?$/.test(C.unit) ? String(C.value) : `${C.value.toLocaleString("en-US")} ${C.unit}` } };
    }
    case "loteria": {
      const L = dt as unknown as LoteriaData;
      return { ...base, correct: item.answer, detail: { card: { ...L.card }, why: L.why, answerLabel: LETTERS[item.answer as number] } };
    }
    case "case": {
      const C = dt as unknown as CaseData;
      if (C.round < 2) return { ...base, correct: null, detail: { round: C.round, final: false } };
      const sol = item.answer as Record<string, string>;
      return { ...base, correct: { ...sol }, detail: { round: 2, final: true, clues: C.rounds.flat(),
        solution: C.people.map((p) => ({ personId: p.id, name: p.name, icon: p.icon, offering: p.offering, slotId: sol[p.id], slot: C.slots.find((s) => s.id === sol[p.id])!.label })) } };
    }
  }
}
