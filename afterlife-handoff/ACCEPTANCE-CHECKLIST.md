# Acceptance and party-day checks

Claude Code must implement and run meaningful automated tests for engine/scoring/security and end-to-end browser flows. Record actual pass/fail, commands, browser/device limits and remaining blockers. Do not claim an unperformed physical HDMI/QR test passed.

## Essential journeys

- New guest opens QR destination, enters name, and reaches controller in one primary submission. No signup or mandatory upload.
- Refresh/reopen restores team. Extra member joins existing team without gaining another vote. Only current captain can submit. Captain handoff revokes old submission authority.
- Late join sees next-question participation and clear partial-set practice label; no retroactive points. Memory scene exposure rules are enforced server-side.
- TV and three independent mobile browser contexts see synchronized phases and one correct score change. Simulate at least 20 teams/60 connections separately for capacity.
- Away/resume behavior, all answers received, no answers, one team and zero teams complete without host intervention or deadlock.
- Wrong client clock, double taps, retries, delayed/replayed requests and two transition callers cannot extend deadlines or duplicate scores. Correct answers do not leak before reveal.
- TV refresh, admin closure and serverless instance restart do not reset scores, submissions or logical state.
- Disconnect/reconnect truthfully restores whether answer was saved. Expired stale controls cannot submit. Define and test outage catch-up/pause policy.

## Scoring

- Three objective questions produce 0–300 set score. No speed bonus.
- Best five score selection, provisional 1–4 set display, tied ranks, improvements and invalidation are deterministic and tested.
- Mid-set joining, pausing, disconnecting and merging duplicates cannot manufacture extra qualified sets or erase weak sets.
- Social polls freeze cohort and preferences before prediction; ties and insufficient respondents follow GAME-RULES.md. No self-reported client scores.
- Admin adjustments leave audit entries and recompute visible rankings correctly.

## Tributes

- Advance link works before game starts, on a separate browser without a team.
- Photo, name, optional 300-character memory and optional attribution preview correctly. Oversized/invalid/HEIC/rotated/landscape/group photos have tested handling with clear failures, never false success.
- Consent starts unchecked. Publish automatically enters queue only after validation succeeds.
- Guest private edit link edits/removes only their submission; no public identifier grants broader access. Host can manage all.
- Guest photo appearance is preserved. Portrait/group faces are not silently cropped. Re-encoded derivatives strip location metadata.
- Three or more tributes rotate fairly across breaks, newly added tributes appear, hidden/deleted ones are removed promptly, and queue persists after refresh.
- Remembrance mode hides all scoring and timers. 300-character text fits at TV distance. No winner effects, jokes or poll interactions overlap a tribute.
- Empty state is polished. Real uploads survive reset-test-data action. Fictional sample portraits never appear as actual guest tributes in production.

## UI and visual verification

- Compare implemented screenshots to design/approved-direction.png. The result uses real UI over artwork; no screenshot-as-interface.
- Verify desktop TV 1080p and 4K, phone widths 320/375/430px, landscape phone, enlarged text and safe areas. Check name/message overflow and long team names.
- Assess visible hierarchy, whitespace, giant legible question text, subtle art dimming, clean controls and no decorative clutter.
- All three background states load and crossfade without layout jumps or blocking interaction. No blank flash if next art loads slowly.
- Reduced motion removes drift/particles and avoids necessary animated clues without replacement. Controls have visible focus and labels; contrast passes appropriate accessibility checks.
- TV emits no sound. Phone sound is opt-in. Unsupported vibration does not error; test actual iOS/Android availability and describe limits. Locked-phone notifications are not promised.
- Production QR resolves to the correct public guest URL, not localhost, preview-auth wall, mockup domain or illustrative code.

## Admin and deployment

- Unauthenticated user cannot access admin data or invoke admin endpoints. Secrets never ship in public JS. Uploads cannot execute code; plain text cannot inject markup.
- Controls cover pause/resume, skip/invalidate, extend break, tribute-only mode, pacing, content enable/disable, team edits/merge, tribute edits/hide/delete and isolated demo reset.
- Migrations and seeds work from clean environment; .env.example names actual required keys without values. Production has durable DB and object storage, not local files or process memory.
- Verify official current Vercel/provider setup, build, deployed routes, persistence, upload permissions and event synchronization. Document any service costs or account requirements. No false deployment success.
- Run a multi-hour accelerated simulation for phase sequencing/content exhaustion and a real-time soak test for timers/reconnections; report exact coverage.

## Host runbook to deliver

1. Configure event and admin login; copy advance upload link; preview a real test tribute.
2. Check content/assets and verify sample data is isolated. Reset only test scores.
3. Connect powered MacBook over HDMI, prevent sleep, open /tv fullscreen, confirm network and physically scan QR from seating area with two phones.
4. Confirm visual-only round cues, readable text, sensible tribute dwell and captain submission.
5. Press Start once; operate without admin page remaining open.
6. Recover using pause/skip/reconnect; provide an always-available remembrance-only fallback.
7. End session gracefully; keep or export memories and delete via admin when desired. Explain actual storage/retention behavior.
