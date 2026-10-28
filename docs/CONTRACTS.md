# AFTERLIFE — architecture & shared contracts

Source of truth for requirements: `afterlife-handoff/BUILD-BRIEF.md`, `GAME-RULES.md`, `ACCEPTANCE-CHECKLIST.md`.
This file fixes the cross-workstream decisions. Changing anything here requires the orchestrator.

## Stack (decided)
- Next.js 16 App Router + TypeScript + React 19, Node runtime for all API routes (`export const runtime = "nodejs"`, `dynamic = "force-dynamic"`).
- DB: Postgres. Prod = Neon (Vercel Marketplace) via `pg` Pool using `DATABASE_URL`. Local/dev/test = embedded PGlite in `.data/` (no setup). Access only through `src/server/db.ts` (`getDb()`, `db.query`, `db.tx`). Parameterized SQL only, no ORM.
- Photos: `src/server/storage.ts` (tributes workstream) — Vercel Blob when `BLOB_READ_WRITE_TOKEN` set, else `.data/blobs/`. Clients never get raw blob URLs; photos are streamed by `/api/tributes/photo/[id]?v=...`.
- Image processing: `sharp` (re-encode to JPEG/WebP, `.rotate()` for EXIF orientation, metadata stripped). HEIC: browser-side canvas conversion to JPEG before upload (Safari decodes HEIC); server rejects undecodable input with a clear error.
- Realtime: resilient polling. Clients poll `GET /api/state?party=` (~1s TV, ~1.5s phones, backoff on failure) with `?v=<version>`; server returns 204 when unchanged *and* nothing due. No sockets, no long-lived loops.
- Phase advancement = **lazy, idempotent tick**: every `GET /api/state` (and answer submits) calls `tick(partyId)` which, inside one transaction holding `SELECT ... FROM party WHERE id=$1 FOR UPDATE`, applies all transitions whose `endsAt <= now`. Exactly one caller wins; others see the updated version. Any client (TV, phone, admin) keeps the party moving; a dead TV changes nothing. Optional Vercel Cron hitting `/api/tick` is a harmless extra caller.
- **Outage catch-up policy**: if on tick the current phase has been overdue by > `catchUpGraceMs` (default 45s — nobody was polling), the engine does NOT replay. A running set is invalidated (reason `outage`, excluded for everyone), and the party jumps to a fresh `interval` phase starting now. Pause freezes logical time: on pause store remaining ms; resume sets new `endsAt = now + remaining`.
- Party isolation: `party_id` in every table: `live` (real) and `demo` (preview/tests). Clients select with `?party=demo`; default `live`. Demo reset deletes only `party_id='demo'` rows. Tests use `PGLITE_MEMORY=1` or `PGLITE_DIR=test-*`.
- Auth: guest session = random 32-byte bearer secret in httpOnly cookie `al_s_<party>` (sha256 stored in `member.session_hash`). Admin = password login (`ADMIN_PASSWORD`, constant-time compare) creating `admin_session` row; httpOnly SameSite=Strict cookie `al_admin`. Tribute edit capability = random token in edit link; only sha256 stored.
- Time: all deadlines are server epoch ms. Snapshot carries `serverNow`; clients compute offset (display only).

## Cycle & timing defaults (`party.settings`, admin-adjustable)
```
introMs 15000 | questionMs 35000 | memoryExposeMs 10000 (+ answer 25000) | familyPreferMs 15000 (+ predict 20000)
revealMs 10000 | resultsMs 30000 | intervalMs 120000 | minViewMs 4000 (early-close after all eligible answered)
catchUpGraceMs 45000 | socialEvery 5 (4 objective then 1 family set when >=3 eligible teams)
tributeDwellMinMs 20000 | tributeDwellMaxMs 35000 | remembranceMaxChars 300
```
Sequence: `ambient` → (start pressed & ≥1 active team) `intro` → `question`(q0) → `reveal` → q1 → reveal → q2 → reveal → `results` → `interval` → `intro`… Zero active teams at an intro boundary → `ambient` (no scored empty sets); ambient re-checks each tick. 1–2 teams: objective families only. ≥3: family set allowed. Never same family twice in a row. `tribute_only` mode: stays in `interval`-style tribute rotation, no sets. Interval end waits for the current tribute to finish (`endsAt = max(endsAt, tribute.until)`).

Early close: when every eligible team has submitted for the current stage and `now - stage start >= minViewMs`, the stage ends early (memory expose never ends early).

## Eligibility & scoring (GAME-RULES authoritative)
- At intro start: `cohort` = teams with status `active`. At intro end: `eligible` = cohort teams with any member `last_seen >= intro.startsAt`. Eligible teams' set score counts toward ranking (unanswered = 0). Others may play remaining questions as **practice** (scored in ledger with set_id but `ranked=false` in history; never counted).
- A team joining mid-question participates from the next question (`question.opened_at` > team created → else `late_join`).
- Memory: answers accepted only in `answer` stage; team must have existed before the `expose` stage started.
- Away: excluded from next set cohort; mid-set away does not erase current set.
- Objective: correct 100, else 0. Family: see GAME-RULES §6 (normalize ×3/nonvoid; <2 nonvoid → set invalidated).
- Ledger: `score_ledger(kind='question')` unique on (question_id, team_id). Scoring happens once, in the transition `question→reveal`, inside the tick transaction.
- Ranking: total = sum of best five ranked set scores; qualified when ≥5 ranked sets; competition ranking (1,1,3) among qualified; ties sorted by name for display only. Provisional list shows `n/5`.

## API (owner in brackets)
All JSON; errors `{error, code}` with proper status. Party via `?party=` (default live).
- [engine] `GET /api/state?party&v` → `Snapshot` (types.ts). Runs `tick`.
- [engine] `POST /api/join {party, name, teamName?, inviteCode?}` → sets cookie, returns `MeView`. No inviteCode = new team (auto name/color/avatar from name). Rate-limited.
- [engine] `GET /api/me?party` → `MeView` (401 if no session). Updates `last_seen`.
- [engine] `POST /api/answer {party, questionId, stage, choice, requestId}` → `{ok, saved:{kind,choice}}` or error codes `not_captain|closed|late_join|away|already|invalid`. Idempotent: same requestId/same choice returns ok; a different choice after lock → `already`.
- [engine] `POST /api/team {party, action:'away'|'resume'|'claim_captain'|'rename', ...}`. `claim_captain` allowed for a team member when explicitly confirmed; old captain loses authority immediately (audit logged).
- [engine] `GET /api/tick` (cron-safe, no auth needed, idempotent).
- [tributes] `POST /api/tributes` multipart (invite token, photo, fields, consent=true) → `{id, editToken}`; `GET/PATCH/DELETE /api/tributes/[id]` with `Authorization: Bearer <editToken>`; `GET /api/tributes/photo/[id]?size=thumb|display&v=`.
- [admin] `/api/admin/*` — all require admin session. Uses engine control functions below.

## Server module interfaces (cross-owner calls)
Engine exports (`src/server/engine/control.ts`), admin calls them:
```ts
startParty(partyId, actor), pauseParty(partyId, actor), resumeParty(partyId, actor),
skipQuestion(partyId, actor), invalidateSet(partyId, setId, reason, actor), extendInterval(partyId, ms, actor),
setMode(partyId, 'normal'|'tribute_only', actor), updateSettings(partyId, patch, actor), endParty(partyId, actor),
resetParty(partyId /* 'demo' only unless confirm */, actor),
adjustScore(partyId, teamId, points, reason, actor), mergeTeams(partyId, fromId, intoId, actor),
removeTeam(partyId, teamId, actor), renameTeam(...), setCaptain(partyId, teamId, memberId, actor),
computeStandings(q, partyId): Promise<StandingRow[]>
```
Tributes exports (`src/server/tributes/queue.ts`), engine calls during `interval`/`ambient`:
```ts
nextTribute(q: Q, partyId, now: number): Promise<PublicTribute | null>  // fair queue: priority desc, display_count asc, last_shown_at asc nulls first; marks shown
isTributeVisible(q, partyId, tributeId): Promise<boolean>              // hidden/deleted => engine swaps promptly
```
Content exports (`src/content/index.ts`), engine calls:
```ts
interface ContentItem { id: string; version: number; family: GameFamily; difficulty: 1|2|3; enabled: boolean;
  prompt: string; promptEs?: string; options: QuestionOption[]; answer: number | null /* null for family */;
  explanation: string; source?: {title:string;url:string;verification:string} ; scene?: SceneSpec; readingSeconds: number }
allContent(): ContentItem[]                      // validated at load; throws on malformed
publicQuestion(item, ctx: {stage: Stage; elapsedMs: number; audience: 'tv'|'phone'}): PublicQuestion  // never leaks answer
revealInfo(item): RevealInfo                     // correct, explanation, source, highlight
generateFresh(family, seed): ContentItem | null  // deterministic visual instance when pool exhausted
```
`question.public` stores the `ContentItem` minus answer for re-rendering; `question.private` stores `{answer, reveal}`. Engine calls `publicQuestion` per snapshot (memory: TV gets scene only in `expose`; phones never get the scene; reveal family: scene detail grows with elapsed stage).

UI: `src/games/scenes/SceneView.tsx` (content owner) — `<SceneView spec={SceneSpec} audience="tv"|"phone" stage={Stage} elapsedMs={number} reveal={RevealInfo|null} />`, pure SVG/DOM, deterministic, no network.

## Backdrop mapping
`ambient`, `intro`, `interval` → amber; `question` → violet; `reveal` → violet; `results` → magenta. Interval showing a tribute → amber heavily dimmed (UI handles).

## Directory ownership
| Owner | Paths |
|---|---|
| Orchestrator | `package.json`, lockfile, `tsconfig.json`, `next.config.ts`, `src/shared/**`, `src/server/db.ts`, `db/migrations/001_core.sql`, `docs/CONTRACTS.md`, `docs/PROGRESS.md`, `vercel.json`, root README |
| Engine | `src/server/engine/**`, `src/server/session.ts`, `src/server/ratelimit.ts`, `src/server/http.ts`, `src/app/api/{state,join,me,answer,team,tick}/**`, `db/migrations/1xx_*.sql`, `tests/unit/engine*`, `scripts/simulate.ts` |
| Experience (UI) | `src/app/{layout.tsx,globals.css,page.tsx}`, `src/app/{join,play,tv}/**`, `src/components/**`, `src/client/**`, `public/art/**`, `scripts/build-assets.ts` |
| Tributes+Admin | `src/server/{storage.ts,admin/**,tributes/**}`, `src/app/{remember,admin}/**`, `src/app/api/{tributes,admin}/**`, `db/migrations/2xx_*.sql`, `tests/unit/tribute*`, `tests/unit/admin*` |
| Content | `src/content/**`, `src/games/**`, `scripts/validate-content.ts`, `docs/CONTENT-SOURCES.md`, `tests/unit/content*` |
| Shared e2e | `tests/e2e/**` — orchestrator integrates; agents may add files prefixed with their area |

Dependencies installed: next, react, pg, @electric-sql/pglite, sharp, @vercel/blob, qrcode, zod, vitest, @playwright/test, tsx. Don't edit package.json; report needed deps.
