import type { AnswerValue, GameFamily } from "@/shared/types";

export interface ContentSource { title: string; url: string; verification: string }

/** Server-side content record (docs/GAMES-V2.md "Shared module interfaces"). `data` and `answer` may hold secrets. */
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
  data: Record<string, unknown>;
  answer: AnswerValue | null;
  explanation: string;
  source?: ContentSource;
}

export interface LineEntry { id: string; text: string; value: number; display: string }
export interface LineData { items: LineEntry[]; lowLabel: string; highLabel: string; unit: string; presented: string[] }
export interface ClosestData { min: number; max: number; step: number; unit: string; value: number }
export interface LoteriaData { options: { label: string; text: string; icon: string; card: string }[]; card: { id: string; es: string; en: string; icon: string }; why: string }
export interface RoomData { options: string[] }
export interface CalaveraData { house: string[] }
export interface CaseData {
  puzzleId: string; seed: string; round: 0 | 1 | 2;
  people: { id: string; name: string; bio: string; offering: string; icon: string }[];
  slots: { id: string; label: string }[];
  rounds: [string[], string[], string[]];
}
