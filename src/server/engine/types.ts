import type { GameFamily, PartyId, PublicQuestion, PublicTribute, QuestionOption, RevealInfo, SceneSpec, Stage } from "@/shared/types";
import type { Q } from "@/server/db";

/** Mirror of the content contract in docs/CONTRACTS.md (src/content/index.ts). */
export interface ContentItem {
  id: string;
  version: number;
  family: GameFamily;
  difficulty: 1 | 2 | 3;
  enabled: boolean;
  prompt: string;
  promptEs?: string;
  options: QuestionOption[];
  answer: number | null;
  explanation: string;
  source?: { title: string; url: string; verification: string };
  scene?: SceneSpec;
  readingSeconds: number;
}

export interface ContentSource {
  allContent(): ContentItem[];
  publicQuestion(item: ContentItem, ctx: { stage: Stage; elapsedMs: number; audience: "tv" | "phone"; index?: number }): PublicQuestion;
  /** Optional: answer-free record stored in question.public (src/content provides it). */
  toPublicRecord?(item: ContentItem): object;
  /** Optional: ms offsets within a reveal-family answer stage at which the public payload changes. */
  revealStageMs?: readonly number[];
  revealInfo(item: ContentItem): RevealInfo;
  generateFresh(family: GameFamily, seed: string): ContentItem | null;
}

export interface TributeSource {
  nextTribute(q: Q, partyId: string, now: number): Promise<PublicTribute | null>;
  isTributeVisible(q: Q, partyId: string, tributeId: string): Promise<boolean>;
}

export interface Settings {
  introMs: number;
  questionMs: number;
  memoryExposeMs: number;
  memoryAnswerMs: number;
  familyPreferMs: number;
  familyPredictMs: number;
  revealMs: number;
  resultsMs: number;
  intervalMs: number;
  minViewMs: number;
  catchUpGraceMs: number;
  socialEvery: number;
  tributeDwellMinMs: number;
  tributeDwellMaxMs: number;
  remembranceMaxChars: number;
  /** families allowed to be scheduled (admin can disable some) */
  families: GameFamily[];
  joinUrl: string;
  appName: string;
}

/** Stored in party.phase (jsonb). Superset of PublicPhase with internal fields. */
export interface PhaseState {
  kind: "ambient" | "intro" | "question" | "reveal" | "results" | "interval";
  startsAt: number;
  endsAt: number | null;
  setId?: string;
  setSeq?: number;
  family?: GameFamily;
  qIndex?: number;
  stage?: Stage;
  stageStartsAt?: number;
  questionId?: string;
  tribute?: PublicTribute | null;
  tributeUntil?: number;
  /** reveal family: index of the progressive-reveal step last published (version bumps on change) */
  revealStep?: number;
}

/** Stored in party.engine (jsonb). */
export interface EngineState {
  lastFamily?: GameFamily | null;
  objectiveSinceSocial?: number;
  forceObjective?: boolean;
  pausedRemainingMs?: number | null;
  pausedAt?: number | null;
  encore?: boolean;
}

export interface PartyRow {
  id: PartyId;
  status: "idle" | "running" | "paused" | "ended";
  mode: "normal" | "tribute_only";
  settings: Partial<Settings>;
  phase: PhaseState;
  version: number;
  set_seq: number;
  rng_seed: string;
  engine: EngineState;
}

/** Error thrown by engine actions; routes map it to {error, code} + status. */
export class EngineError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}
