# AFTERLIFE: implementation brief

## Purpose and confirmed constraints

Build an autonomous Día de los Muertos family party arcade plus a separate digital ofrenda. The party is Sunday, November 1, 2026, in America/Chicago, lasts several hours, and has variable arrivals and departures. Exact start/end times have not been provided; configure them rather than guessing. Expected attendance is approximately 15 adults and 12 children across about nine families, with two families unconfirmed. Support at least 20 teams and 60 connected clients to leave headroom.

The host will use Claude Code to implement and host on Vercel. TV display is a MacBook connected by HDMI. Guests play through mobile browsers, normally one shared device per family, with extra devices allowed. The host must be able to focus on the party: no manual question advancement, scoring, submission judging, or tribute approval required during normal operation.

Joining is scan QR → enter name → play. No guest accounts, app installation, mandatory survey, email, password, or setup wizard. Content and instructions are English. Spanish cultural names/headings may appear with immediately clear English meaning. No cash pot, entry fees, betting, payments or gambling features. TV is silent because separate party music will play. Optional phone cues must never be necessary to participate.

## Approved visual direction

Use design/approved-direction.png as the design reference. Earlier ornate concepts were rejected as busy and dated. Required qualities: modern, sleek, visually confident, animated, interactive, cinematic, themed, and glamorous. Large alluring adult Catrina-inspired woman in background key art; clean near-black negative space supports crisp white typography, selective marigold color, restrained violet/fuchsia state accents. Bold contemporary sans-serif, not ornamental display typography. No filigree frames, wallpaper of flowers/candles, dense cards, generic admin-dashboard styling on guest screens, or endless neon glow.

Background artwork is provided in assets/. Map amber/direct gaze to arrival and intermission, violet/left gaze to focus/gameplay, magenta/smile to results. These are different editorial portraits in a consistent collection, not exact identity-preserving animation frames. Crossfade rather than pretending to animate a single face. Preload next artwork. Subtle slow drift on idle screens, brief responsive light accents for answers/reveals, restrained petals for celebrations. All motion must have purpose and reduced-motion alternatives. Never delay input to complete an animation. Do not flash rapidly. During tributes, settle movement and dim art substantially so the guest portrait and words dominate.

Assets are static generated images; implement motion with CSS/rendering layers. Inspect actual dimensions and optimize derived web assets without stretching or overwriting original files. Use actual HTML for all text/buttons. Image mockup copy is illustrative, not binding game logic. Illustrative QR and domains in mockups are not real. Generate functional QR codes from configured public URLs.

## Surfaces and guest journeys

Suggested route structure (adapt as needed):

| Surface | Purpose |
|---|---|
| / | Beautiful small landing page with Play and Remember someone |
| /join | QR destination; name field and one primary join action |
| /play | Persistent team controller with current game state |
| /tv | Dedicated fullscreen shared display, no navigation chrome |
| /remember/<invite-token> | Shareable advance tribute upload link |
| /admin | Protected responsive host controls |

QR remains available during play and breaks with a short fallback URL. Reserve enough size and contrast to scan from the actual viewing distance; verify physically before the party. During remembrance, keep joining available in a quiet corner if it does not compete with the tribute. Respect TV safe margins. Test 1920×1080 and 3840×2160 display layouts. Small-screen controller must work from 320px width, use safe areas, large touch targets, high contrast, and labels plus icons. Never rely on color alone.

Assign a team avatar/color automatically. Optional customization later. Store a secure guest session so refresh/reopening on the same browser restores the team. A separate small Join existing team action uses an opaque team invitation link or short scoped code. Do not expose join secrets on the public leaderboard. Extra devices can view and participate in discussion, but only one captain device submits the team's scored answer/vote. Allow an explicit captain transfer, protected by team membership; handle loss/recovery without granting arbitrary public takeover. Make captain status clear without complicating the default one-phone flow.

Joining mid-question means watching until the next question begins. Joining mid-set allows next-question participation, but that partial set is practice only for party ranking. Explain this concisely. No new team can see a memory scene after its viewing phase and still submit a scored answer. Switching tabs or briefly losing connection restores the current server state and explains whether an answer was saved.

Controller always communicates state: starting soon, look at TV, choose an answer, saved, correct/incorrect, results, break, reconnecting. Repeat question text and choices on phones when appropriate. For visual-memory games, phones do not retain the vanished scene. Answer submission gets immediate local feedback, followed by server-confirmed saved state; failure must not look like success. Do not expose correct answers before reveal. A visible Taking a break control excludes the team from upcoming sets and crowd eligibility; resume takes effect at next eligible question.

## Autonomous pacing

Default cycle: 15-second introduction, three questions of approximately 35 seconds each plus 10-second reveal each, 30-second set results, 120-second social/tribute interval. Total 300 seconds, about five minutes. Individual game phases may divide question time differently; preserve sufficient reading time. Admin can adjust active and social durations independently. No hidden speed bonus.

Zero active teams: ambient remembrance/arrival mode, no scored empty sets. One or two teams: objective puzzles only. Three or more: objective games plus occasional crowd prediction. Re-evaluate eligibility at set boundaries; never change scoring conditions halfway through a question. Do not wait indefinitely for answers or votes. If all eligible teams answer, keep a brief minimum viewing interval and then reveal safely. Missing participation in a social game uses documented skip/fallback behavior.

All gameplay and answer reveals are prepared and deterministic at runtime. No live generative AI dependency required to keep the party moving. No music, voiced host, or autoplay audio on TV. Phone visual notification is default. Optional sound is off until explicitly enabled; optional vibration only where supported. Feature-detect and provide silent fallback, especially on iPhones. Do not promise background notifications or vibrations from a locked phone. Verify current browser support during implementation. No notification-permission request or PWA install step in onboarding.

## Digital ofrenda: independent advance workflow

Host copies a dedicated upload link from admin and sends it days before the party. The same feature remains accessible during the party. Uploading does not create a game team and does not require joining a game.

Form: one photo, required person's name, optional short remembrance (default max 300 characters), optional family attribution. Support multiple separate tributes per submitting family. Use humane prompts such as Share a memory, something they loved, or what you want us to remember. No death date or cause of death required. Plain text only. Accept common phone photo formats; verify HEIC handling, orientation, size limits and conversion. Preserve natural photo appearance; no AI retouching, themed makeup, or unsolicited filters. Preview with fit/position controls and never silently crop out faces. Offer fit-entire-photo mode for group and landscape images.

Preview before publishing. Explicit initially-unchecked consent to show photo and text on the party TV. A successful publication automatically enters the rotation; there is no moderation queue by default. Validate input and process photos before declaring successful publication. Submission has its own unguessable edit/remove capability, persisted locally and offered as a copyable private edit link. No email required. Guest can edit/remove their own tribute, not browse all private edit tokens. Host can manage everything in admin.

TV tribute state: large original guest photo on left, name and readable remembrance beside it, optional attribution, small heading Siempre presentes / Always remembered. Background Catrina heavily dimmed. Hide all scores, timers, victory effects, funny reactions and game controls. Never use loved ones as quiz content, points, voting, awards or leaderboards. Do not infer missing biographies. Rotate one tribute at a time with gentle crossfades. Dwell default 25 seconds, 20–35 seconds based on text length. Fair queue favors least-shown entries and quickly includes new ones without starving older ones. Complete the current tribute before moving to gameplay; show next-round countdown on controllers instead of over the remembrance. With many tributes, continue queue across breaks rather than restarting. If none exist, show polished ambient art and standings.

## Admin and host operation

Responsive secure admin works on host's phone and MacBook. Use proper authenticated server sessions, not a client-side password comparison or password in URL. Simple sections: Party, Tributes, Teams, Content, Preview/Diagnostics. Guest entry stays unauthenticated with scoped sessions/capabilities.

Party: one start action, pause/resume, skip current question/set, extend break, tribute-only mode, pacing settings, public URLs/QR downloads, schedule/timezone, clear current state. Pause freezes logical time. Resume does not expire every question immediately. No need to keep admin open.

Tributes: list thumbnails, search, add/edit text, rotate/reposition photo, hide/unhide, delete, reorder/feature next, see display count and preview. Hidden/deleted tributes disappear from future rotation promptly; safe transition if already visible. Maintain hidden originals for edits only where necessary and document deletion behavior.

Teams: names, connections, active/away state, merge duplicates with deterministic score reconciliation, captain recovery, remove disruptive team, auditable score adjustments with reason. Never silently sum duplicated submissions into extra points. Content: enable/disable game families, preview exact questions and explanations, repair content before play. Preview/demo uses isolated data; reset tests without deleting real submissions. Confirm destructive resets/deletions, not ordinary edits or pause actions.

## Technical requirements (architecture choices to validate)

Use a modern typed full-stack web application deployable on Vercel. A reasonable starting point is Next.js + TypeScript, persistent SQL database, object storage for tribute photos, and a managed realtime channel or resilient polling. These are implementation recommendations, not provisioned resources. Verify current official docs, service limits, browser APIs and costs before choosing providers. Avoid unnecessary paid dependencies; report any account setup that needs host action. Never claim Vercel alone automatically supplies shared persistence or realtime.

Persist authoritative party state, teams, memberships, question instances, answers, score ledger, tributes, queue display counts, admin settings and audit events. Never use process-local variables or local filesystem as authoritative production storage. Do not rely on a perpetual loop, long-lived socket server, or in-memory timer in a serverless request.

Use server-stored phase start/deadline and deterministic transitions. An authenticated TV controller can request advancement while server transactions enforce one transition per phase; any approved scheduler/worker should follow the same idempotent transition operation. Document who advances phases, how lease/failover works, and how the app catches up after an outage without replaying hours of empty rounds. TV or admin refresh must not reset the party. A dead TV client must not cause duplicate games or scoring; either pause safely or recover from persisted state with clearly defined policy.

All clients synchronize from authoritative snapshots and versioned events. Server validates membership, captain, question eligibility, deadlines and uniqueness. One answer per team per question; default locks on submission. Database uniqueness/idempotency prevents duplicate scoring on retries and concurrent calls. Client clock is display only, with measured server offset. Correct answers remain server-private until reveal. Rate-limit join, upload and answer endpoints without blocking expected party traffic.

Protect storage and credentials. Photos are personal family submissions; explain in plain language that anyone with the invite can submit and the TV displays them. Use scoped non-indexed event links, no public directory listing, access-controlled or scoped signed image access as appropriate. Re-encode uploads, remove location metadata from served derivatives, enforce content-type/byte limits and prevent executable uploads. Never put privileged keys in client bundles. Escape all user text. Provide host deletion/export controls and document retention without inventing a retention deadline.

Performance: preload current/next art and game assets, use optimized image derivatives, avoid giant backdrop downloads on every phone, pause expensive offscreen effects. Keep TV animation smooth and input responsive. Honor reduced motion. Reconnect with backoff; show truthful pending/failed state; disable stale question controls. An outage cannot safely accept offline scored answers after deadlines; explain reconnect behavior. MacBook preflight includes HDMI, fullscreen, power, preventing sleep, network and QR scan.

## Delivery requirements

Deliver complete source, migrations, seed content, asset mappings, .env.example, local demo instructions, current dependency choices, verification results and deployment instructions. Include a host runbook: configure, publish upload link, test, start party, pause, recover, end, export/delete. If credentials block deployment, finish all possible work and name exact missing actions. Do not report a live URL until deployment is actually verified.

Build for this party first; no subscription product, social network, chat, payments, guest profiles or compulsory uploads. Exact start/end time, custom domain and paid accounts remain configurable/unprovided.
