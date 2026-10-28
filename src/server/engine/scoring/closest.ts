/** Closest Without Going Over. */
export function closestBase(guess: number, truth: number): number {
  if (guess > truth) return 0;
  if (guess === truth) return 100;
  if (truth <= 0) return 0; // non-positive truths: only exact counts
  const acc = guess / truth;
  return acc >= 0.95 ? 100 : acc >= 0.85 ? 75 : acc >= 0.7 ? 50 : acc >= 0.5 ? 25 : 10;
}

/** All teams' guesses → points (incl. +25 closest-not-over bonus when ≥2 teams answered, cap 100). */
export function scoreClosest(guesses: { teamId: string; guess: number }[], truth: number): Map<string, { points: number; over: boolean; closest: boolean }> {
  const out = new Map<string, { points: number; over: boolean; closest: boolean }>();
  const under = guesses.filter((g) => g.guess <= truth);
  const best = under.length ? Math.max(...under.map((g) => g.guess)) : null;
  for (const g of guesses) {
    const over = g.guess > truth;
    const closest = guesses.length >= 2 && !over && best != null && g.guess === best;
    out.set(g.teamId, { points: Math.min(100, closestBase(g.guess, truth) + (closest ? 25 : 0)), over, closest });
  }
  return out;
}
