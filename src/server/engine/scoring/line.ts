/** The Line: Kendall agreement. round(100 * concordantPairs / totalPairs). */
export function scoreLine(guess: string[], truth: string[]): number {
  const pos = new Map(guess.map((id, i) => [id, i]));
  let conc = 0, total = 0;
  for (let i = 0; i < truth.length; i++)
    for (let j = i + 1; j < truth.length; j++) {
      total++;
      const a = pos.get(truth[i]), b = pos.get(truth[j]);
      if (a != null && b != null && a < b) conc++;
    }
  return total ? Math.round((100 * conc) / total) : 0;
}
