/**
 * Test/dev fixture content pool covering the six v2 families. Used only when src/content does not (yet)
 * export the v2 API, or when a test injects it. Prompts are neutral placeholders. Every item carries a
 * `data.secret` marker so tests can assert nothing secret reaches a snapshot.
 */
import type { GameFamily, PublicQuestion, RevealInfo } from "@/shared/types";
import { shuffle } from "./rng";
import type { ContentItem, ContentSource } from "./types";

const LETTERS = "ABCDEFGHIJKL".split("");
const diffOf = (i: number) => ((i % 3) + 1) as 1 | 2 | 3;

function base(family: GameFamily, i: number, extra: Partial<ContentItem>): ContentItem {
  return {
    id: `fx-${family}-${i}`,
    version: 1,
    family,
    difficulty: diffOf(i),
    enabled: true,
    prompt: `Fixture ${family} ${i}`,
    readingSeconds: 6,
    data: { secret: `SECRET-${family}-${i}` },
    answer: null,
    explanation: `Fixture explanation ${family} ${i}`,
    ...extra,
  };
}

function caseItems(seed: string, idBase: string): ContentItem[] {
  const people = ["p1", "p2", "p3", "p4"].map((id, k) => ({ id, name: `Ancestor ${k + 1}` }));
  const slots = ["s1", "s2", "s3", "s4"].map((id, k) => ({ id, label: `Altar ${k + 1}` }));
  const perm = shuffle(slots.map((s) => s.id), `${seed}:perm`);
  const solution: Record<string, string> = Object.fromEntries(people.map((p, k) => [p.id, perm[k]]));
  const clues = [[`clue A ${seed}`, `clue B`], [`clue C`], [`clue D`]];
  return [0, 1, 2].map((r) =>
    base("case", r, {
      id: `${idBase}-r${r}`,
      difficulty: (r + 1) as 1 | 2 | 3,
      prompt: `Fixture case ${seed}`,
      data: { secret: `SECRET-case-${seed}`, puzzleId: idBase, people, slots, clues, solution },
      answer: solution,
    }),
  );
}

export function fixtureItems(perFamily = 6): ContentItem[] {
  const out: ContentItem[] = [];
  for (let i = 0; i < perFamily; i++) {
    out.push(base("calavera", i, { data: { secret: `SECRET-calavera-${i}`, house: [`house ${i}a`, `house ${i}b`, `house ${i}c`, `house ${i}d`] } }));
    const n = diffOf(i) === 3 ? 5 : 4;
    const items = Array.from({ length: n }, (_, k) => ({ id: `l${i}-${k}`, text: `Thing ${k}` }));
    out.push(base("line", i, { data: { secret: `SECRET-line-${i}`, items, values: items.map((_, k) => 1900 + k * 10), lowLabel: "Earliest", highLabel: "Latest" }, answer: items.map((x) => x.id) }));
    const nCards = diffOf(i) === 1 ? 9 : 12;
    out.push(base("loteria", i, { data: { secret: `SECRET-loteria-${i}`, cards: Array.from({ length: nCards }, (_, k) => `card${k}`) }, answer: (i * 5) % nCards }));
    out.push(base("room", i, { data: { secret: `SECRET-room-${i}`, options: ["Opt A", "Opt B", "Opt C", "Opt D"] } }));
    out.push(base("closest", i, { data: { secret: `SECRET-closest-${i}`, min: 0, max: 10000, step: 1, unit: "km" }, answer: 1000 + i * 37 }));
  }
  return out;
}

export function fixtureContent(perFamily = 6): ContentSource {
  const items = fixtureItems(perFamily);
  return {
    allContent: () => items,
    publicQuestion(item, ctx): PublicQuestion {
      const d = item.data as any;
      const pq: PublicQuestion = { id: item.id, family: item.family, index: ctx.index, difficulty: item.difficulty, prompt: item.prompt, input: null, readingSeconds: item.readingSeconds };
      switch (item.family) {
        case "calavera":
          pq.input = ctx.stage === "write" ? { kind: "text", maxLength: 90, placeholder: "Finish the verse" } : ctx.stage === "vote" ? { kind: "vote", entries: [] } : null;
          break;
        case "line": {
          let order = shuffle(d.items as { id: string; text: string }[], item.id);
          if (order.map((x) => x.id).join() === (item.answer as string[]).join()) order = [...order.slice(1), order[0]];
          pq.input = { kind: "order", items: order, lowLabel: d.lowLabel, highLabel: d.highLabel };
          break;
        }
        case "loteria":
          pq.input = { kind: "choice", layout: "grid", options: (d.cards as string[]).map((c, k) => ({ label: LETTERS[k], text: c, icon: c })) };
          break;
        case "room":
          pq.input = ctx.stage === "guess" ? { kind: "percent", optionText: "your answer" } : { kind: "choice", options: (d.options as string[]).map((t, k) => ({ label: LETTERS[k], text: t })) };
          break;
        case "closest":
          pq.input = { kind: "number", min: d.min, max: d.max, step: d.step, unit: d.unit };
          break;
        case "case":
          pq.detail = (d.clues as string[][]).slice(0, ctx.round + 1).flat().join("\n");
          pq.input = ctx.stage === "answer" ? { kind: "assign", people: d.people, slots: d.slots } : null;
          pq.scene = { template: "case-altars", seed: String(d.puzzleId), data: { people: d.people, slots: d.slots } };
          break;
      }
      return pq;
    },
    revealInfo(item): Omit<RevealInfo, "outcomes"> {
      const d = item.data as any;
      const detail = item.family === "line" ? { values: d.values } : item.family === "calavera" ? { house: d.house } : null;
      return { correct: item.answer, explanation: item.explanation, source: null, detail };
    },
    generateFresh(family, seed) {
      return family === "case" ? caseItems(seed, `fx-gen-case-${seed}`)[0] : null;
    },
    caseSet(seed) {
      return caseItems(seed, `fx-case-${seed}`);
    },
  };
}
