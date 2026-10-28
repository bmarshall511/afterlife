# Verification record (2026-10-27, local macOS, Node 20.19)

## Automated — passed
| Check | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit -p .` | clean |
| Unit (engine, scoring, content, tributes, admin) | `npm test` | 69/69 |
| Content validation | `npx tsx scripts/validate-content.ts` | 207 items + 200 fresh samples valid |
| Simulation | `PGLITE_MEMORY=1 npx tsx scripts/simulate.ts 4 20` | 54 sets, 0 repeats, 0 invariant violations, outage catch-up correct |
| Production build | `npx next build` | passes |
| Browser e2e vs production server | `npx playwright test -c tests/e2e/playwright.config.ts` (server on :3200, see config) | 21/21 (Chromium + WebKit iPhone 13) |
| Capacity | `BASE_URL=http://localhost:3200 npx tsx scripts/verify-capacity.ts` | 20 teams/60 phones + TV, 120 s: 4,919 req, 0 errors, p95 37 ms (local, not Vercel) |
| Bundle secrets | grep `.next/static` | no passwords, tokens, DB/Blob names, answers, or mocks |

E2E coverage: QR→name→controller; refresh restore; invite-code member non-captain (UI + API); captain transfer revokes;
TV + 3 independent contexts synced; one score per team; double-tap/replay/different-choice; 20 concurrent tick/state
callers → one transition; no answer/seed leak pre-reveal; late join practice; away/resume; zero teams → ambient;
tribute upload portrait/landscape/PNG/EXIF-rotated, rejects corrupt/renamed/oversize/no-consent/bad token; edit-token
scoping; deleted photo not served; TV tribute without scores/timers; admin hide; all admin routes 401 unauthenticated;
pause/resume/skip; demo reset keeps live; no horizontal overflow at 320/375/430/landscape and TV 1080p/4K; reduced motion.

Defects found by the independent verifier and fixed: relative QR join URL; answer hint via scene seed (now opaque
hash); presence throttle could mark teams practice-only with short intros.

## Not verified (needs host devices/accounts)
- Physical HDMI TV, 4K panel, across-the-room QR scan.
- Real iPhone/Android sound + vibration (iOS Safari does not support `navigator.vibrate`; silent fallback tested).
- Real HEIC from iPhone Safari (browser-side conversion path).
- Vercel/Neon/Blob deployment, serverless restart persistence on Vercel, multi-hour real-time soak.
