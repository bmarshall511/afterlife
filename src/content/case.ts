/**
 * The Ofrenda Case — deterministic deduction puzzles. 4 fictional ancestors → 4 altars (1 = far left … 4 = far right).
 * A puzzle is accepted only if: >1 solution after round-1 clues, >1 after round 2, exactly 1 after round 3.
 */
import { hashStr, mulberry, opaqueId, shuffle } from "./rng";

export interface Ancestor { name: string; bio: string; offering: string; icon: string }

export const ANCESTORS: Ancestor[] = [
  { name: "Don Aurelio", bio: "Mended every radio in the barrio; never once read a manual.", offering: "black coffee", icon: "off-coffee" },
  { name: "Doña Consuelo", bio: "Won every lotería night for thirty years. Rumours persist.", offering: "pan de muerto", icon: "off-pan" },
  { name: "Tío Ezequiel", bio: "Played the trumpet at every wedding, invited or not.", offering: "mezcal", icon: "off-mezcal" },
  { name: "Tía Remedios", bio: "Knew a herbal cure for everything except her own gossip.", offering: "hot chocolate", icon: "off-chocolate" },
  { name: "Abuelo Fermín", bio: "Grew chiles so hot the neighbours signed a petition.", offering: "tamales", icon: "off-tamal" },
  { name: "Abuela Socorro", bio: "Taught three generations to dance cumbia in her kitchen.", offering: "mole", icon: "off-mole" },
  { name: "Don Prudencio", bio: "Wore a three-piece suit to the beach. Twice.", offering: "cigars", icon: "off-cigar" },
  { name: "Doña Esperanza", bio: "Fed every stray dog in town and named them all after saints.", offering: "sugar skulls", icon: "off-skull" },
  { name: "Tío Leandro", bio: "Swore he once arm-wrestled a famous luchador. Probably didn’t.", offering: "tequila", icon: "off-tequila" },
  { name: "Tía Clementina", bio: "Ran the parish raffle like a military operation.", offering: "oranges", icon: "off-orange" },
  { name: "Abuelo Teodoro", bio: "Read the newspaper aloud to anyone within ten metres.", offering: "a newspaper", icon: "off-paper" },
  { name: "Abuela Natividad", bio: "Embroidered flowers on everything that held still.", offering: "marigolds", icon: "off-marigold" },
  { name: "Don Severo", bio: "Never lost an argument; occasionally lost his glasses mid-argument.", offering: "dominoes", icon: "off-dominoes" },
  { name: "Doña Paz", bio: "Kept a guitar under the bed for ‘emergencies’.", offering: "a guitar pick", icon: "off-guitar" },
  { name: "Tío Baltazar", bio: "Fixed cars with wire, chewing gum and confidence.", offering: "atole", icon: "off-atole" },
  { name: "Tía Amparo", bio: "Grew roses that won prizes and enemies in equal measure.", offering: "a red rose", icon: "off-rose" },
];

export const SLOTS = ["Altar 1 (far left)", "Altar 2", "Altar 3", "Altar 4 (far right)"];
const ORD = ["first", "second", "third", "fourth"];

type Perm = number[]; // perm[person] = position 0..3
export type Clue = { kind: string; text: string; test: (p: Perm) => boolean; weight: number };

export const ALL_PERMS: Perm[] = (() => {
  const out: Perm[] = [];
  const rec = (cur: number[], used: Set<number>) => {
    if (cur.length === 4) { out.push([...cur]); return; }
    for (let i = 0; i < 4; i++) if (!used.has(i)) { used.add(i); cur.push(i); rec(cur, used); cur.pop(); used.delete(i); }
  };
  rec([], new Set());
  return out;
})();

export function countSolutions(clues: Pick<Clue, "test">[]): number {
  return ALL_PERMS.filter((p) => clues.every((c) => c.test(p))).length;
}

function candidateClues(people: Ancestor[], sol: Perm): Clue[] {
  const n = (i: number) => people[i].name;
  const off = (i: number) => `the ancestor who loved ${people[i].offering}`;
  const ref = (i: number, alt: boolean) => (alt ? off(i) : n(i));
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  const out: Clue[] = [];
  for (let a = 0; a < 4; a++) {
    out.push({ kind: "pos", text: `${n(a)} sits on the ${ORD[sol[a]]} altar.`, test: (p) => p[a] === sol[a], weight: 1 });
    for (let k = 0; k < 4; k++) if (k !== sol[a]) out.push({ kind: "notpos", text: `${n(a)} is not on the ${ORD[k]} altar.`, test: (p) => p[a] !== k, weight: 2 });
    const end = sol[a] === 0 || sol[a] === 3;
    out.push({ kind: "end", text: end ? `${cap(off(a))} is at one of the two ends.` : `${cap(off(a))} is not at either end.`, test: (p) => (p[a] === 0 || p[a] === 3) === end, weight: 3 });
    for (let b = 0; b < 4; b++) {
      if (a === b) continue;
      const alt = (a + b) % 2 === 0;
      if (sol[a] < sol[b]) out.push({ kind: "left", text: `${cap(ref(a, alt))} is somewhere to the left of ${ref(b, !alt)}.`, test: (p) => p[a] < p[b], weight: 3 });
      if (sol[b] - sol[a] === 1) out.push({ kind: "imm", text: `${n(a)} is immediately to the left of ${n(b)}.`, test: (p) => p[b] - p[a] === 1, weight: 2 });
      if (a < b && Math.abs(sol[a] - sol[b]) === 1) out.push({ kind: "next", text: `${cap(off(a))} sits right next to ${n(b)}.`, test: (p) => Math.abs(p[a] - p[b]) === 1, weight: 3 });
      if (a < b && Math.abs(sol[a] - sol[b]) > 1) out.push({ kind: "notnext", text: `${n(a)} and ${n(b)} are not next to each other — old feud.`, test: (p) => Math.abs(p[a] - p[b]) > 1, weight: 3 });
      if (a < b && Math.abs(sol[a] - sol[b]) === 2) out.push({ kind: "gap", text: `Exactly one altar separates ${n(a)} and ${off(b)}.`, test: (p) => Math.abs(p[a] - p[b]) === 2, weight: 2 });
    }
  }
  return out;
}

export interface CasePuzzle { puzzleId: string; people: { id: string; name: string; bio: string; offering: string; icon: string }[];
  slots: { id: string; label: string }[]; rounds: [string[], string[], string[]]; solution: Record<string, string>; counts: [number, number, number] }

/** Deterministic puzzle for a seed; returns null if the seed doesn't yield a valid puzzle (caller tries next seed). */
export function tryPuzzle(seed: string): CasePuzzle | null {
  const rnd = mulberry(hashStr(`case:${seed}`));
  const people = shuffle(ANCESTORS, rnd).slice(0, 4);
  const sol = ALL_PERMS[Math.floor(rnd() * 24)];
  const cands = shuffle(candidateClues(people, sol), rnd);
  const pick = (from: Clue[], have: Clue[], ok: (c: number) => boolean, maxW: number) => {
    for (const c of from) {
      if (have.includes(c) || c.weight < maxW) continue;
      const cnt = countSolutions([...have, c]);
      if (cnt < countSolutions(have) && ok(cnt)) return c;
    }
    return null;
  };
  const r1: Clue[] = [];
  for (let i = 0; i < 2; i++) { const c = pick(cands, r1, (k) => k >= 5, 3); if (!c) return null; r1.push(c); }
  const r2: Clue[] = [];
  { const c = pick(cands, [...r1], (k) => k >= 2 && k <= 4, 2); if (!c) return null; r2.push(c); }
  const r3: Clue[] = [];
  { const c = pick(cands, [...r1, ...r2], (k) => k === 1, 2) ?? pick(cands, [...r1, ...r2], (k) => k === 1, 1); if (!c) return null; r3.push(c); }
  const counts: [number, number, number] = [countSolutions(r1), countSolutions([...r1, ...r2]), countSolutions([...r1, ...r2, ...r3])];
  if (!(counts[0] > 1 && counts[1] > 1 && counts[2] === 1)) return null;
  const pid = opaqueId(`case:${seed}`);
  const ppl = people.map((p) => ({ id: opaqueId(`${pid}:p:${p.name}`), ...p }));
  const slots = SLOTS.map((label, i) => ({ id: opaqueId(`${pid}:s:${i}`), label }));
  const solution: Record<string, string> = {};
  ppl.forEach((p, i) => { solution[p.id] = slots[sol[i]].id; });
  return { puzzleId: pid, people: ppl, slots, rounds: [r1.map((c) => c.text), r2.map((c) => c.text), r3.map((c) => c.text)], solution, counts };
}

/** Re-derive solutions from clue TEXT is impossible; validation re-solves via the candidate tests instead. */
export function solveCount(p: CasePuzzle, upto: 0 | 1 | 2, seed: string): number {
  const rnd = mulberry(hashStr(`case:${seed}`));
  const people = shuffle(ANCESTORS, rnd).slice(0, 4);
  const sol = ALL_PERMS[Math.floor(rnd() * 24)];
  const byText = new Map(candidateClues(people, sol).map((c) => [c.text, c]));
  const texts = p.rounds.slice(0, upto + 1).flat();
  const clues = texts.map((t) => byText.get(t)!);
  if (clues.some((c) => !c)) return -1;
  return countSolutions(clues);
}
