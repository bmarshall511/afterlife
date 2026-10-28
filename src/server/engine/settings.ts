import type { GameFamily } from "@/shared/types";
import type { Settings } from "./types";

export const ALL_FAMILIES: GameFamily[] = ["calavera", "line", "loteria", "room", "closest", "case"];

export const DEFAULT_SETTINGS: Settings = {
  introMs: 15000,
  calaveraWriteMs: 75000,
  calaveraVoteMs: 30000,
  lineAnswerMs: 45000,
  loteriaAnswerMs: 40000,
  roomAnswerMs: 20000,
  roomGuessMs: 25000,
  closestAnswerMs: 40000,
  caseClueMs: 20000,
  caseAnswerMs: 40000,
  revealMs: 10000,
  calaveraRevealMs: 15000,
  resultsMs: 30000,
  intervalMs: 120000,
  minViewMs: 4000,
  catchUpGraceMs: 45000,
  tributeDwellMinMs: 20000,
  intervalTributeMs: 70000,
  tributeDwellMaxMs: 35000,
  remembranceMaxChars: 300,
  families: [...ALL_FAMILIES],
  joinUrl: process.env.PUBLIC_JOIN_URL ?? "/join",
  appName: "AFTERLIFE",
};

/** v1 keys still stored in old party.settings rows or sent by older admin UIs: ignored silently. */
const RETIRED = new Set(["questionMs", "memoryExposeMs", "memoryAnswerMs", "familyPreferMs", "familyPredictMs", "socialEvery"]);

export function settingsOf(raw: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS, ...((raw as object) ?? {}) } as Settings;
  const fams = Array.isArray(s.families) ? s.families.filter((f) => ALL_FAMILIES.includes(f)) : [];
  s.families = fams.length ? fams : [...ALL_FAMILIES];
  return s;
}

const NUMERIC = Object.keys(DEFAULT_SETTINGS).filter((k) => typeof (DEFAULT_SETTINGS as any)[k] === "number");

/** Validates an admin patch; throws on unknown keys or out-of-range values. */
export function validateSettingsPatch(patch: Record<string, unknown>): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (RETIRED.has(k)) continue;
    if (NUMERIC.includes(k)) {
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 24 * 3600_000) throw new Error(`bad setting ${k}`);
      out[k] = Math.round(v);
    } else if (k === "families") {
      if (!Array.isArray(v) || !v.every((f) => ALL_FAMILIES.includes(f))) throw new Error("bad families");
      out[k] = v;
    } else if (k === "joinUrl" || k === "appName") {
      if (typeof v !== "string" || v.length > 300) throw new Error(`bad ${k}`);
      out[k] = v;
    } else throw new Error(`unknown setting ${k}`);
  }
  return out as Partial<Settings>;
}
