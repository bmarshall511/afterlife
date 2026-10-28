# AFTERLIFE

A Día de los Muertos family party arcade with a separate digital ofrenda. The TV (`/tv`) runs
autonomous game sets, phones (`/join` → `/play`) are team controllers, guests share photos of loved
ones in advance through a private link (`/remember/<token>`), and the host has a protected admin
(`/admin`). Spec: `afterlife-handoff/`. Architecture and contracts: `docs/CONTRACTS.md`.

## Run locally (no accounts needed)

```bash
npm install
npm run assets        # builds optimized backdrops into public/art (already committed output)
npm run dev           # http://localhost:3000
```

Local mode uses embedded Postgres (PGlite) in `.data/pglite` and stores photos in `.data/blobs`.
Development-only defaults (disabled when `NODE_ENV=production`):

| What | Value |
|---|---|
| Admin password | `ADMIN_PASSWORD` in `.env.local` (git-ignored); falls back to `afterlife-dev` only if unset |
| Tribute upload link | `/remember/dev-ofrenda-2026` |

### Demo / test party
Every surface accepts `?party=demo` (e.g. `/tv?party=demo`, `/join?party=demo`,
`/remember/dev-ofrenda-2026?party=demo`). Demo data lives under `party_id='demo'` and is reset from
Admin → Party (demo selected) without touching the real (`live`) party or real tributes.

In dev, `/tv?mock=<state>` and `/play?mock=<state>` render fixture states for design review
(not available in production builds).

## Tests

```bash
npm test                                   # unit: engine, scoring, content, tributes, admin
npx tsx scripts/validate-content.ts        # content validation
PGLITE_MEMORY=1 npx tsx scripts/simulate.ts 4 20   # accelerated 4h / 20-team simulation
npx playwright test -c tests/e2e/playwright.config.ts   # browser e2e (starts its own server)
```

Results of the last run are in `docs/VERIFICATION.md`.

## Deploy
See `docs/DEPLOY.md`. Party-day operation: `docs/RUNBOOK.md`.

## Layout
- `src/server/engine` — authoritative phases, scoring, standings, admin control functions
- `src/server/tributes`, `src/server/storage.ts` — upload processing, fair rotation queue, Blob storage
- `src/server/admin` — admin sessions and route guard
- `src/content`, `src/games/scenes` — question library (207 items), generators, SVG scenes, validation
- `src/app` — pages (`/`, `/join`, `/play`, `/tv`, `/remember`, `/admin`) and API routes
- `db/migrations` — SQL migrations, applied automatically on first DB access (`npm run db:migrate` not required)
