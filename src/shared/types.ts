/**
 * SHARED CONTRACT — imported by server and client. Changes require orchestrator approval.
 * See docs/CONTRACTS.md for semantics.
 */

export type PartyId = "live" | "demo";

export type GameFamily = "memory" | "truth" | "difference" | "reveal" | "altar" | "family";
export const OBJECTIVE_FAMILIES: GameFamily[] = ["memory", "truth", "difference", "reveal", "altar"];

export type BackdropState = "amber" | "violet" | "magenta";

/** Phase kinds of the autonomous cycle. */
export type PhaseKind =
  | "ambient"   // no active teams / not started / ended: arrival art, QR, standings, tributes may rotate
  | "intro"     // set introduction (15s)
  | "question"  // a question is live; `stage` says which sub-stage
  | "reveal"    // correct answer + explanation (10s)
  | "results"   // set results (30s)
  | "interval"; // social / tribute interval (120s)

/**
 * Question sub-stages.
 *  memory:  expose (scene visible, no answering) -> answer
 *  family:  prefer (personal choice) -> predict (guess most popular)
 *  others:  answer
 */
export type Stage = "expose" | "answer" | "prefer" | "predict";

export interface PublicPhase {
  kind: PhaseKind;
  startsAt: number;        // epoch ms (server clock)
  endsAt: number | null;   // epoch ms; null = open-ended (ambient, paused)
  setId?: string;
  setSeq?: number;
  family?: GameFamily;
  qIndex?: number;         // 0..2
  stage?: Stage;
  tribute?: PublicTribute | null; // interval/ambient: tribute currently on TV
  encore?: boolean;        // content pool exhausted; repeating questions
}

/** Public question payload: everything clients may see before reveal. NEVER contains the answer. */
export interface PublicQuestion {
  id: string;
  family: GameFamily;
  index: number;            // 0..2
  prompt: string;           // English prompt
  promptEs?: string;        // optional Spanish heading
  options: QuestionOption[]; // 2 (truth) or 4
  /** Visual payload for TV rendering. Absent on phones during memory 'answer' stage. */
  scene?: SceneSpec | null;
  /** reveal family: which stage (0..2) of progressive reveal is visible, derived from time on client */
  readingSeconds?: number;
}

export interface QuestionOption {
  label: string;           // "A" | "B" | ... or "True"/"Invented"
  text: string;
  icon?: string;           // optional icon id rendered by SceneView/OptionIcon
}

/** Opaque deterministic scene description rendered by src/games/scenes/SceneView. */
export interface SceneSpec {
  template: string;        // renderer id
  seed: string;
  data: Record<string, unknown>;
  /** for difference: render second (changed) variant data */
  variant?: Record<string, unknown>;
}

/** Revealed after the question closes. */
export interface RevealInfo {
  correct: number | number[] | null; // option index(es); null for void
  explanation: string;
  source?: { title: string; url: string } | null;
  /** difference: region that changed; reveal: unblurred scene; family: tallies */
  highlight?: Record<string, unknown> | null;
  tallies?: { prefer: number[]; predict: number[] } | null;
  void?: boolean;
  voidReason?: string;
}

export interface PublicTribute {
  id: string;
  personName: string;
  remembrance: string;
  attribution: string;
  photoUrl: string;       // scoped URL served by /api/tributes/photo/[id]
  width: number;
  height: number;
  fit: "contain" | "cover";
  focalX: number;
  focalY: number;
  dwellMs: number;
}

export interface TeamSummary {
  id: string;
  name: string;
  color: string;
  avatar: string;
  status: "active" | "away";
}

export interface StandingRow {
  teamId: string;
  name: string;
  color: string;
  avatar: string;
  total: number;            // sum of best five eligible set scores
  setsCounted: number;      // min(5, eligible sets)
  qualified: boolean;       // >= 5 eligible sets
  rank: number | null;      // competition rank among qualified; null for provisional
}

export interface SetResult {
  setId: string;
  family: GameFamily;
  scores: { teamId: string; name: string; score: number; ranked: boolean; perfect: boolean }[];
  winners: string[];        // team ids sharing top score
}

/** GET /api/state response — shared snapshot for TV and phones. */
export interface Snapshot {
  party: PartyId;
  version: number;
  serverNow: number;
  status: "idle" | "running" | "paused" | "ended";
  mode: "normal" | "tribute_only";
  backdrop: BackdropState;
  phase: PublicPhase;
  question: PublicQuestion | null;
  reveal: RevealInfo | null;     // present only in reveal phase (and results for last q)
  answeredCount: number;         // teams that locked an answer in this stage (no identities)
  eligibleCount: number;
  standings: StandingRow[];
  lastSet: SetResult | null;     // during results phase
  teams: TeamSummary[];
  joinUrl: string;               // public QR target
  appName: string;
}

/** GET /api/me — controller-specific view for an authenticated member. */
export interface MeView {
  member: { id: string; name: string; isCaptain: boolean };
  team: TeamSummary & { inviteCode: string; captainName: string | null; memberCount: number };
  /** this team's participation in the current question stage */
  current: {
    questionId: string | null;
    stage: Stage | null;
    canSubmit: boolean;
    reasonCannot?: "not_captain" | "late_join" | "away" | "closed" | "watching" | "need_preference";
    saved: { kind: "answer" | "prefer" | "predict"; choice: number } | null;
    savedPrefer: number | null;
    ranked: boolean;        // false => practice set label
    result?: { correct: boolean; points: number } | null; // after reveal
  };
  history: { setId: string; seq: number; family: GameFamily; score: number; ranked: boolean; counted: boolean; normalized: boolean; invalidated: boolean }[];
  total: number;
  setsCounted: number;
}

export type ApiError = { error: string; code: string };
