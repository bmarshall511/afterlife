import type { GameFamily } from "@/shared/types";
import type { Settings } from "./types";

export const ALL_FAMILIES: GameFamily[] = ["calavera", "line", "loteria", "room", "closest", "case"];

/**
 * Casual-party pacing (host feedback 2026-10-27): long answer windows so nobody has to watch the TV,
 * but every step closes early (after minViewMs) as soon as all eligible families have submitted.
 */
export const DEFAULT_SETTINGS: Settings = {
  introMs: 60000,
  calaveraWriteMs: 360000,
  calaveraVoteMs: 180000,
  lineAnswerMs: 300000,
  loteriaAnswerMs: 240000,
  roomAnswerMs: 180000,
  roomGuessMs: 180000,
  closestAnswerMs: 240000,
  caseClueMs: 20000,
  caseAnswerMs: 40000,
  revealMs: 60000,
  calaveraRevealMs: 75000,
  resultsMs: 120000,
  intervalMs: 600000,
  minViewMs: 10000,
  catchUpGraceMs: 120000,
  tributeDwellMinMs: 45000,
  intervalTributeMs: 300000,
  tributeDwellMaxMs: 75000,
  remembranceMaxChars: 300,
  // The Ofrenda Case is off by default (host feedback: too involved for a casual party). Re-enable in Admin → Content.
  families: ALL_FAMILIES.filter((f) => f !== "case"),
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
