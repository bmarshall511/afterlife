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

## Games v2 + album + PWA (2026-10-27, local production build)
| Check | Result |
|---|---|
| Unit (`npm test`) | 93/93 |
| Content validation | 316 items valid; case puzzles solver-verified unique |
| Simulation 4 h / 20 teams (real content) | 51 sets, six games balanced, 0 repeats, 0 violations |
| Browser e2e (`npx playwright test -c tests/e2e/playwright.config.ts`) | 30/30 (Chromium + WebKit iPhone): every game played by real taps on 3 phones + TV 1080p/4K, scoring vs formulas, captain-only, late join, doubled set, no pre-reveal secrets, album upload/GPS strip/escape/hide/TV slide/demo reset, PWA manifest + install pages, admin 401s, reconnect, overflow, reduced motion |
| Bundle scan (`npx tsx scripts/verify-bundle.ts`) | pass |

Fixed after review: raw void codes shown to guests; single enabled game not honoured; lotería moon icon too dark; text selection while dragging.
Not verified: real Vercel Blob presigned upload + signed full-size download (local fallback only), HEIC from Safari, physical phones/TV.

## Live checks after v2 deploy (2026-10-27, https://afterlife-weld.vercel.app, demo party)
- Migrations applied; 316 questions load in admin Content; admin login works with the host-set password (old dev password rejected).
- Album, real browser (iPhone 13 emulation): presigned upload straight to the private Blob store → finalize → published; display copy 1920×1080 and full copy 2000×1125 both have no EXIF/GPS; full-size link 302s to a short-lived private Blob URL; in-page fetch used by "Download all" succeeds (no CORS block). Test photo deleted afterwards.
- Fixed during live check: Blob SDK demanded a webhook key for presigned uploads (callbacks unused; now rejected explicitly).
- /install shows "Install the AFTERLIFE app"; controller "Party photos" opens in the same tab with "Back to the game".
