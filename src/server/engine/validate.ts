import type { AnswerValue, InputSpec } from "@/shared/types";
import { EngineError } from "./types";

const bad = (msg = "invalid answer") => new EngineError("invalid", msg, 400);

export function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Strict value validation against the stage's InputSpec. Returns the normalized value to store.
 * Throws EngineError("invalid").
 */
export function validateValue(spec: InputSpec, v: unknown): AnswerValue {
  switch (spec.kind) {
    case "choice":
      if (!Number.isInteger(v) || (v as number) < 0 || (v as number) >= spec.options.length) throw bad("invalid choice");
      return v as number;
    case "order": {
      const ids = spec.items.map((i) => i.id);
      if (!Array.isArray(v) || v.length !== ids.length || !v.every((x) => typeof x === "string")) throw bad("invalid order");
      if (new Set(v).size !== v.length || !v.every((x) => ids.includes(x))) throw bad("invalid order");
      return v as string[];
    }
    case "number": {
      if (typeof v !== "number" || !Number.isFinite(v) || v < spec.min || v > spec.max) throw bad("number out of range");
      const k = (v - spec.min) / (spec.step || 1);
      if (spec.step > 0 && Math.abs(k - Math.round(k)) > 1e-6) throw bad("number not on step");
      return v;
    }
    case "percent":
      if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 100) throw bad("percent must be 0-100");
      return v as number;
    case "text": {
      if (typeof v !== "string") throw bad("text required");
      if (v.length > spec.maxLength * 4) throw bad("too long");
      const t = cleanText(v, 10_000);
      if (!t) throw bad("text required");
      if ([...t].length > spec.maxLength) throw bad("too long");
      return t;
    }
    case "vote":
      if (typeof v !== "string" || !spec.entries.some((e) => e.id === v)) throw bad("invalid vote");
      return v;
    case "assign": {
      if (!v || typeof v !== "object" || Array.isArray(v)) throw bad("invalid assignment");
      const o = v as Record<string, unknown>;
      const people = spec.people.map((p) => p.id);
      const slots = spec.slots.map((s) => s.id);
      const keys = Object.keys(o);
      if (keys.length !== people.length || !people.every((p) => keys.includes(p))) throw bad("assign every ancestor");
      const vals = keys.map((k) => o[k]);
      if (!vals.every((x) => typeof x === "string" && slots.includes(x)) || new Set(vals).size !== vals.length) throw bad("each altar once");
      const out: Record<string, string> = {};
      for (const p of people) out[p] = o[p] as string;
      return out;
    }
  }
  throw bad();
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const ka = Object.keys(a as object).sort(), kb = Object.keys(b as object).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && (a as any)[k] === (b as any)[k]);
  }
  return JSON.stringify(a) === JSON.stringify(b);
}
