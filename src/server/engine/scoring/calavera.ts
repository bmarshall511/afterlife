import type { VoteEntry } from "../types";

/**
 * Calavera. For each non-hidden team entry: round(100 * votesReceived / max(1, votersOtherThanSelf))
 * where votersOtherThanSelf = teams with a valid vote that are not the author; +10 (cap 100) for casting a
 * valid vote. Votes for hidden entries are discarded (that team counts as not having voted). Votes for
 * house entries are valid votes but score nobody. Self-votes are rejected at submit; ignored here too.
 * Teams that did not write (or whose entry is hidden) get 0.
 */
export function scoreCalavera(entries: VoteEntry[], votes: { teamId: string; entryId: string }[], hiddenAnswerIds: Set<string>) {
  const live = new Map(entries.filter((e) => !e.answerId || !hiddenAnswerIds.has(e.answerId)).map((e) => [e.id, e]));
  const valid = votes.filter((v) => live.has(v.entryId) && live.get(v.entryId)!.teamId !== v.teamId);
  const voters = new Set(valid.map((v) => v.teamId));
  const received = new Map<string, number>();
  for (const v of valid) received.set(v.entryId, (received.get(v.entryId) ?? 0) + 1);
  const points = new Map<string, number>();
  for (const e of live.values()) {
    if (e.house || !e.teamId) continue;
    const others = [...voters].filter((t) => t !== e.teamId).length;
    const base = Math.round((100 * (received.get(e.id) ?? 0)) / Math.max(1, others));
    points.set(e.teamId, Math.min(100, base + (voters.has(e.teamId) ? 10 : 0)));
  }
  return { points, votesFor: received, voters };
}
