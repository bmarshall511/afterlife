import type { Q } from "@/server/db";
import type { QuestionOption } from "@/shared/types";
import { shuffle } from "./rng";

/**
 * Two Truths and a Fib: written entries persist for the party. A fib question features one entry; the shown
 * order is a deterministic shuffle by question id, and the mapping (incl. which shown option is the fib) stays in
 * question.private.featured until reveal.
 */
export interface Featured {
  answerId: string;
  teamId: string;
  /** shown position k → original statement index */
  order: number[];
  statements: string[]; // in shown order
  fibShown: number;
}

export function makeFeatured(qid: string, a: Record<string, any>): Featured {
  const order = shuffle([0, 1, 2], `${qid}:fib`);
  return { answerId: a.id, teamId: a.team_id, order, statements: order.map((i) => a.value.statements[i]), fibShown: order.indexOf(a.value.fib) };
}

export const fibOptions = (f: Featured): QuestionOption[] => f.statements.map((t, k) => ({ label: "ABC"[k], text: t }));

/** An entry of this party not yet featured, not hidden, from an active/away team (oldest first). */
export async function unshownEntry(q: Q, partyId: string) {
  const r = await q.query(
    `SELECT a.id, a.team_id, a.value FROM answer a JOIN question qq ON qq.id=a.question_id JOIN team t ON t.id=a.team_id
      WHERE a.party_id=$1 AND a.kind='write' AND NOT a.hidden AND qq.private->'item'->>'family'='fib' AND t.status IN ('active','away')
        AND NOT EXISTS (SELECT 1 FROM question q2 WHERE q2.party_id=$1 AND q2.private->'featured'->>'answerId' = a.id::text)
      ORDER BY a.created_at, a.id LIMIT 1`,
    [partyId],
  );
  return r[0] ?? null;
}
