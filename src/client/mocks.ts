/**
 * DEV-ONLY fixtures for `/tv?mock=<state>` and `/play?mock=<state>`.
 * Hand-written (no dependency on the content module) so every family/stage renders even while content changes.
 * Reveal `detail` shapes used here are the ones the UI reads — see src/app/tv/families.tsx header.
 */
import type { AnswerValue, GameFamily, InputSpec, MeView, PublicQuestion, RevealInfo, Snapshot, Stage, StandingRow, PublicTribute } from "@/shared/types";

export const MOCK_STATES = [
  "ambient", "ambient-empty", "intro", "intro-doubled",
  "q-calavera-write", "q-calavera-write-saved", "q-calavera-filtered", "q-calavera-vote", "q-calavera-vote-saved", "reveal-calavera",
  "q-line", "q-line-saved", "q-line-doubled", "reveal-line",
  "q-loteria", "q-loteria-9", "q-loteria-late", "reveal-loteria", "reveal-loteria-wrong",
  "q-room-answer", "q-room-guess", "q-room-guess-noanswer", "reveal-room",
  "q-closest", "q-closest-noncaptain", "reveal-closest",
  "q-case-clue", "q-case-answer", "q-case-locked", "reveal-case-mid", "reveal-case-final",
  "results", "results-doubled", "interval", "interval-slide", "interval-slide-portrait", "interval-tribute", "interval-tribute-wide", "paused", "offline", "practice", "away", "longnames",
] as const;

const standings: StandingRow[] = [
  { teamId: "t1", name: "Los Marshall", color: "#F5A524", avatar: "marigold", total: 1450, setsCounted: 5, qualified: true, rank: 1 },
  { teamId: "t2", name: "Las Flores", color: "#C86BFA", avatar: "candle", total: 1450, setsCounted: 5, qualified: true, rank: 1 },
  { teamId: "t3", name: "Tía Carmen's Table", color: "#FF5DA2", avatar: "calavera", total: 1180, setsCounted: 5, qualified: true, rank: 3 },
  { teamId: "t4", name: "The Riveras", color: "#5EC8E5", avatar: "butterfly", total: 700, setsCounted: 3, qualified: false, rank: null },
  { teamId: "t5", name: "Primos", color: "#8BE07A", avatar: "xolo", total: 400, setsCounted: 2, qualified: false, rank: null },
  { teamId: "t6", name: "Team Tamal", color: "#FF8A5B", avatar: "marigold", total: 350, setsCounted: 2, qualified: false, rank: null },
];
const teams = standings.map((s) => ({ id: s.teamId, name: s.name, color: s.color, avatar: s.avatar, status: "active" as const }));
const T = (i: number) => ({ teamId: standings[i].teamId, name: standings[i].name });

const tribute: PublicTribute = {
  id: "tr1", personName: "Roberto Rivera",
  remembrance: "He made every Sunday feel like a celebration. We miss his stories and his laugh.",
  attribution: "Shared by the Rivera family", photoUrl: "/art/arrival-amber-960.webp",
  width: 800, height: 1000, fit: "cover", focalX: 0.5, focalY: 0.35, dwellMs: 25000,
};

/* ------------------------------------------------------------------ inputs */
const calaveraEntries = [
  { id: "e1", text: "He took the shortcut through the cemetery. Permanently." },
  { id: "e2", text: "Said “trust me, I know a guy” — the guy was La Catrina." },
  { id: "e3", text: "His GPS said “recalculating.” Death said “no.”" },
  { id: "e4", text: "Now he’s six feet under — still twenty minutes late." },
  { id: "e5", text: "He saved four minutes and lost the rest of his life." },
];
const lineItems = [
  { id: "l1", text: "Mexican War of Independence begins" },
  { id: "l2", text: "First Día de los Muertos parade in Mexico City" },
  { id: "l3", text: "Posada draws “La Calavera Catrina”" },
  { id: "l4", text: "UNESCO lists the Day of the Dead" },
];
const lineInput: InputSpec = { kind: "order", items: [lineItems[2], lineItems[0], lineItems[3], lineItems[1]], lowLabel: "Earliest", highLabel: "Latest" };

const lotCards12 = [
  ["sol", "El Sol", "The Sun"], ["luna", "La Luna", "The Moon"], ["corazon", "El Corazón", "The Heart"], ["sirena", "La Sirena", "The Mermaid"],
  ["catrin", "El Catrín", "The Dandy"], ["dama", "La Dama", "The Lady"], ["arbol", "El Árbol", "The Tree"], ["escalera", "La Escalera", "The Ladder"],
  ["pescado", "El Pescado", "The Fish"], ["calavera", "La Calavera", "The Skull"], ["rosa", "La Rosa", "The Rose"], ["valiente", "El Valiente", "The Brave One"],
];
const letters = "ABCDEFGHIJKL";
const lotInput = (n: number): InputSpec => ({ kind: "choice", layout: "grid",
  options: lotCards12.slice(0, n).map(([icon, , en], i) => ({ label: letters[i], text: en, icon: "lot-" + icon })) });

const roomOptions = [
  { label: "A", text: "Pan de muerto" }, { label: "B", text: "A sugar skull" }, { label: "C", text: "The mezcal" }, { label: "D", text: "Tamales, obviously" },
];
const casePeople = [
  { id: "p1", name: "Tío Fermín", bio: "Ran the village bakery for forty years.", offering: "Pan dulce", icon: "off-pan" },
  { id: "p2", name: "Doña Refugio", bio: "Sang at every wedding, invited or not.", offering: "Hot chocolate", icon: "off-chocolate" },
  { id: "p3", name: "Abuelo Nacho", bio: "Never lost a game of dominoes. Allegedly.", offering: "Mezcal", icon: "off-mezcal" },
  { id: "p4", name: "Prima Lupita", bio: "Kept marigolds on every windowsill.", offering: "Marigolds", icon: "off-marigold" },
];
const caseSlots = [{ id: "s1", label: "Altar 1" }, { id: "s2", label: "Altar 2" }, { id: "s3", label: "Altar 3" }, { id: "s4", label: "Altar 4" }];
const caseClues = [
  { text: "The baker’s altar is at one end of the row.", round: 1 },
  { text: "Hot chocolate sits right next to the mezcal.", round: 1 },
  { text: "Prima Lupita is not on Altar 1.", round: 2 },
  { text: "Abuelo Nacho is somewhere left of Doña Refugio.", round: 2 },
  { text: "The marigolds are on Altar 4.", round: 3 },
];
const caseSolution: Record<string, string> = { p1: "s1", p3: "s2", p2: "s3", p4: "s4" };

/* --------------------------------------------------------------- questions */
function question(fam: GameFamily, stage: Stage, index: number, round = index + 1): PublicQuestion {
  switch (fam) {
    case "calavera": return { id: "q-cal", family: fam, index, difficulty: 2,
      prompt: "Here lies Tío Beto, who knew a shortcut for every road —\nhe swore this one would save us time, but…",
      input: stage === "write" ? { kind: "text", maxLength: 90, placeholder: "…finish the verse" } : stage === "vote" ? { kind: "vote", entries: calaveraEntries } : null };
    case "line": return { id: "q-line", family: fam, index, difficulty: 2, prompt: "Put these moments in order — earliest to latest.", input: lineInput };
    case "loteria": return { id: "q-lot", family: fam, index, difficulty: index === 0 ? 1 : 2,
      prompt: "I rise with no ladder and set with no bed;\nthe roosters all answer whatever I said.\nI’m gold in the morning and red at the end —\nwho am I, amigo, the farmer’s best friend?",
      input: lotInput(index === 0 ? 9 : 12) };
    case "room": return { id: "q-room", family: fam, index, difficulty: 1,
      prompt: "Best thing on the ofrenda to “borrow” after the party?",
      input: stage === "answer" ? { kind: "choice", options: roomOptions, layout: "list" } : { kind: "percent", optionText: "Tamales, obviously" } };
    case "closest": return { id: "q-close", family: fam, index, difficulty: 2,
      prompt: "How tall is the Pyramid of the Sun at Teotihuacan?", detail: "In meters",
      input: { kind: "number", min: 0, max: 200, step: 1, unit: "m" } };
    case "case": return { id: `q-case-${round}`, family: fam, index: round - 1, difficulty: 3,
      prompt: "Four ancestors. Four altars. Who goes where?",
      detail: caseClues.filter((c) => c.round <= round).map((c) => c.text).join("\n"),
      scene: { template: "case-board", seed: "case-7", data: { people: casePeople, slots: caseSlots, clues: caseClues.filter((c) => c.round <= round), round } },
      input: stage === "answer" ? { kind: "assign", people: casePeople.map(({ id, name }) => ({ id, name })), slots: caseSlots } : null };
  }
}

const reveals: Record<GameFamily, (round?: number) => RevealInfo> = {
  calavera: () => ({ correct: null, explanation: "The house would have said…",
    detail: {
      entries: [
        { id: "e2", text: calaveraEntries[1].text, teamName: "Las Flores", votes: 3, winner: true },
        { id: "e4", text: calaveraEntries[3].text, teamName: "Los Marshall", votes: 2 },
        { id: "e1", text: calaveraEntries[0].text, teamName: "Tía Carmen's Table", votes: 1 },
        { id: "e3", text: calaveraEntries[2].text, teamName: "The Riveras", votes: 0 },
        { id: "e5", text: calaveraEntries[4].text, teamName: "Primos", votes: 0 },
      ],
      house: ["…the road was paved with good intentions and one very large pothole.", "…we’re still waiting at the first turn."],
    },
    outcomes: [{ ...T(1), points: 85 }, { ...T(0), points: 60 }, { ...T(2), points: 35 }, { ...T(3), points: 10 }, { ...T(4), points: 10 }, { ...T(5), points: 0, note: "No entry" }] }),
  line: () => ({ correct: ["l1", "l3", "l4", "l2"], explanation: "Independence began in 1810; Posada’s skull-lady came a century later; UNESCO listed the tradition in 2008, and the big parade followed a 2015 film.",
    source: { title: "UNESCO · Indigenous festivity dedicated to the dead", url: "https://ich.unesco.org" },
    detail: { values: { l1: "1810", l3: "c. 1910", l2: "2016", l4: "2008" } },
    outcomes: [{ ...T(0), points: 100 }, { ...T(1), points: 83 }, { ...T(2), points: 67 }, { ...T(3), points: 50 }, { ...T(4), points: 33 }, { ...T(5), points: 17 }] }),
  loteria: () => ({ correct: 0, explanation: "It rises, sets, wakes the roosters and changes color — the sun.",
    detail: { card: { es: "El Sol", en: "The Sun" } },
    outcomes: [{ ...T(0), points: 100 }, { ...T(1), points: 100 }, { ...T(2), points: 0 }, { ...T(3), points: 100 }, { ...T(4), points: 0 }, { ...T(5), points: 100 }] }),
  room: () => ({ correct: null, explanation: "Tamales won the room — nobody was surprised.",
    detail: { options: roomOptions, counts: [1, 0, 2, 3], guesses: [
      { ...T(0), option: 3, guess: 45, actual: 50 }, { ...T(1), option: 2, guess: 20, actual: 33 }, { ...T(2), option: 3, guess: 70, actual: 50 },
      { ...T(3), option: 0, guess: 10, actual: 17 }, { ...T(4), option: 2, guess: 33, actual: 33 }, { ...T(5), option: 3, guess: null, actual: 50 } ] },
    outcomes: [{ ...T(4), points: 100 }, { ...T(0), points: 85 }, { ...T(3), points: 79 }, { ...T(1), points: 61 }, { ...T(2), points: 40 }, { ...T(5), points: 0, note: "No guess" }] }),
  closest: () => ({ correct: 65, explanation: "The Pyramid of the Sun stands about 65 m tall — one of the largest structures in Mesoamerica.",
    source: { title: "INAH · Zona Arqueológica de Teotihuacan", url: "https://www.inah.gob.mx" },
    detail: { unit: "m", min: 0, max: 200 },
    outcomes: [{ ...T(2), points: 100, value: 63, note: "Closest" }, { ...T(0), points: 75, value: 58 }, { ...T(1), points: 0, value: 72, note: "Over" },
      { ...T(3), points: 50, value: 48 }, { ...T(4), points: 0, value: 120, note: "Over" }, { ...T(5), points: 25, value: 35 }] }),
  case: (round = 3) => round < 3
    ? ({ correct: null, explanation: "", detail: { locked: 3, thinking: 3, round } })
    : ({ correct: caseSolution, explanation: "Only one arrangement fits every clue: Fermín at the end, the mezcal beside the chocolate, and Lupita’s marigolds on Altar 4.",
      detail: { final: true, people: casePeople, slots: caseSlots, round },
      outcomes: [{ ...T(1), points: 225, note: "Locked round 2 · 4 of 4" }, { ...T(0), points: 150, note: "Locked round 3 · 4 of 4" }, { ...T(2), points: 113, note: "Locked round 2 · 2 of 4" },
        { ...T(3), points: 75, note: "Locked round 1 · 1 of 4" }, { ...T(4), points: 0, note: "Never locked" }, { ...T(5), points: 0, note: "Never locked" }] }),
};

/* --------------------------------------------------------------- snapshots */
function base(now: number): Snapshot {
  return {
    party: "demo", version: 1, serverNow: now, status: "running", mode: "normal", backdrop: "amber",
    phase: { kind: "ambient", startsAt: now - 1000, endsAt: null },
    question: null, reveal: null, answeredCount: 0, eligibleCount: 6, standings, lastSet: null, teams,
    joinUrl: "https://afterlife.example/join", appName: "AFTERLIFE",
  };
}

interface Parsed { fam: GameFamily; stage: Stage; index: number; round: number; reveal: boolean }
function parse(name: string): Parsed | null {
  const m = /^(q|reveal)-(calavera|line|loteria|room|closest|case)(?:-(.*))?$/.exec(name);
  if (!m) {
    if (name === "practice" || name === "offline" || name === "paused") return { fam: "line", stage: "answer", index: 1, round: 2, reveal: false };
    if (name === "longnames") return { fam: "closest", stage: "answer", index: 0, round: 1, reveal: false };
    return null;
  }
  const fam = m[2] as GameFamily, rest = m[3] ?? "", rev = m[1] === "reveal";
  let stage: Stage = "answer";
  if (fam === "calavera") stage = rest.startsWith("vote") || rev ? "vote" : "write";
  if (fam === "room") stage = rest.startsWith("guess") || rev ? "guess" : "answer";
  if (fam === "case") stage = rest === "clue" ? "clue" : "answer";
  const round = fam === "case" ? (rest === "locked" || rest === "final" ? 3 : 2) : 1;
  const index = fam === "loteria" && rest === "9" ? 0 : fam === "case" ? round - 1 : 1;
  return { fam, stage, index, round, reveal: rev };
}

export function mockSnapshot(name: string): Snapshot {
  const now = Date.now();
  const s = base(now);
  const p = parse(name);
  if (p) {
    const q = question(p.fam, p.stage, p.index, p.round);
    if (name === "longnames") q.prompt = "Approximately how many marigold (cempasúchil) flowers, measured in metric tonnes, does Mexico harvest each year for the Day of the Dead season?";
    const doubled = name.endsWith("doubled");
    const phase = { kind: "question" as const, startsAt: now - 10_000, endsAt: now + 18_400, setId: "s7", setSeq: 7, family: p.fam, qIndex: q.index, stage: p.stage, doubled };
    const lng = name === "longnames" ? standings.map((r, i) => (i === 0 ? { ...r, name: "The Extremely Long Family Name Of Great-Grandma Esperanza" } : r)) : standings;
    if (p.reveal) {
      return { ...s, backdrop: "violet", question: q, reveal: reveals[p.fam](p.round), answeredCount: 6,
        phase: { ...phase, kind: "reveal", stage: undefined, endsAt: now + 12_000 } };
    }
    const snap: Snapshot = { ...s, backdrop: "violet", question: q, answeredCount: p.stage === "clue" ? 2 : 4, standings: lng, phase };
    if (name === "paused") return { ...snap, status: "paused", phase: { ...phase, endsAt: null } };
    return snap;
  }
  switch (name) {
    case "ambient-empty": return { ...s, standings: [], teams: [] };
    case "intro": return { ...s, phase: { kind: "intro", startsAt: now - 3000, endsAt: now + 12_000, setId: "s7", setSeq: 7, family: "calavera" } };
    case "intro-doubled": return { ...s, backdrop: "magenta", phase: { kind: "intro", startsAt: now - 3000, endsAt: now + 12_000, setId: "s9", setSeq: 9, family: "case", doubled: true } };
    case "away": return { ...s, phase: { kind: "intro", startsAt: now - 3000, endsAt: now + 12_000, setId: "s7", setSeq: 7, family: "line" } };
    case "results": case "results-doubled": {
      const doubled = name === "results-doubled", k = doubled ? 2 : 1;
      return { ...s, backdrop: "magenta", phase: { kind: "results", startsAt: now - 2000, endsAt: now + 26_000, setId: "s7", setSeq: 7, family: "line", doubled },
        lastSet: { setId: "s7", family: "line", winners: ["t1"], scores: [
          { teamId: "t1", name: "Los Marshall", score: 283 * k, ranked: true, perfect: false },
          { teamId: "t2", name: "Las Flores", score: 250 * k, ranked: true, perfect: false },
          { teamId: "t3", name: "Tía Carmen's Table", score: 200 * k, ranked: true, perfect: false },
          { teamId: "t4", name: "The Riveras", score: 150 * k, ranked: true, perfect: false },
          { teamId: "t5", name: "Primos", score: 117 * k, ranked: false, perfect: false } ] } };
    }
    case "interval": return { ...s, phase: { kind: "interval", startsAt: now - 5000, endsAt: now + 95_000, tribute: null } };
    case "interval-slide": return { ...s, phase: { kind: "interval", startsAt: now - 5000, endsAt: now + 95_000, tribute: null,
      slide: { id: "sl1", url: "/art/celebration-magenta-960.webp", width: 1672, height: 941, caption: "Tía Carmen won the tamale-off. Again.", takenBy: "Las Flores", dwellMs: 8000 } } };
    case "interval-slide-portrait": return { ...s, phase: { kind: "interval", startsAt: now - 5000, endsAt: now + 95_000, tribute: null,
      slide: { id: "sl2", url: "/icons/icon-512.png", width: 800, height: 1000, caption: "Best-dressed calavera of the night", takenBy: "Primos", dwellMs: 8000 } } };
    case "interval-tribute": return { ...s, phase: { kind: "interval", startsAt: now - 5000, endsAt: now + 95_000, tribute } };
    case "interval-tribute-wide": return { ...s, phase: { kind: "interval", startsAt: now - 5000, endsAt: now + 95_000,
      tribute: { ...tribute, id: "tr2", personName: "Abuela María Guadalupe Hernández de la Cruz", photoUrl: "/art/celebration-magenta-960.webp", width: 1672, height: 941, fit: "contain",
        remembrance: "She taught three generations to make tamales, never measured anything, and always saved the last dance for whoever needed it most. Her kitchen was the warmest room in every house she ever lived in, and her laugh carried down the whole street.", attribution: "Shared by her grandchildren" } } };
    default: return s;
  }
}

/** Phone-only: simulate a server rejection on load (shows the failed state). */
export function mockSubmitError(name: string): { code: string; value: AnswerValue } | null {
  if (name === "q-calavera-filtered") return { code: "filtered", value: "…and that’s where he said a very rude word" };
  return null;
}

export function mockMe(name: string): MeView {
  const p = parse(name);
  const captain = name !== "q-closest-noncaptain";
  const live = p && !p.reveal ? p : null;
  let saved: MeView["current"]["saved"] = null;
  let prior: MeView["current"]["prior"] = null;
  let reasonCannot: MeView["current"]["reasonCannot"];
  if (name === "q-calavera-write-saved") saved = { stage: "write", value: "Now he’s six feet under — still twenty minutes late." };
  if (name === "q-calavera-vote-saved") saved = { stage: "vote", value: "e2" };
  if (name === "q-line-saved") saved = { stage: "answer", value: ["l1", "l3", "l4", "l2"] };
  if (name === "q-room-guess") prior = { stage: "answer", value: 3 };
  if (name === "q-room-guess-noanswer") reasonCannot = "need_answer";
  if (name === "q-case-locked") { prior = { stage: "answer", value: { p1: "s1", p2: "s2", p3: "s3", p4: "s4" } }; reasonCannot = "already_locked"; }
  if (name === "q-case-clue") reasonCannot = "watching";
  if (name === "q-loteria-late") reasonCannot = "late_join";
  if (!captain) reasonCannot = "not_captain";
  const fam = p?.fam;
  const max = fam === "case" ? 300 : 100;
  const result = p?.reveal
    ? name === "reveal-case-mid" ? null
      : name === "reveal-loteria-wrong" ? { points: 0, max, note: "It was El Sol" }
      : fam === "case" ? { points: 150, max, note: "Locked round 3 · 4 of 4 correct" }
      : fam === "closest" ? { points: 75, max, note: "58 m — 7 under" }
      : fam === "room" ? { points: 85, max, note: "You guessed 45% · actual 50%" }
      : fam === "calavera" ? { points: 60, max, note: "2 votes + 10 for voting" }
      : fam === "line" ? { points: 100, max, note: "Perfect order" }
      : { points: 100, max }
    : null;
  return {
    member: { id: "m1", name: "Ben", isCaptain: captain },
    team: { ...teams[0], name: name === "longnames" ? "The Extremely Long Family Name Of Great-Grandma Esperanza" : teams[0].name,
      status: name === "away" ? "away" : "active", inviteCode: "MARI-7Q", captainName: captain ? "Ben" : "Lucía", memberCount: 3 },
    current: {
      questionId: live ? question(live.fam, live.stage, live.index, live.round).id : p ? question(p.fam, p.stage, p.index, p.round).id : null,
      stage: live?.stage ?? null, saved, prior, ownEntryId: name.startsWith("q-calavera-vote") ? "e4" : null,
      canSubmit: !!live && captain && !saved && !reasonCannot,
      reasonCannot, ranked: name !== "practice", result,
    },
    history: [
      { setId: "s1", seq: 1, family: "line", score: 283, max: 300, ranked: true, counted: true, doubled: false, invalidated: false },
      { setId: "s2", seq: 2, family: "calavera", score: 140, max: 300, ranked: true, counted: false, doubled: false, invalidated: false },
      { setId: "s3", seq: 3, family: "case", score: 225, max: 300, ranked: true, counted: true, doubled: false, invalidated: false },
      { setId: "s4", seq: 4, family: "closest", score: 0, max: 300, ranked: false, counted: false, doubled: false, invalidated: true },
      { setId: "s5", seq: 5, family: "loteria", score: 200, max: 300, ranked: true, counted: true, doubled: false, invalidated: false },
      { setId: "s6", seq: 6, family: "room", score: 470, max: 600, ranked: true, counted: true, doubled: true, invalidated: false },
    ],
    total: 1178, setsCounted: 4,
    albumUrl: "https://example.org/album",
  };
}
