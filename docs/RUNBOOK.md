# Host runbook — Sunday, November 1, 2026

## Days before
1. Deploy (docs/DEPLOY.md). Log in at `/admin`.
2. Admin → Party → copy the **tribute upload link** and send it to families yourself. Anyone with the link can
   submit; photos appear on the TV automatically after the guest ticks consent.
3. Submit one test tribute to the **demo** party, view it on `/tv?party=demo`, then Admin → Party (demo) → Reset demo.
4. Admin → Content: skim questions; disable anything you don't want.
5. Admin → Party → pacing defaults: 15 s intro, 35 s questions, 10 s reveal, 30 s results, 120 s break.

## Party setup (30 min before)
1. MacBook on power, HDMI connected, sleep disabled (System Settings → Lock Screen/Battery; or run `caffeinate -d`).
2. Chrome → `PUBLIC_BASE_URL/tv` → fullscreen (⌃⌘F). Check network.
3. From the seating area, scan the QR with **two different phones**; join one team each. Confirm the TV shows
   them and text is readable from the couch.
4. Confirm a tribute appears and looks right (Admin → Tributes → preview).

## Run
- Press **Start** once in Admin → Party. You can close admin; any connected phone or the TV keeps it moving.
- Families: scan → name → play. Extra phones: "Invite" on the controller. Only the captain's tap counts.
- Pause/resume, skip a question (invalidates that set for everyone), extend break, or switch to
  **Tribute-only** mode at any time.

## Recover
- TV froze/closed: reopen `/tv`. Nothing resets.
- Wi-Fi drop: if nobody was connected for ~45 s, the unfinished set is invalidated for everyone and play resumes
  with a break (no replay of missed rounds).
- Team lost their phone: they rejoin via a teammate's Invite code, or Admin → Teams → set captain.
- Duplicate team: Admin → Teams → Merge (keeps the better score per set; never adds them).
- Score fix: Admin → Teams → Adjust (reason required; logged).
- Anything weird: switch to Tribute-only — the remembrance fallback always works.

## End
Admin → Party → End. Tributes remain until you delete them (Admin → Tributes; export first if desired).
