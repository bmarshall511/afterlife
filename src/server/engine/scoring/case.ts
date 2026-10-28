/** Ofrenda Case: lock at clue round k (0-based), c correct pairs → round((300 - 75k) * c / 4). */
export function correctPairs(lock: Record<string, string>, solution: Record<string, string>): number {
  return Object.keys(solution).filter((p) => lock[p] === solution[p]).length;
}
export function scoreCase(lock: Record<string, string>, solution: Record<string, string>, round: number): number {
  const n = Object.keys(solution).length || 4;
  return Math.round(((300 - 75 * round) * correctPairs(lock, solution)) / n);
}
