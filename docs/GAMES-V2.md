# Games v2 — binding spec (approved by host 2026-10-27)

> **Update 2026-10-27 (host feedback):** pacing relaxed so guests needn't watch the TV constantly — intro 25 s,
> Line 90 s, Lotería/Closest 75 s, Calavera write 120 s + vote 60 s, Room 45 s + 50 s, reveal 20 s (Calavera 30 s),
> results 45 s, break 300 s (first 150 s tributes, then party photos). Steps still close early (after 8 s minimum) once
> every eligible family has submitted. **The Ofrenda Case is disabled by default** (too involved for a casual party);
> it remains available in Admin → Content. Per-stage timings below are the original values.

Replaces the v1 lineup (memory, truth, difference, reveal, altar, family), which is retired and must be removed
from rotation, content, UI and tests. Audience: mostly adults; kids can help. Tone: smart, funny, a little cheeky,
never crude, never about real loved ones or grief. Types: `src/shared/types.ts`. Migration: `db/migrations/101_games_v2.sql`.

## Global rules (override GAME-RULES.md where they conflict)
- Set = 3 questions of one family, ordered by difficulty 1 → 2 → 3 (case: one puzzle across 3 clue rounds).
- Per question max 100 → set max 300 (case: set max 300 awarded on q3). **Partial credit** is normal.
- **Doubled set** ("Last chance"): admin action `final_round` marks the NEXT set `doubled`; every ledger row for that
  set is ×2 (max 600). TV intro + phones show "Last chance — double points". One-shot.
- Eligibility, practice sets, late join, away, best-five ranking, ties, pause, outage catch-up: unchanged.
- Scheduling: 1–2 eligible teams → only `line, loteria, closest, case`. ≥3 → all six, with a social family
  (`calavera`, `room`) at most every other set. Never the same family twice in a row. Admin enabled list =
  `settings.families`.
- Answers: one per team per stage (`answer.kind` = stage), value in `answer.value` jsonb, captain only, lock on submit
  (no edits), idempotent by requestId, server validates shape strictly against the question's InputSpec.
- **Cancelled (void) questions in social sets** (Calavera, Read the Room): the set score is rescaled over the questions
  that counted — `round(sum × 3 / countedQuestions)` — so a technical void doesn't punish anyone. Fewer than 2 counted
  questions invalidates the whole set for everyone and the next set is an objective game.
- **A single enabled game** is honoured even if that means the same game back to back.
- No speed bonus anywhere. Case rewards locking at an earlier *clue round*, not seconds.

## 1. Calavera — "Write the epitaph" (social, ≥3 teams)
Calaveras literarias: playful mock-epitaph verses. Setup is a fictional character's first line(s); teams write the
punchline.
- Stages: `write` 75 s (InputSpec text, maxLength 90) → `vote` 30 s (InputSpec vote: all non-hidden entries,
  shuffled deterministically by question id; a team cannot vote for its own entry) → reveal 15 s.
- Word filter on submit (server-side list, normalized for leetspeak/accents) → reject with code `filtered`
  ("Keep it family-friendly"). Admin can hide an entry any time (`answer.hidden`); hidden entries vanish from vote
  list; votes for them are discarded.
- If < 2 entries exist at end of write → question void. Teams that did not write get 0.
- Score: `round(100 * votesReceived / max(1, votersOtherThanSelf))`, where votersOtherThanSelf = number of teams that
  voted and are not the author. Plus +10 (capped at 100) for casting a vote. Reveal shows every entry with team name
  and vote count, winner highlighted.
- Content: ≥ 30 setups. Each: `prompt` (the setup, 1–2 lines, rhyming lead-in ok), `detail` optional, 4 "house"
  punchlines (shown in reveal as "the house would have said…"; also used as filler entries when only 2 teams wrote,
  marked as house and not scorable). Characters are fictional archetypes (the uncle with the shortcut, the cousin who
  "only needs five minutes", the abuela's tupperware, La Catrina herself) — never real people.

## 2. The Line — ordering (objective)
- Stage `answer` 45 s, InputSpec order with 4 items (difficulty 1–2) or 5 items (difficulty 3), plus
  `lowLabel`/`highLabel` (e.g. "Earliest" / "Latest", "Smallest" / "Largest").
- Score = `round(100 * concordantPairs / totalPairs)` (Kendall agreement with the true order). Exactly right = 100.
- Reveal: true order with each item's value (year, km, etc.) and a one-line explanation; source.
- Content: ≥ 30 lines. Mix of Día de los Muertos / Mexican history & culture and broader fun comparisons. EVERY value
  must be checked against an authoritative source (`source.url` + `verification`). Ties in true value forbidden;
  values must differ enough to be unambiguous.

## 3. La Lotería — riddle → card (objective)
- Stage `answer` 40 s, InputSpec choice layout grid, 9 cards (d1), 12 cards (d2–3). Cards are original illustrated
  icons of classic lotería-style subjects (el sol, la luna, el corazón, la sirena, el catrín, la dama, el árbol,
  la escalera, el pescado, la calavera, la rosa, el valiente, …) drawn as original SVG — do not copy the commercial
  Don Clemente card art.
- Prompt = an ORIGINAL riddle verse (2–4 short lines, English, optional Spanish card name only after reveal). d1 fairly
  direct, d2 wordplay, d3 genuinely cryptic but fair. Distractors share traits with the answer.
- Score 100/0. Reveal: card name in Spanish + English and a one-line "why".
- Content: ≥ 36 riddles, ≥ 12 distinct cards each used ≥ 2×.

## 4. Read the Room (social, ≥3 teams)
- Stage `answer` 20 s: InputSpec choice (4 opinion options). Stage `guess` 25 s: InputSpec percent — "What % of
  families picked *your* answer?" (0–100 integer). A team must have answered to guess (`need_answer`).
- Actual% = share of eligible teams' answers (cohort snapshot) that match the team's answer, rounded.
- Score = `max(0, 100 - 3 * |guess - actual|)`. No guess → 0. Fewer than 3 answers → void (unscored poll shown).
- Reveal: bar chart of the room's split + each team's guess vs. actual.
- Content: ≥ 30 questions. Light, opinionated, adult-friendly, mildly spicy, never mean or about real people:
  "Best part of the ofrenda to 'borrow' after: pan de muerto / sugar skull / mezcal / tamales", "Which relative
  would survive a zombie apocalypse?", "Acceptable time to start the tamales: …".

## 5. Closest Without Going Over (objective)
- Stage `answer` 40 s, InputSpec number (min/max/step/unit sized to the question).
- Over the true value → 0. Otherwise accuracy = guess / truth: ≥ 0.95 → 100, ≥ 0.85 → 75, ≥ 0.70 → 50,
  ≥ 0.50 → 25, else 10. With ≥ 2 teams answering, the closest not-over team(s) get +25 (cap 100).
  Exact = 100.
- Reveal: true value, every team's guess on a number line, who busted; source.
- Content: ≥ 30 questions with verified numbers (authoritative source + verification note + date). Prefer stable
  facts (distances, heights, historical counts, recipes, geography). If a number can't be verified, drop it.

## 6. The Ofrenda Case — deduction across the whole set (objective)
- One puzzle per set: 4 fictional ancestors (names + one-line bios) and 4 altars (positions 1–4 or named spots), plus
  each ancestor's favorite offering. Goal: assign each ancestor to an altar (InputSpec assign).
- Question k (k = 0,1,2) = clue round: stage `clue` 20 s (TV shows all clues so far; phones read-only) → stage
  `answer` 40 s (team may lock a full assignment or skip; a lock is final for the set).
- All clues are visible after round 3; puzzle must have EXACTLY one solution given all clues, and MORE than one
  solution after round 1's clues (generator + brute-force solver verifies; 24 permutations).
- Score (recorded on q3 reveal for the whole set; q1/q2 reveals show "locked / still thinking" counts, not the
  solution): correct pairs c (0–4), lock round k: `round((300 - 75k) * c / 4)` → lock at round 1 all correct = 300,
  round 2 = 225, round 3 = 150. Never locked = 0.
- Content: deterministic generator over curated name/bio/offering pools (≥ 40 distinct puzzles verified unique),
  plus clue templates (adjacency, left-of, not-next-to, offering links). Clues in plain English, readable in ≤ 20 s.

## Shared module interfaces
Content (`src/content/index.ts`):
```ts
interface ContentItem { id; version; family: GameFamily; difficulty: 1|2|3; enabled: boolean;
  prompt: string; promptEs?: string; detail?: string; readingSeconds: number;
  data: Record<string, unknown>;        // family-specific, may include secrets
  answer: AnswerValue | null;           // secret
  explanation: string; source?: {title,url,verification}; }
allContent(): ContentItem[]
publicQuestion(item, ctx: {stage: Stage; round: number /*case clue round*/; index: number}): PublicQuestion // no secrets
revealInfo(item): Omit<RevealInfo, "outcomes">
generateFresh(family, seed): ContentItem | null   // case: always possible; others null
caseSet(seed): ContentItem[3]                    // three clue-round items for one puzzle (shared puzzle id in data)
```
Engine owns scoring (`src/server/engine/scoring/<family>.ts`), validation of values against InputSpec, word filter
(`src/server/engine/wordfilter.ts`), stage timings (settings keys `<family><Stage>Ms`), and building `outcomes`.
UI: TV + phone per family; InputSpec-driven phone inputs (order: drag + up/down buttons; number: big stepper +
keypad; assign: tap-to-assign grid; vote: list with own entry hidden).
