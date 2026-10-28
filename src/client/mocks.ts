/**
 * DEV-ONLY fixtures for `/tv?mock=<state>` and `/play?mock=<state>`.
 * mockEnabled() is false in production builds, so fixtures are never served to guests.
 */
import { generateFresh, publicQuestion, revealInfo } from "@/content";
import type { GameFamily, MeView, PublicQuestion, RevealInfo, Snapshot, StandingRow, PublicTribute, Stage } from "@/shared/types";


export const MOCK_STATES = [
  "ambient", "ambient-empty", "intro", "intro-family",
  "q-memory-expose", "q-memory", "q-truth", "q-difference", "q-reveal", "q-altar", "q-family-prefer", "q-family-predict",
  "reveal", "reveal-truth", "reveal-diff", "reveal-reveal", "reveal-family", "results", "interval", "interval-tribute", "interval-tribute-wide", "paused", "offline",
  // phone-specific variants
  "q-truth-saved", "q-truth-noncaptain", "q-truth-late", "reveal-wrong", "practice", "away", "longnames",
] as const;

const standings: StandingRow[] = [
  { teamId: "t1", name: "Los Marshall", color: "#F5A524", avatar: "marigold", total: 2450, setsCounted: 5, qualified: true, rank: 1 },
  { teamId: "t2", name: "Las Flores", color: "#C86BFA", avatar: "candle", total: 2450, setsCounted: 5, qualified: true, rank: 1 },
  { teamId: "t3", name: "Tía Carmen's Table", color: "#FF5DA2", avatar: "calavera", total: 2180, setsCounted: 5, qualified: true, rank: 3 },
  { teamId: "t4", name: "The Riveras", color: "#5EC8E5", avatar: "butterfly", total: 1700, setsCounted: 3, qualified: false, rank: null },
  { teamId: "t5", name: "Primos", color: "#8BE07A", avatar: "xolo", total: 900, setsCounted: 2, qualified: false, rank: null },
];
const teams = standings.map((s) => ({ id: s.teamId, name: s.name, color: s.color, avatar: s.avatar, status: "active" as const }));

const tribute: PublicTribute = {
  id: "tr1", personName: "Roberto Rivera",
  remembrance: "He made every Sunday feel like a celebration. We miss his stories and his laugh.",
  attribution: "Shared by the Rivera family", photoUrl: "/art/arrival-amber-960.webp",
  width: 800, height: 1000, fit: "cover", focalX: 0.5, focalY: 0.35, dwellMs: 25000,
};

const Q: Record<string, PublicQuestion> = {
  memory: { id: "q-mem", family: "memory", index: 0, prompt: "How many candles were on the altar?", promptEs: "La Memoria",
    options: [{ label: "A", text: "Three" }, { label: "B", text: "Five" }, { label: "C", text: "Seven" }, { label: "D", text: "Nine" }],
    scene: { template: "ofrenda", seed: "m1", data: { candles: 5, marigolds: 12, photos: 2 } } },
  truth: { id: "q-truth", family: "truth", index: 1, prompt: "Marigolds (cempasúchil) are said to guide spirits home with their bright color and scent.", promptEs: "¿Verdad o inventado?",
    options: [{ label: "True", text: "True", icon: "check" }, { label: "Invented", text: "Invented", icon: "x" }] },
  difference: { id: "q-diff", family: "difference", index: 0, prompt: "Which region changed?", promptEs: "Las Diferencias",
    options: [{ label: "A", text: "Top left" }, { label: "B", text: "Top right" }, { label: "C", text: "Bottom left" }, { label: "D", text: "Bottom right" }],
    scene: { template: "difference", seed: "d1", data: {}, variant: {} } },
  reveal: { id: "q-rev", family: "reveal", index: 1, prompt: "What is slowly appearing?", promptEs: "La Revelación",
    options: [{ label: "A", text: "Pan de muerto" }, { label: "B", text: "Papel picado" }, { label: "C", text: "A sugar skull" }, { label: "D", text: "A monarch butterfly" }],
    scene: { template: "reveal", seed: "r1", data: {} } },
  altar: { id: "q-alt", family: "altar", index: 2, prompt: "Which offering is traditionally placed for a thirsty soul after the long journey?", promptEs: "El Altar",
    options: [{ label: "A", text: "Water" }, { label: "B", text: "Salt" }, { label: "C", text: "Copal" }, { label: "D", text: "Bread" }],
    scene: { template: "altar", seed: "a1", data: {} } },
  family: { id: "q-fam", family: "family", index: 0, prompt: "Best part of pan de muerto?", promptEs: "La Familia",
    options: [{ label: "A", text: "The sugar on top" }, { label: "B", text: "The bone shapes" }, { label: "C", text: "Orange blossom smell" }, { label: "D", text: "Dunking it in chocolate" }] },
};

const reveals: Record<string, RevealInfo> = {
  memory: { correct: 1, explanation: "Five candles burned on the ofrenda — one for each name on the photos.", source: { title: "Scene generated for AFTERLIFE", url: "" } },
  truth: { correct: 0, explanation: "Cempasúchil's color and scent are traditionally believed to lead the souls back to their families' altars.", source: { title: "Smithsonian — Day of the Dead traditions", url: "https://example.org" } },
  family: { correct: [3], explanation: "Most families went for chocolate. Sweet choice.", tallies: { prefer: [2, 0, 1, 3], predict: [1, 0, 1, 4] } },
};

function base(now: number): Snapshot {
  return {
    party: "demo", version: 1, serverNow: now, status: "running", mode: "normal", backdrop: "amber",
    phase: { kind: "ambient", startsAt: now - 1000, endsAt: null },
    question: null, reveal: null, answeredCount: 0, eligibleCount: 6, standings, lastSet: null, teams,
    joinUrl: "https://afterlife.example/join", appName: "AFTERLIFE",
  };
}

/** Real generated content (dev only) so SceneView renders actual templates. */
function gen(fam: GameFamily, stage: Stage, elapsedMs = 14_000) {
  const item = generateFresh(fam, "mock-" + fam);
  if (!item) return null;
  return { q: publicQuestion(item, { stage, elapsedMs, audience: "tv", index: Q[fam].index }), r: revealInfo(item) };
}

function questionSnap(now: number, fam: GameFamily, stage: Stage, endsIn = 18_400): Snapshot {
  const s = base(now);
  const g = gen(fam, stage);
  const q = g ? { ...g.q, promptEs: Q[fam].promptEs } : { ...Q[fam] };
  return { ...s, backdrop: "violet", question: q, answeredCount: 4,
    phase: { kind: "question", startsAt: now - 10_000, endsAt: now + endsIn, setId: "s7", setSeq: 7, family: fam, qIndex: q.index, stage } };
}

export function mockSnapshot(name: string): Snapshot {
  const now = Date.now();
  const s = base(now);
  switch (name) {
    case "ambient-empty": return { ...s, standings: [], teams: [] };
    case "intro": return { ...s, phase: { kind: "intro", startsAt: now - 3000, endsAt: now + 12_000, setId: "s7", setSeq: 7, family: "memory" } };
    case "intro-family": return { ...s, phase: { kind: "intro", startsAt: now - 3000, endsAt: now + 12_000, setId: "s7", setSeq: 7, family: "family" } };
    case "q-memory-expose": return questionSnap(now, "memory", "expose", 7_000);
    case "q-memory": return questionSnap(now, "memory", "answer");
    case "q-truth": case "q-truth-saved": case "q-truth-noncaptain": case "q-truth-late": case "practice": case "longnames": {
      const q = questionSnap(now, "truth", "answer");
      if (name === "longnames") {
        const long = standings.map((r, i) => i === 0 ? { ...r, name: "The Extremely Long Family Name Of Great-Grandma Esperanza" } : r);
        return { ...q, standings: long, question: { ...q.question!, prompt: "During Día de los Muertos in Oaxaca, families sometimes spend the whole night in the cemetery decorating graves with marigolds, candles, and the favorite foods of those they remember." } };
      }
      return q;
    }
    case "q-difference": return questionSnap(now, "difference", "answer");
    case "q-reveal": return questionSnap(now, "reveal", "answer");
    case "q-altar": return questionSnap(now, "altar", "answer");
    case "q-family-prefer": return questionSnap(now, "family", "prefer", 9_000);
    case "q-family-predict": return questionSnap(now, "family", "predict");
    case "reveal": case "reveal-wrong": { const q = questionSnap(now, "memory", "answer");
      return { ...q, reveal: gen("memory", "answer")?.r ?? reveals.memory, phase: { ...q.phase, kind: "reveal", stage: undefined, endsAt: now + 8000 } }; }
    case "reveal-truth": { const q = questionSnap(now, "truth", "answer");
      return { ...q, reveal: reveals.truth, phase: { ...q.phase, kind: "reveal", stage: undefined, endsAt: now + 8000 } }; }
    case "reveal-diff": { const q = questionSnap(now, "difference", "answer");
      return { ...q, reveal: gen("difference", "answer")!.r, phase: { ...q.phase, kind: "reveal", stage: undefined, endsAt: now + 8000 } }; }
    case "reveal-reveal": { const q = questionSnap(now, "reveal", "answer");
      return { ...q, reveal: gen("reveal", "answer")!.r, phase: { ...q.phase, kind: "reveal", stage: undefined, endsAt: now + 8000 } }; }
    case "reveal-family": { const q = questionSnap(now, "family", "predict");
      return { ...q, reveal: reveals.family, phase: { ...q.phase, kind: "reveal", stage: undefined, endsAt: now + 8000 } }; }
    case "results": return { ...s, backdrop: "magenta", phase: { kind: "results", startsAt: now - 2000, endsAt: now + 26_000, setId: "s7", setSeq: 7, family: "memory" },
      lastSet: { setId: "s7", family: "memory", winners: ["t1", "t2"], scores: [
        { teamId: "t1", name: "Los Marshall", score: 300, ranked: true, perfect: true },
        { teamId: "t2", name: "Las Flores", score: 300, ranked: true, perfect: true },
        { teamId: "t3", name: "Tía Carmen's Table", score: 200, ranked: true, perfect: false },
        { teamId: "t4", name: "The Riveras", score: 100, ranked: true, perfect: false },
        { teamId: "t5", name: "Primos", score: 100, ranked: false, perfect: false } ] } };
    case "interval": return { ...s, phase: { kind: "interval", startsAt: now - 5000, endsAt: now + 95_000, tribute: null } };
    case "interval-tribute": return { ...s, phase: { kind: "interval", startsAt: now - 5000, endsAt: now + 95_000, tribute } };
    case "interval-tribute-wide": return { ...s, phase: { kind: "interval", startsAt: now - 5000, endsAt: now + 95_000,
      tribute: { ...tribute, id: "tr2", personName: "Abuela María Guadalupe Hernández de la Cruz", photoUrl: "/art/celebration-magenta-960.webp", width: 1672, height: 941, fit: "contain",
        remembrance: "She taught three generations to make tamales, never measured anything, and always saved the last dance for whoever needed it most. Her kitchen was the warmest room in every house she ever lived in, and her laugh carried down the whole street.", attribution: "Shared by her grandchildren" } } };
    case "paused": return { ...questionSnap(now, "truth", "answer"), status: "paused", phase: { ...questionSnap(now, "truth", "answer").phase, endsAt: null } };
    case "away": return { ...s, phase: { kind: "intro", startsAt: now - 3000, endsAt: now + 12_000, setId: "s7", setSeq: 7, family: "truth" } };
    case "offline": return questionSnap(now, "truth", "answer");
    default: return s;
  }
}

export function mockMe(name: string): MeView {
  const captain = name !== "q-truth-noncaptain";
  const fam = name.startsWith("q-") ? name.replace(/^q-/, "").split("-")[0] : null;
  const stage: Stage | null = name === "q-memory-expose" ? "expose" : name === "q-family-prefer" ? "prefer" : name === "q-family-predict" ? "predict" : fam ? "answer" : null;
  const saved = name === "q-truth-saved" ? { kind: "answer" as const, choice: 0 } : null;
  return {
    member: { id: "m1", name: "Ben", isCaptain: captain },
    team: { ...teams[0], name: name === "longnames" ? "The Extremely Long Family Name Of Great-Grandma Esperanza" : teams[0].name,
      status: name === "away" ? "away" : "active", inviteCode: "MARI-7Q", captainName: captain ? "Ben" : "Lucía", memberCount: 3 },
    current: {
      questionId: fam ? "q-" + fam : null, stage, saved, savedPrefer: name === "q-family-predict" ? 3 : null,
      canSubmit: captain && stage !== "expose" && name !== "q-truth-late" && !saved,
      reasonCannot: !captain ? "not_captain" : name === "q-truth-late" ? "late_join" : stage === "expose" ? "watching" : undefined,
      ranked: name !== "practice",
      result: name.startsWith("reveal") ? (name === "reveal-wrong" ? { correct: false, points: 0 } : { correct: true, points: 100 }) : null,
    },
    history: [
      { setId: "s1", seq: 1, family: "truth", score: 300, ranked: true, counted: true, normalized: false, invalidated: false },
      { setId: "s2", seq: 2, family: "memory", score: 100, ranked: true, counted: false, normalized: false, invalidated: false },
      { setId: "s3", seq: 3, family: "family", score: 250, ranked: true, counted: true, normalized: true, invalidated: false },
      { setId: "s4", seq: 4, family: "altar", score: 200, ranked: true, counted: true, normalized: false, invalidated: false },
      { setId: "s5", seq: 5, family: "difference", score: 0, ranked: false, counted: false, normalized: false, invalidated: true },
      { setId: "s6", seq: 6, family: "reveal", score: 200, ranked: true, counted: true, normalized: false, invalidated: false },
    ],
    total: 1150, setsCounted: 4,
  };
}
