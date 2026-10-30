/**
 * SHARED CONTRACT — imported by server and client. Changes require orchestrator approval.
 * See docs/CONTRACTS.md for semantics.
 */

export type PartyId = "live" | "demo";

/** v2 lineup (2026-10-27). Old v1 families are retired. */
export type GameFamily = "calavera" | "line" | "loteria" | "room" | "closest" | "case" | "dichos" | "fib" | "price";
/** Playable with any number of teams. */
export const OBJECTIVE_FAMILIES: GameFamily[] = ["line", "loteria", "closest", "case", "dichos", "price"];
/** Need >= 3 eligible teams (votes / room percentages / written entries). */
export const SOCIAL_FAMILIES: GameFamily[] = ["calavera", "room", "fib"];

/** Content rating. "after-dark" items only play when the host switches on After Dark (settings.afterDark). */
export type ContentRating = "classic" | "spicy" | "after-dark";

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
 * Question sub-stages (see docs/GAMES-V2.md):
 *  calavera: write -> vote          line/loteria/closest: answer
 *  room:     answer -> guess        case: clue (read-only) -> answer
 */
export type Stage = "write" | "vote" | "answer" | "guess" | "clue";

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
  setFamilies?: GameFamily[]; // the current set's 3 question families in order (intro/question/reveal/results)
  doubled?: boolean;       // host-triggered "last chance" set: points x2
  slide?: PublicSlide | null; // interval/ambient: party album photo on TV (never at the same time as a tribute)
}

/** Public question payload: everything clients may see before reveal. NEVER contains the answer. */
export interface PublicQuestion {
  id: string;
  family: GameFamily;
  index: number;              // 0..2
  difficulty: 1 | 2 | 3;      // sets ramp easy -> hard
  prompt: string;             // English prompt (large on TV)
  promptEs?: string;          // optional Spanish heading
  detail?: string;            // secondary text (case clue list, line axis "earliest -> latest", units)
  input: InputSpec | null;    // what the phone collects in the current stage; null = watch the TV
  scene?: SceneSpec | null;   // optional TV visual (lotería cards, case altars)
  readingSeconds?: number;
}

/** What a captain submits in the current stage. `value` shape per kind is in AnswerValue. */
export type InputSpec =
  | { kind: "choice"; options: QuestionOption[]; layout?: "list" | "grid" }   // loteria (grid of cards), room answer
  | { kind: "order"; items: { id: string; text: string; icon?: string }[]; lowLabel: string; highLabel: string } // line
  | { kind: "number"; min: number; max: number; step: number; unit?: string } // closest
  | { kind: "text"; maxLength: number; placeholder: string }                  // calavera write
  | { kind: "fib"; maxLength: number; prompt: string }                        // two truths and a fib: write 3 statements, mark the fib
  | { kind: "vote"; entries: { id: string; text: string }[] }                 // calavera vote; own entry excluded per team by /api/me
  | { kind: "percent"; optionText: string; options?: QuestionOption[] }       // room guess: % of room that picked your answer (options = the answer-stage choices)
  | { kind: "assign"; people: { id: string; name: string }[]; slots: { id: string; label: string }[] }; // case

/** choice/vote -> index or entry id; order -> item ids in order; number/percent -> number; text -> string; assign -> {personId: slotId};
 *  fib -> { statements: [s1, s2, s3], fib: 0|1|2 } */
export type AnswerValue = number | string | string[] | Record<string, string> | { statements: string[]; fib: number };

export interface QuestionOption {
  label: string;           // "A".."L"
  text: string;
  icon?: string;           // card/illustration id rendered by OptionIcon
}

/** Opaque deterministic scene description rendered by src/games/scenes/SceneView. */
export interface SceneSpec {
  template: string;        // renderer id
  seed: string;
  data: Record<string, unknown>;
}

/** Revealed after the question closes. `detail` is family-specific (see docs/GAMES-V2.md). */
export interface RevealInfo {
  correct: AnswerValue | null;   // null for opinion/void
  explanation: string;
  source?: { title: string; url: string } | null;
  detail?: Record<string, unknown> | null;
  /** per-team outcome for the TV leaderboard strip (names public; no secrets) */
  outcomes?: { teamId: string; name: string; points: number; value?: AnswerValue | null; note?: string }[];
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
  /** server epoch ms when this tribute leaves the TV (for the gentle progress line) */
  until?: number;
}

/** Party album photo shown on TV during breaks. */
export interface PublicSlide {
  id: string;
  url: string;
  width: number;
  height: number;
  caption: string;
  takenBy: string;
  dwellMs: number;
}

export interface TeamSummary {
  id: string;
  name: string;
  color: string;
  avatar: string;
  status: "active" | "away";
  bot?: boolean;            // demo-only stand-in family
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
  family: GameFamily;       // mixed sets: first question's family
  mixed?: boolean;          // game_set.family = 'mixed'
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
    reasonCannot?: "not_captain" | "late_join" | "away" | "closed" | "watching" | "need_answer" | "already_locked";
    saved: { stage: Stage; value: AnswerValue } | null;
    /** team's earlier-stage answer this question (room answer during guess; case lock from an earlier clue round) */
    prior: { stage: Stage; value: AnswerValue } | null;
    /** calavera vote: this team's own entry id (phone hides it) */
    ownEntryId?: string | null;
    ranked: boolean;        // false => practice set label
    result?: { points: number; max: number; note?: string } | null; // after reveal
  };
  history: { setId: string; seq: number; family: GameFamily; score: number; max: number; ranked: boolean; counted: boolean; doubled: boolean; invalidated: boolean }[];
  total: number;
  setsCounted: number;
  /** Private party album link (path), or null when the album is not open. Only given to joined guests. */
  albumUrl?: string | null;
  /** Everything the in-app Party photos sheet needs (same secret as albumUrl; joined guests only). */
  album?: { token: string; mode: "blob" | "local"; maxCaption: number } | null;
  /** Tribute upload capability for the in-app "Remember someone" sheet (joined guests only; same secret as the invite link). */
  remember?: { token: string } | null;
}

export type ApiError = { error: string; code: string };
