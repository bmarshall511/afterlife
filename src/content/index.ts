/**
 * Content API (docs/CONTRACTS.md "Content exports").
 * Server-side: allContent, revealInfo, generateFresh. publicQuestion is safe for any audience.
 */
import type { GameFamily, PublicQuestion, RevealInfo, SceneSpec, Stage } from "@/shared/types";
import { intersects, type Prim, ALL_KINDS, PALETTE } from "@/games/scenes/library";
import { ALTAR_CLUES, FAMILY, TRUTH } from "./facts";
import { genAltarClue, genAltarLayout, genDifference, genMemory, genReveal, LETTERS, readingSecondsFor, REGION_TEXT } from "./generators";
import type { ContentItem, PublicRecord } from "./types";
import { validateAll } from "./validate";

export type { ContentItem, PublicRecord } from "./types";
export { validateAll, validateItem } from "./validate";

export const POOL_TARGETS = { memory: 45, difference: 40, reveal: 30, altarLayout: 20 } as const;
/** Progressive reveal stage boundaries (ms since question opened). Engine must treat these as "due" so polls see new stages. */
export const REVEAL_STAGE_MS = [0, 12000, 24000] as const;
export function revealStageAt(elapsedMs: number): 0 | 1 | 2 {
  return elapsedMs >= REVEAL_STAGE_MS[2] ? 2 : elapsedMs >= REVEAL_STAGE_MS[1] ? 1 : 0;
}

function uniqueGenerated(n: number, prefix: string, gen: (seed: string) => ContentItem): ContentItem[] {
  const out: ContentItem[] = []; const seen = new Set<string>();
  for (let i = 1; out.length < n && i < n * 20; i++) {
    const it = gen(`${prefix}${i}`);
    const sig = JSON.stringify([it.prompt, it.options, it.scene?.data, it.scene?.variant]);
    if (!seen.has(sig)) { seen.add(sig); out.push(it); }
  }
  return out;
}

function buildAll(): ContentItem[] {
  const items: ContentItem[] = [];
  items.push(...TRUTH.map((t): ContentItem => {
    const options = [{ label: "True", text: "True" }, { label: "Invented", text: "Invented" }];
    return { id: t.id, version: 1, family: "truth", difficulty: t.difficulty, enabled: true, prompt: t.statement, promptEs: "¿Verdad o Invento?",
      options, answer: t.isTrue ? 0 : 1, explanation: t.explanation, source: t.source, readingSeconds: readingSecondsFor(t.statement, options) };
  }));
  items.push(...FAMILY.map((f): ContentItem => {
    const options = f.options.map((o, i) => ({ label: LETTERS[i], text: o.text, ...(o.icon ? { icon: o.icon } : {}) }));
    return { id: `family-${f.id}`, version: 1, family: "family", difficulty: 1, enabled: true, prompt: f.prompt, promptEs: f.promptEs ?? "La Familia Dice",
      options, answer: null, explanation: "No right or wrong here: points go to families who predicted the most popular choice.", readingSeconds: readingSecondsFor(f.prompt, options) };
  }));
  items.push(...uniqueGenerated(POOL_TARGETS.memory, "m", genMemory));
  items.push(...uniqueGenerated(POOL_TARGETS.difference, "d", genDifference));
  // reveal: spread subjects evenly across the library
  items.push(...uniqueGenerated(POOL_TARGETS.reveal, "r", (s) => genReveal(s, ALL_KINDS[Number(s.slice(1)) % ALL_KINDS.length])));
  for (const c of ALTAR_CLUES) for (let v = 0; v < c.prompts.length; v++) items.push(genAltarClue(c, v));
  items.push(...uniqueGenerated(POOL_TARGETS.altarLayout, "a", genAltarLayout));
  return items;
}

let CACHE: ContentItem[] | null = null;
/** All validated content. Throws on malformed content. */
export function allContent(): ContentItem[] {
  if (!CACHE) {
    const items = buildAll();
    const errs = validateAll(items);
    if (errs.length) throw new Error(`Content validation failed:\n${errs.join("\n")}`);
    CACHE = items;
  }
  return CACHE.map((x) => structuredClone(x));
}

/** Deterministic fresh visual instance (pool exhausted). null for families without generators. */
export function generateFresh(family: GameFamily, seed: string | number): ContentItem | null {
  const s = `fresh-${seed}`;
  const it = family === "memory" ? genMemory(s) : family === "difference" ? genDifference(s) : family === "reveal" ? genReveal(s)
    : family === "altar" ? genAltarLayout(s) : null;
  if (!it) return null;
  const errs = validateAll([it]);
  if (errs.length) throw new Error(`generated content invalid: ${errs.join("; ")}`);
  return it;
}

function stripScene(scene: SceneSpec | undefined): SceneSpec | undefined {
  if (!scene) return undefined;
  const { q: _q, ...data } = scene.data as Record<string, unknown>;
  void _q;
  return { ...scene, data };
}

/** JSON-serializable record for `question.public` (no answer/explanation/source/hidden rule). */
export function toPublicRecord(item: ContentItem | PublicRecord): PublicRecord {
  const { id, version, family, difficulty, enabled, prompt, promptEs, options, scene, readingSeconds } = item;
  return structuredClone({ id, version, family, difficulty, enabled, prompt, ...(promptEs ? { promptEs } : {}), options, scene: stripScene(scene), readingSeconds });
}

function revealStageScene(scene: SceneSpec, stage: 0 | 1 | 2 | 3): SceneSpec {
  // Resolve fill tokens to hex so no token name can hint at the subject.
  const shapes = ((scene.data.shapes as Prim[]) ?? []).map((p) => ({ ...p, f: (PALETTE[p.f] ?? p.f) as Prim["f"] }));
  const crop = scene.data.crop as { x: number; y: number; s: number };
  const full = { x: 0, y: 0, s: 100 };
  let data: Record<string, unknown>;
  if (stage === 0) data = { stage, view: crop, mono: false, shapes: shapes.filter((p) => intersects(p, crop)) };
  else if (stage === 1) data = { stage, view: full, mono: true, shapes: shapes.filter((p) => !p.d).map((p) => ({ ...p, f: "#EDE7F6" as Prim["f"] })) };
  else if (stage === 2) data = { stage, view: full, mono: false, shapes: shapes.filter((p) => !p.d) };
  else data = { stage, view: full, mono: false, shapes };
  return { template: "reveal-stage", seed: scene.seed, data };
}

/** Public payload for a stage/audience. Never contains the answer. Accepts a full item or a stored PublicRecord. */
export function publicQuestion(
  item: ContentItem | PublicRecord,
  ctx: { stage: Stage; elapsedMs: number; audience: "tv" | "phone"; index?: number },
): PublicQuestion {
  const rec = toPublicRecord(item);
  let scene: SceneSpec | null = null;
  switch (rec.family) {
    case "memory": scene = ctx.audience === "tv" && ctx.stage === "expose" ? rec.scene ?? null : null; break;
    case "reveal": scene = rec.scene ? revealStageScene(rec.scene, revealStageAt(ctx.elapsedMs)) : null; break;
    case "difference": case "altar": scene = rec.scene ?? null; break;
    default: scene = null;
  }
  return {
    id: rec.id, family: rec.family, index: ctx.index ?? 0, prompt: rec.prompt,
    ...(rec.promptEs ? { promptEs: rec.promptEs } : {}),
    options: rec.options.map((o) => ({ ...o })), scene, readingSeconds: rec.readingSeconds,
  };
}

/** Server-only reveal info, stored in question.private. */
export function revealInfo(item: ContentItem): RevealInfo {
  const base = { explanation: item.explanation, source: item.source ? { title: item.source.title, url: item.source.url } : null };
  if (item.family === "family") return { ...base, correct: null, highlight: null };
  let highlight: Record<string, unknown> | null = null;
  if (item.family === "difference") highlight = { region: LETTERS[item.answer!], regionIndex: item.answer, regionText: REGION_TEXT[item.answer!] };
  else if (item.family === "reveal" && item.scene) highlight = { scene: revealStageScene(item.scene, 3) };
  else if (item.family === "memory" && item.scene) highlight = { scene: stripScene(item.scene) };
  else if (item.family === "altar") highlight = { icon: item.options[item.answer!].icon ?? null };
  return { ...base, correct: item.answer, highlight };
}
