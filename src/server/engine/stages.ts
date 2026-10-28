import type { GameFamily, Stage } from "@/shared/types";
import type { Settings } from "./types";

/** Per-family stage machine (docs/GAMES-V2.md). */
export const STAGES: Record<GameFamily, Stage[]> = {
  calavera: ["write", "vote"],
  room: ["answer", "guess"],
  case: ["clue", "answer"],
  line: ["answer"],
  loteria: ["answer"],
  closest: ["answer"],
};

export const firstStage = (f: GameFamily): Stage => STAGES[f][0];
export const lastStage = (f: GameFamily): Stage => STAGES[f][STAGES[f].length - 1];
export function nextStage(f: GameFamily, st: Stage): Stage | null {
  const a = STAGES[f];
  const i = a.indexOf(st);
  return i >= 0 && i < a.length - 1 ? a[i + 1] : null;
}
/** Stages in which phones submit nothing (TV only). */
export const isWatchStage = (f: GameFamily, st: Stage) => f === "case" && st === "clue";

/** Settings key `<family><Stage>Ms`. */
export function stageMs(s: Settings, f: GameFamily, st: Stage): number {
  const key = `${f}${st[0].toUpperCase()}${st.slice(1)}Ms` as keyof Settings;
  const v = s[key];
  return typeof v === "number" ? v : 40000;
}
export const revealMsFor = (s: Settings, f: GameFamily) => (f === "calavera" ? s.calaveraRevealMs : s.revealMs);

/** Max points of a question (before doubling). Case: whole set awarded on q3. */
export function questionMax(f: GameFamily, idx: number): number {
  if (f === "case") return idx === 2 ? 300 : 0;
  return 100;
}
