# Deploying to Vercel

Checked against Vercel docs on 2026-10-27 (Functions limits, Private Blob storage, Postgres via Marketplace).
Nothing has been deployed yet; these steps need the host's Vercel account.

## Services
| Need | Choice | Why |
|---|---|---|
| App + API | Vercel (Next.js, Node runtime, Fluid compute) | Required host. |
| Database | Neon Postgres via Vercel Marketplace | Vercel Postgres is discontinued; Marketplace injects `DATABASE_URL`. Free tier is ample for one party. |
| Photos | Vercel Blob, **private** store | Photos are only streamed through `/api/tributes/photo/[id]`; private stores need `@vercel/blob` ≥ 2.3 (we use 2.8). |
| Realtime | HTTP polling (1–1.5 s) | No socket server; any polling client advances phases via an idempotent DB transaction. No cron needed. |

Limits that matter: function request body max **4.5 MB** (phones resize photos to ≤ ~3.8 MB before upload);
Hobby function duration 300 s (requests here take milliseconds). Costs: Hobby + Neon free + Blob free tier
should cover one party; check your account's current usage pages — paid upgrades are the host's decision.

## Steps
1. Push this folder to a Git repo (GitHub) and **Import** it in Vercel (framework: Next.js; defaults).
2. Project → **Storage** → Create → **Neon** (Marketplace). Connect to all environments. This sets `DATABASE_URL`.
3. Project → **Storage** → Create → **Blob** → access **Private** → connect to the project
   (sets `BLOB_STORE_ID`; auth via OIDC). Or CLI: `vercel blob create-store afterlife-photos --access private --yes`.
4. Project → Settings → **Environment Variables** (Production):
   - `ADMIN_PASSWORD` — `openssl rand -base64 24`
   - `TRIBUTE_INVITE_TOKEN` — `openssl rand -hex 16`
   - `PUBLIC_BASE_URL` — e.g. `https://<project>.vercel.app` (or custom domain)
5. Ensure **Deployment Protection** does not cover the production domain (guests must reach `/join` and
   `/remember` without a Vercel login). Preview deployments may stay protected.
6. Deploy. Migrations run automatically on first request (`schema_migrations` table).
7. Verify: open `/admin`, log in, Diagnostics should show `postgres` and `vercel-blob`. Upload a test tribute
   to the **demo** party (`/remember/<token>?party=demo`), check it on `/tv?party=demo`, then reset demo.
8. Scan the TV QR with a phone and confirm it opens `PUBLIC_BASE_URL/join` (not localhost, not a login wall).

The app refuses to start storage/DB on Vercel without Neon/Blob configured (it will not silently use the
ephemeral filesystem).

## Data retention
Tributes and photos persist until deleted in Admin → Tributes (deletion removes the DB row status and the
Blob objects for display, thumbnail and normalized original). Export is available in Admin. No automatic
retention deadline is set; delete the Neon database and Blob store after the party if you want everything gone.
