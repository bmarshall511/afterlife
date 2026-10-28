import type { Q } from "@/server/db";
import type { GameFamily } from "@/shared/types";
import { OBJECTIVE_FAMILIES } from "@/shared/types";
import type { ContentItem, ContentSource, PartyRow, Settings } from "./types";
import { shuffle } from "./rng";

/**
 * Content selection: seedable shuffle over enabled, not-yet-exposed items of a family.
 * When a family runs dry: generateFresh() deterministic instances, else an explicit "encore"
 * (least-recently-shown items) which is flagged in party.engine.encore and audited.
 */
export interface Pick {
  family: GameFamily;
  items: ContentItem[];
  encore: boolean;
}

async function exposure(q: Q, partyId: string) {
  const rows = await q.query(`SELECT content_id, shown, last_shown FROM content_exposure WHERE party_id=$1`, [partyId]);
  return new Map(rows.map((r) => [r.content_id as string, r]));
}

async function disabledIds(q: Q) {
  const rows = await q.query(`SELECT content_id FROM content_override WHERE enabled = false`);
  return new Set(rows.map((r) => r.content_id as string));
}

function pickFor(family: GameFamily, all: ContentItem[], exp: Map<string, any>, off: Set<string>, c: ContentSource, seed: string, allowEncore: boolean): Pick | null {
  const pool = all.filter((i) => i.family === family && i.enabled && !off.has(i.id));
  const fresh = shuffle(pool.filter((i) => !exp.has(i.id)), seed);
  const items = fresh.slice(0, 3);
  for (let k = 0; items.length < 3 && k < 12; k++) {
    let g: ContentItem | null = null;
    try {
      g = c.generateFresh(family, `${seed}:gen:${k}`);
    } catch {
      g = null;
    }
    if (!g) break;
    if (!exp.has(g.id) && !items.some((x) => x.id === g!.id)) items.push(g);
  }
  if (items.length === 3) return { family, items, encore: false };
  if (!allowEncore || pool.length < 3) return null;
  const old = pool
    .filter((i) => !items.some((x) => x.id === i.id))
    .sort((a, b) => {
      const ea = exp.get(a.id), eb = exp.get(b.id);
      return (ea?.shown ?? 0) - (eb?.shown ?? 0) || +new Date(ea?.last_shown ?? 0) - +new Date(eb?.last_shown ?? 0) || a.id.localeCompare(b.id);
    });
  while (items.length < 3 && old.length) items.push(old.shift()!);
  return items.length === 3 ? { family, items, encore: true } : null;
}

export async function chooseSet(q: Q, p: PartyRow, s: Settings, c: ContentSource, opts: { allowFamily: boolean; seed: string }): Promise<Pick | null> {
  const all = c.allContent();
  const [exp, off] = await Promise.all([exposure(q, p.id), disabledIds(q)]);
  const enabled = new Set(s.families?.length ? s.families : [...OBJECTIVE_FAMILIES, "family"]);
  const last = p.engine.lastFamily ?? null;
  const order: GameFamily[] = [];
  if (opts.allowFamily && enabled.has("family") && last !== "family") order.push("family");
  let objs = shuffle(OBJECTIVE_FAMILIES.filter((f) => enabled.has(f) && f !== last), opts.seed + ":fam");
  if (!objs.length) objs = shuffle(OBJECTIVE_FAMILIES.filter((f) => f !== last), opts.seed + ":fam");
  order.push(...objs);
  for (const f of order) {
    const pk = pickFor(f, all, exp, off, c, `${opts.seed}:${f}`, false);
    if (pk) return pk;
  }
  // Everything exhausted: explicit encore, objective families only.
  for (const f of objs) {
    const pk = pickFor(f, all, exp, off, c, `${opts.seed}:${f}`, true);
    if (pk) return pk;
  }
  return null;
}

export async function markExposed(q: Q, partyId: string, ids: string[], now: number) {
  for (const id of ids)
    await q.query(
      `INSERT INTO content_exposure (party_id, content_id, shown, last_shown) VALUES ($1,$2,1,$3)
       ON CONFLICT (party_id, content_id) DO UPDATE SET shown = content_exposure.shown + 1, last_shown = $3`,
      [partyId, id, new Date(now).toISOString()],
    );
}
