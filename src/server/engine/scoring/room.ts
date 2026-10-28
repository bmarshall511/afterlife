/** Read the Room. Actual% = share of eligible answers matching the team's answer (rounded). */
export function roomActual(tally: number[], choice: number): number {
  const n = tally.reduce((a, b) => a + b, 0);
  return n ? Math.round((100 * (tally[choice] ?? 0)) / n) : 0;
}
export const scoreRoom = (guess: number, actual: number) => Math.max(0, 100 - 3 * Math.abs(guess - actual));
/** <3 eligible answers → void */
export const roomVoid = (tally: number[]) => tally.reduce((a, b) => a + b, 0) < 3;
