/**
 * Two Truths and a Fib: each voter who finds the fib 100; featured family round(100 × share of voters fooled).
 * Votes from the featured team are ignored (rejected at submit). <2 voters → void (caller).
 */
export function scoreFib(featuredTeamId: string, fibShown: number, votes: { teamId: string; choice: number }[]) {
  const valid = votes.filter((v) => v.teamId !== featuredTeamId);
  const points = new Map<string, number>();
  let fooled = 0;
  for (const v of valid) {
    const ok = v.choice === fibShown;
    if (!ok) fooled++;
    points.set(v.teamId, ok ? 100 : 0);
  }
  points.set(featuredTeamId, valid.length ? Math.round((100 * fooled) / valid.length) : 0);
  return { points, voters: valid.length, fooled };
}
export const fibVoid = (voters: number) => voters < 2;
