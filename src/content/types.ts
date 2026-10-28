import type { GameFamily, QuestionOption, SceneSpec } from "@/shared/types";

export interface ContentItem {
  id: string;
  version: number;
  family: GameFamily;
  difficulty: 1 | 2 | 3;
  enabled: boolean;
  prompt: string;
  promptEs?: string;
  options: QuestionOption[];
  answer: number | null; // null for family
  explanation: string;
  source?: { title: string; url: string; verification: string };
  scene?: SceneSpec;
  readingSeconds: number;
}

/** JSON-safe record for `question.public`: no answer, explanation, source, or hidden question rule. */
export type PublicRecord = Omit<ContentItem, "answer" | "explanation" | "source">;
