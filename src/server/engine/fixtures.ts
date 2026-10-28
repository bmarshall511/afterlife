/**
 * Test/dev fixture content pool. Used only when src/content is unavailable or a test injects it.
 * Not party content: prompts are neutral placeholders.
 */
import type { GameFamily, PublicQuestion, RevealInfo } from "@/shared/types";
import type { ContentItem, ContentSource } from "./types";

const OPTS4 = ["A", "B", "C", "D"];

function make(family: GameFamily, i: number): ContentItem {
  const truth = family === "truth";
  const options = truth
    ? [{ label: "True", text: "True" }, { label: "Invented", text: "Invented" }]
    : OPTS4.map((l, k) => ({ label: l, text: `${family} option ${k + 1}` }));
  return {
    id: `fx-${family}-${i}`,
    version: 1,
    family,
    difficulty: ((i % 3) + 1) as 1 | 2 | 3,
    enabled: true,
    prompt: `Fixture ${family} question ${i}`,
    options,
    answer: family === "family" ? null : i % options.length,
    explanation: `Fixture explanation ${i}`,
    scene: family === "truth" ? undefined : { template: `fx-${family}`, seed: String(i), data: { secretIndex: i } },
    readingSeconds: 8,
  };
}

export function fixtureItems(perFamily = 6): ContentItem[] {
  const fams: GameFamily[] = ["memory", "truth", "difference", "reveal", "altar", "family"];
  return fams.flatMap((f) => Array.from({ length: perFamily }, (_, i) => make(f, i)));
}

export function fixtureContent(perFamily = 6, opts: { fresh?: boolean } = {}): ContentSource {
  const items = fixtureItems(perFamily);
  return {
    allContent: () => items,
    publicQuestion(item, ctx): PublicQuestion {
      const sceneVisible = item.family === "memory" ? ctx.audience === "tv" && ctx.stage === "expose" : ctx.audience === "tv";
      return {
        id: item.id,
        family: item.family,
        index: 0,
        prompt: item.prompt,
        promptEs: item.promptEs,
        options: item.options,
        scene: sceneVisible && item.scene ? { template: item.scene.template, seed: item.scene.seed, data: {} } : null,
        readingSeconds: item.readingSeconds,
      };
    },
    revealInfo(item): RevealInfo {
      return { correct: item.answer, explanation: item.explanation, source: null, highlight: null };
    },
    generateFresh(family, seed) {
      if (!opts.fresh || family === "truth" || family === "family" || family === "altar") return null;
      const it = make(family, 1000);
      return { ...it, id: `fx-gen-${family}-${seed}`, answer: seed.length % 4 };
    },
  };
}
