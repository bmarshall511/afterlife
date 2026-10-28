import type { Settings } from "./types";
import { OBJECTIVE_FAMILIES } from "@/shared/types";

export const DEFAULT_SETTINGS: Settings = {
  introMs: 15000,
  questionMs: 35000,
  memoryExposeMs: 10000,
  memoryAnswerMs: 25000,
  familyPreferMs: 15000,
  familyPredictMs: 20000,
  revealMs: 10000,
  resultsMs: 30000,
  intervalMs: 120000,
  minViewMs: 4000,
  catchUpGraceMs: 45000,
  socialEvery: 5,
  tributeDwellMinMs: 20000,
  tributeDwellMaxMs: 35000,
  remembranceMaxChars: 300,
  families: [...OBJECTIVE_FAMILIES, "family"],
  joinUrl: process.env.PUBLIC_JOIN_URL ?? "/join",
  appName: "AFTERLIFE",
};

export function settingsOf(raw: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS, ...((raw as object) ?? {}) } as Settings;
  return s;
}

const NUMERIC = Object.keys(DEFAULT_SETTINGS).filter((k) => typeof (DEFAULT_SETTINGS as any)[k] === "number");

/** Validates an admin patch; throws on unknown keys or out-of-range values. */
export function validateSettingsPatch(patch: Record<string, unknown>): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (NUMERIC.includes(k)) {
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 24 * 3600_000) throw new Error(`bad setting ${k}`);
      out[k] = Math.round(v);
    } else if (k === "families") {
      if (!Array.isArray(v) || !v.every((f) => typeof f === "string")) throw new Error("bad families");
      out[k] = v;
    } else if (k === "joinUrl" || k === "appName") {
      if (typeof v !== "string" || v.length > 300) throw new Error(`bad ${k}`);
      out[k] = v;
    } else throw new Error(`unknown setting ${k}`);
  }
  return out as Partial<Settings>;
}
