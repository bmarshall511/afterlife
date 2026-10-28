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
- [x] PWA (orchestrator): icons (scripts/build-icons.ts → public/icons, src/app/icon.png, apple-icon.png), src/app/manifest.ts (standalone, no service worker — not required by current Chrome criteria), /install guide (platform-detected steps, one-tap install on Android/desktop Chrome, iPhone "rejoin with team code" note). TODO at integration: link /install from landing + controller menu (optional, never in join flow); add `appleWebApp` metadata in layout; screenshot.
- [x] Album (agent): presigned direct-to-Blob uploads (OIDC-compatible), finalize → full/display/thumb with metadata stripped, signed GET redirects for full quality, client-zip download-all, admin Album tab, 11 tests. Env ALBUM_INVITE_TOKEN (dev `dev-album-2026`). TODO integration: demo reset must also delete album_photo + blobs (admin party route); nextAlbumSlide on TV breaks after tributes; albumUrl via /api/me (server-computed); CONTRACTS Album section; verify CORS of signed GET for download-all on deploy.
