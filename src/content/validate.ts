import { isKind, matchKind, OBJECTS, type ObjectKind } from "@/games/scenes/library";
import { altarAnswerKind, memoryAnswerValue, type AltarQ, type MemoryQ } from "./generators";
import type { ContentItem } from "./types";

const FAMILIES = ["memory", "truth", "difference", "reveal", "altar", "family"];
export const TEMPLATES = ["memory-shelf", "difference-pair", "reveal-object", "altar-tiers"] as const;
const labelToKind = (text: string): ObjectKind | null =>
  (Object.keys(OBJECTS) as ObjectKind[]).find((k) => OBJECTS[k].label === text) ?? null;

/** Returns list of problems for one item (empty = valid). */
export function validateItem(it: ContentItem): string[] {
  const e: string[] = [];
  const P = (m: string) => e.push(`${it?.id ?? "?"}: ${m}`);
  if (!it || typeof it.id !== "string" || !it.id) return ["item without id"];
  if (!FAMILIES.includes(it.family)) P("bad family");
  if (![1, 2, 3].includes(it.difficulty)) P("bad difficulty");
  if (!it.prompt?.trim()) P("empty prompt");
  if (!it.explanation?.trim()) P("empty explanation");
  if (!(it.readingSeconds > 0)) P("missing readingSeconds");
  const want = it.family === "truth" ? 2 : 4;
  if (!Array.isArray(it.options) || it.options.length !== want) P(`expected ${want} options`);
  const opts = it.options ?? [];
  if (new Set(opts.map((o) => o.text.trim().toLowerCase())).size !== opts.length) P("duplicate option text");
  if (new Set(opts.map((o) => o.label)).size !== opts.length) P("duplicate option label");
  if (opts.some((o) => !o.text?.trim())) P("empty option");
  if (opts.some((o) => o.icon !== undefined && !isKind(o.icon))) P("unknown option icon");
  if (it.family === "family") {
    if (it.answer !== null) P("family must have null answer");
    return e;
  }
  if (typeof it.answer !== "number" || !Number.isInteger(it.answer) || it.answer < 0 || it.answer >= opts.length) { P("missing/out-of-range answer"); return e; }
  const ans = opts[it.answer];
  const factual = it.family === "truth" || ((it.scene?.data as { q?: { type?: string } } | undefined)?.q?.type === "clue");
  if (factual) {
    if (!it.source?.url?.startsWith("https://") || !it.source.title || !it.source.verification) P("factual item missing source");
  }
  const sc = it.scene;
  const needsScene = ["memory", "difference", "reveal", "altar"].includes(it.family);
  if (needsScene && !sc) { P("missing scene"); return e; }
  if (sc && !(TEMPLATES as readonly string[]).includes(sc.template)) { P(`invalid scene template ${sc.template}`); return e; }
  const d = (sc?.data ?? {}) as Record<string, unknown>;
  switch (it.family) {
    case "memory": {
      const cells = d.cells as unknown[]; const cols = d.cols as number, rows = d.rows as number; const q = d.q as MemoryQ;
      if (!Array.isArray(cells) || cells.length !== cols * rows || !cells.every(isKind)) { P("bad memory cells"); break; }
      const ks = cells as ObjectKind[];
      if (q?.type === "count") {
        const n = memoryAnswerValue(ks, cols, rows, q);
        const hits = opts.filter((o) => Number(o.text) === n).length;
        if (hits !== 1 || Number(ans.text) !== n) P("count ambiguity / wrong answer");
      } else if (q?.type === "absent") {
        const absent = opts.filter((o) => !ks.includes(o.icon as ObjectKind));
        if (absent.length !== 1 || absent[0] !== ans) P("absent ambiguity");
      } else if (q?.type === "beside" || q?.type === "corner") {
        const v = memoryAnswerValue(ks, cols, rows, q);
        if (!v || ans.icon !== v || opts.filter((o) => o.icon === v).length !== 1) P("memory answer mismatch");
      } else P("unknown memory q");
      break;
    }
    case "difference": {
      const a = d.regions as unknown[][], b = (sc!.variant as { regions?: unknown[][] } | undefined)?.regions;
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 4 || b.length !== 4) { P("bad difference regions"); break; }
      if (![...a, ...b].every((g) => Array.isArray(g) && g.length >= 1 && g.length <= 2 && g.every(isKind))) P("bad region contents");
      const changed = a.map((g, i) => JSON.stringify(g) !== JSON.stringify(b[i]));
      if (changed.filter(Boolean).length !== 1) P("difference must change exactly 1 region");
      else if (changed.indexOf(true) !== it.answer) P("difference answer mismatch");
      break;
    }
    case "reveal": {
      const k = matchKind(d.shapes);
      const crop = d.crop as { x: number; y: number; s: number } | undefined;
      if (!k) P("reveal shapes do not match a verified library object");
      else if (labelToKind(ans.text) !== k) P("reveal answer does not match art");
      if (!crop || crop.x < 0 || crop.y < 0 || crop.x + crop.s > 100 || crop.y + crop.s > 100) P("bad reveal crop");
      if (opts.some((o) => o.icon)) P("reveal options must not carry icons");
      if (opts.some((o) => !labelToKind(o.text))) P("reveal option is not a library object");
      break;
    }
    case "altar": {
      const tiers = d.tiers as unknown[][]; const q = d.q as AltarQ;
      if (!Array.isArray(tiers) || tiers.length !== 3 || !tiers.every((t) => Array.isArray(t) && t.every(isKind))) { P("bad tiers"); break; }
      const flat = tiers.flat() as ObjectKind[];
      if (new Set(flat).size !== flat.length) P("duplicate object on altar");
      if (opts.some((o) => !flat.includes(o.icon as ObjectKind))) P("altar option not on altar");
      if (q?.type === "level") {
        const on = opts.filter((o) => (tiers[q.level] as string[]).includes(o.icon!));
        if (on.length !== 1 || on[0] !== ans) P("altar level ambiguity");
      } else {
        const k = altarAnswerKind(tiers as ObjectKind[][], q);
        if (!k || ans.icon !== k) P("altar answer mismatch");
        if (q?.type === "clue" && !it.source) P("factual altar item missing source");
      }
      break;
    }
  }
  return e;
}

export function validateAll(items: ContentItem[]): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  const sig = new Set<string>();
  for (const it of items) {
    if (ids.has(it.id)) errs.push(`duplicate id ${it.id}`);
    ids.add(it.id);
    const s = JSON.stringify([it.family, it.prompt, it.options, it.scene?.data, it.scene?.variant]);
    if (sig.has(s)) errs.push(`duplicate instance ${it.id}`);
    sig.add(s);
    errs.push(...validateItem(it));
  }
  return errs;
}
