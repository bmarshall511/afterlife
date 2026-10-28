# Progress log

## Decisions
- See docs/CONTRACTS.md (stack, lazy idempotent tick, polling, party isolation, ownership).
- Deviation from "slice before parallel": the engine workstream delivers the vertical slice first (join→state→answer→score→reconnect); UI builds against the typed contract concurrently. Tributes and content are independent of the engine.

## Workstreams (launched 2026-10-27)
- Engine & persistence — agent
- TV & phone experience — agent
- Tributes & admin — agent
- Content & scenes — agent

## Status
- [x] Scaffold, DB layer (pg/PGlite), core migration, shared types, contracts
- [x] Tributes+admin (agent): upload/edit/photo routes, fair queue (queue_round), admin auth + all sections; 30 unit tests pass. Dev token `dev-ofrenda-2026`, dev admin pw `afterlife-dev` (non-prod only). Engine reads `settings.families` (enabled list). Added control fn `setTeamStatus`.
- [x] Content (agent): 207 items, 5 verified sources, 13 tests. Engine (agent): 26 tests, 4h/20-team sim clean. UI (agent): all states, mock + real-API screenshots.
- [x] Integration: tsc clean, 69 unit tests pass, production build passes. Fixed: absolute QR join URL; refuse PGlite/local blobs on Vercel; private Blob via OIDC (BLOB_STORE_ID). Docs: README, DEPLOY, RUNBOOK.
- [ ] Independent verification agent (e2e) running.
- [x] 2026-10-27 Vercel: project `afterlife` (team highfivery-llc) at https://afterlife-weld.vercel.app. Private Blob store `afterlife-photos`, Neon `neon-citron-house`, ADMIN_PASSWORD/TRIBUTE_INVITE_TOKEN/PUBLIC_BASE_URL set for Production. Verified live: state API, absolute QR URL, admin login, diagnostics postgres+vercel-blob, demo tribute upload/serve (EXIF stripped)/delete, demo join+reconnect, demo reset; live party untouched (idle, 0 teams). Secrets in .data/PRODUCTION-SECRETS.txt (git-ignored).
