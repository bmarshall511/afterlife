import { createHash } from "node:crypto";

/** Deterministic PRNG seeded by a string (mulberry32 over a sha256-derived seed). */
export function rng(seed: string) {
  let a = createHash("sha256").update(seed).digest().readUInt32LE(0);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], seed: string): T[] {
  const r = rng(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const iso = (ms: number) => new Date(ms).toISOString();
export const ms = (v: unknown): number => (v == null ? 0 : v instanceof Date ? v.getTime() : new Date(v as string).getTime());
