import type { AnswerValue, GameFamily, PartyId, PublicQuestion, PublicTribute, PublicSlide, RevealInfo, Stage } from "@/shared/types";
import type { Q } from "@/server/db";

/** Mirror of the v2 content contract (docs/GAMES-V2.md "Shared module interfaces"). */
export interface ContentItem {
  id: string;
  version: number;
  family: GameFamily;
  difficulty: 1 | 2 | 3;
  enabled: boolean;
  prompt: string;
  promptEs?: string;
  detail?: string;
  readingSeconds: number;
  /** family-specific, may include secrets (never sent raw to clients) */
  data: Record<string, unknown>;
  /** secret */
  answer: AnswerValue | null;
  explanation: string;
  source?: { title: string; url: string; verification: string };
}

export interface ContentSource {
  allContent(): ContentItem[];
  /** Must never include secrets. `round` = case clue round (0..2); `index` = question index in set. */
  publicQuestion(item: ContentItem, ctx: { stage: Stage; round: number; index: number }): PublicQuestion;
  revealInfo(item: ContentItem): Omit<RevealInfo, "outcomes">;
  generateFresh(family: GameFamily, seed: string): ContentItem | null;
  /** three clue-round items for one Ofrenda Case puzzle */
  caseSet(seed: string): ContentItem[];
}

export interface TributeSource {
  nextTribute(q: Q, partyId: string, now: number): Promise<PublicTribute | null>;
  isTributeVisible(q: Q, partyId: string, tributeId: string): Promise<boolean>;
}

export interface Settings {
  introMs: number;
  calaveraWriteMs: number;
  calaveraVoteMs: number;
  lineAnswerMs: number;
  loteriaAnswerMs: number;
  roomAnswerMs: number;
  roomGuessMs: number;
  closestAnswerMs: number;
  caseClueMs: number;
  caseAnswerMs: number;
  revealMs: number;
  calaveraRevealMs: number;
  resultsMs: number;
  intervalMs: number;
  minViewMs: number;
  catchUpGraceMs: number;
  tributeDwellMinMs: number;
  intervalTributeMs: number; // first part of each break is for tributes; the rest shows party photos
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
  doubled?: boolean;
  tribute?: PublicTribute | null;
  tributeUntil?: number;
  slide?: PublicSlide | null;
  slideUntil?: number;
}

/** Stored in party.engine (jsonb). */
export interface EngineState {
  lastFamily?: GameFamily | null;
  /** family of the last question before the current set (mixed-set swap avoids repeating it) */
  lastBeforeSet?: GameFamily | null;
  /** families played so far (rotation fairness) */
  played?: Partial<Record<GameFamily, number>>;
  forceObjective?: boolean;
  /** host "final_round": next set is doubled (one-shot) */
  doubleNext?: boolean;
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

/** Calavera vote entry as stored in question.private (authors never leave the server before reveal). */
export interface VoteEntry {
  id: string; // opaque, public
  text: string;
  answerId: string | null; // null = house filler
  teamId: string | null;
  house: boolean;
}

/** Per-team outcome stored in question.private.outcomes (names joined at snapshot time). */
export interface StoredOutcome {
  teamId: string;
  points: number;
  value?: AnswerValue | null;
  note?: string;
}

/** Error thrown by engine actions; routes map it to {error, code} + status. */
export class EngineError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}
