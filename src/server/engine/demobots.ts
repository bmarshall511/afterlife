/**
 * Demo party only: stand-in "bot" families that answer on their own a few seconds into each stage, so the host
 * can try social games (Calavera, Read the Room need >= 3 families) and see real reveals while testing alone.
 * Bots go through the normal submitAnswer validation; they never exist on the live party.
 */
import type { AnswerValue, InputSpec } from "@/shared/types";
import { db } from "./deps";
import { join, submitAnswer } from "./actions";
import { buildMe, buildSnapshot } from "./snapshot";
import { EngineError } from "./types";

const NAMES = ["Los Bots Fantasmas", "Familia Robótica", "Tía Byte’s Table", "The Silicon Abuelos", "Primos Pixel"];
const LINES = [
  "and asked if the afterlife had decent wifi.",
  "she said, “Fine — but I’m driving this time.”",
  "and stayed for tamales. Nobody was surprised.",
  "he blamed the GPS, the traffic, and the moon.",
  "and left a five-star review: “Very spooky.”",
  "then insisted it was a shortcut all along.",
];

const FIBS = [
  ["Our abuela once out-danced a mariachi band.", "We own a goat named Señor Tamal.", "Tío Beto has never been late. Ever."],
  ["We drove 9 hours for one taco stand.", "Our cat has its own ofrenda photo.", "We once won a salsa contest with store-bought salsa."],
  ["Mamá can name every telenovela since 1990.", "We got lost in our own neighborhood.", "Our dog is afraid of piñatas."],
  ["We have three family members named José.", "Our car is called La Catrina.", "We've never burned the tortillas."],
];

export async function addDemoBots(partyId: string, count = 3, now = Date.now()) {
  if (partyId !== "demo") throw new EngineError("invalid", "Bots are only available on the demo party.", 403);
  const d = await db();
  const existing = (await d.query(`SELECT count(*)::int AS n FROM team WHERE party_id=$1 AND bot`, [partyId]))[0]?.n ?? 0;
  const added: string[] = [];
  for (let i = 0; i < count; i++) {
    const name = NAMES[(existing + i) % NAMES.length] + (existing + i >= NAMES.length ? ` ${existing + i + 1}` : "");
    const r = await join(partyId, { name: "Bot", teamName: name }, now);
    await d.query(`UPDATE team SET bot=true WHERE id=$1`, [r.me.team.id]);
    added.push(name);
  }
  return { added };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function botValue(input: InputSpec, seed: number, ownEntryId: string | null | undefined): AnswerValue | null {
  switch (input.kind) {
    case "choice": return seed % input.options.length;
    case "order": {
      const ids = input.items.map((x) => x.id);
      // a plausible, imperfect ordering: swap one pair
      const k = seed % Math.max(1, ids.length - 1);
      [ids[k], ids[k + 1]] = [ids[k + 1], ids[k]];
      return ids;
    }
    case "number": {
      const span = input.max - input.min;
      const v = input.min + span * (0.05 + ((seed % 60) / 100));
      return Math.round(v / input.step) * input.step;
    }
    case "text": return LINES[seed % LINES.length];
    case "vote": {
      const others = input.entries.filter((e) => e.id !== ownEntryId);
      return others.length ? others[seed % others.length].id : null;
    }
    case "fib": {
      const set = FIBS[seed % FIBS.length];
      return { statements: set, fib: seed % 3 };
    }
    case "percent": return 15 + (seed % 70);
    case "assign": {
      const slots = [...input.slots].sort((a, b) => (hash(a.id + seed) % 97) - (hash(b.id + seed) % 97));
      return Object.fromEntries(input.people.map((p, i) => [p.id, slots[i % slots.length].id]));
    }
  }
}

/** Called after each demo /api/state tick. Cheap no-op when the demo party has no bots. */
export async function runDemoBots(partyId: string, now = Date.now()) {
  if (partyId !== "demo") return;
  const d = await db();
  const bots = await d.query(`SELECT m.id AS member_id, t.id AS team_id FROM team t JOIN member m ON m.team_id=t.id AND m.id=t.captain_member_id
                              WHERE t.party_id=$1 AND t.bot AND t.status='active' ORDER BY t.created_at`, [partyId]);
  if (!bots.length) return;
  await d.query(`UPDATE member SET last_seen=$2 WHERE party_id=$1 AND team_id = ANY($3::uuid[])`, [partyId, new Date(now).toISOString(), bots.map((b) => b.team_id)]);
  const s = await buildSnapshot(d, partyId, now, "phone");
  if (s.phase.kind !== "question" || !s.question || !s.phase.stage) return;
  const started = s.phase.startsAt ?? now;
  for (let i = 0; i < bots.length; i++) {
    if (now - started < 2500 + i * 1500) continue; // staggered, so the "N of M locked in" count visibly climbs
    const me = await buildMe(d, partyId, bots[i].member_id, now);
    if (!me.current.canSubmit || me.current.saved) continue;
    const input = s.question.input;
    if (!input) continue;
    const value = botValue(input, hash(s.question.id + s.phase.stage + i), me.current.ownEntryId);
    if (value == null) continue;
    try {
      await submitAnswer(partyId, bots[i].member_id, { questionId: s.question.id, stage: s.phase.stage, value, requestId: `bot:${s.question.id}:${s.phase.stage}:${i}` }, now);
    } catch {
      /* closed / already / need_answer: fine for a bot */
    }
  }
}
