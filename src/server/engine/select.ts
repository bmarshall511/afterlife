import type { Q } from "@/server/db";
import type { GameFamily } from "@/shared/types";
import { OBJECTIVE_FAMILIES, SOCIAL_FAMILIES } from "@/shared/types";
import type { ContentItem, ContentSource, PartyRow, Settings } from "./types";
import { shuffle } from "./rng";

/**
 * Scheduling + content selection (docs/GAMES-V2.md global rules).
 *  - 1–2 teams: objective families only. ≥3: all six, a social family at most every other set.
 *  - never the same family twice in a row; admin enabled list = settings.families.
 *  - rotation: least-played family first (seeded tie-break) so pools drain evenly.
 *  - items: not yet exposed, one per difficulty 1→2→3 where possible, ordered by difficulty.
 *  - case: one puzzle per set via caseSet(seed).
 *  - pool dry: generateFresh(), else explicit "encore" (least recently shown), audited by the caller.
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

const byDiff = (a: ContentItem, b: ContentItem) => a.difficulty - b.difficulty;

/** one of each difficulty when available, else fill from the rest; sorted 1→2→3 */
function pickThree(cands: ContentItem[]): ContentItem[] {
  const out: ContentItem[] = [];
  for (const d of [1, 2, 3]) {
    const it = cands.find((c) => c.difficulty === d && !out.includes(c));
    if (it) out.push(it);
  }
  for (const c of cands) if (out.length < 3 && !out.includes(c)) out.push(c);
  return out.slice(0, 3).sort(byDiff);
}

function pickFor(family: GameFamily, all: ContentItem[], exp: Map<string, any>, off: Set<string>, c: ContentSource, seed: string, allowEncore: boolean): Pick | null {
  if (family === "case") {
    for (let k = 0; k < 6; k++) {
      let set: ContentItem[] = [];
      try {
        set = c.caseSet(`${seed}:case:${k}`) ?? [];
      } catch {
        set = [];
      }
      if (set.length === 3 && !set.some((i) => exp.has(i.id) || off.has(i.id))) return { family, items: set, encore: false };
    }
    return null;
  }
  const pool = all.filter((i) => i.family === family && i.enabled && !off.has(i.id));
  let items = pickThree(shuffle(pool.filter((i) => !exp.has(i.id)), seed));
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
  if (items.length === 3) return { family, items: items.sort(byDiff), encore: false };
  if (!allowEncore || pool.length < 3) return null;
  const old = pool
    .filter((i) => !items.some((x) => x.id === i.id))
    .sort((a, b) => {
      const ea = exp.get(a.id), eb = exp.get(b.id);
      return (ea?.shown ?? 0) - (eb?.shown ?? 0) || +new Date(ea?.last_shown ?? 0) - +new Date(eb?.last_shown ?? 0) || a.id.localeCompare(b.id);
    });
  items = [...items, ...pickThree(old).slice(0, 3 - items.length)];
  return items.length === 3 ? { family, items: items.sort(byDiff), encore: true } : null;
}

/** Ordered candidate families for the next set. Exported for tests. */
export function familyOrder(p: Pick0, s: Settings, teams: number, seed: string): GameFamily[] {
  const enabled = new Set(s.families);
  const last = p.lastFamily ?? null;
  const socialOk = teams >= 3 && !p.forceObjective && !(last && SOCIAL_FAMILIES.includes(last));
  let allowed = [...OBJECTIVE_FAMILIES, ...(socialOk ? SOCIAL_FAMILIES : [])].filter((f) => enabled.has(f) && f !== last);
  // Host enabled a single game: honour it even though that means repeating the same game back to back.
  if (!allowed.length) allowed = [...OBJECTIVE_FAMILIES, ...(teams >= 3 && !p.forceObjective ? SOCIAL_FAMILIES : [])].filter((f) => enabled.has(f));
  const played = p.played ?? {};
  return shuffle(allowed, seed + ":fam").sort((a, b) => (played[a] ?? 0) - (played[b] ?? 0));
}
type Pick0 = { lastFamily?: GameFamily | null; forceObjective?: boolean; played?: Partial<Record<GameFamily, number>> };

export async function chooseSet(q: Q, p: PartyRow, s: Settings, c: ContentSource, opts: { teams: number; seed: string }): Promise<Pick | null> {
  const all = c.allContent();
  const [exp, off] = await Promise.all([exposure(q, p.id), disabledIds(q)]);
  let order = familyOrder(p.engine, s, opts.teams, opts.seed);
  // admin disabled every eligible objective family: fall back to any objective family (never a social repeat)
  if (!order.length) order = shuffle(OBJECTIVE_FAMILIES.filter((f) => f !== p.engine.lastFamily), opts.seed + ":fb");
  for (const f of order) {
    const pk = pickFor(f, all, exp, off, c, `${opts.seed}:${f}`, false);
    if (pk) return pk;
  }
  for (const f of order) {
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
