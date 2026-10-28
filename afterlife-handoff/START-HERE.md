# AFTERLIFE — Claude Code handoff

This package is a specification and design asset set, not a built application. AFTERLIFE is the working name used in the approved mockup; keep it configurable.

Open this folder in Claude Code and paste:

```text
Build the complete application described in BUILD-BRIEF.md. Read that document, GAME-RULES.md, and ACCEPTANCE-CHECKLIST.md before implementing. Inspect design/approved-direction.png and the images in assets/; these are the visual source of truth. The approved design is cinematic black, restrained marigold accents, large Catrina fashion artwork, and clean modern typography. Do not substitute an ornate themed dashboard.

Implement the actual synchronized multiplayer app, persistent tribute upload flow, protected admin, content library, automated game engine, and Vercel deployment configuration. A frontend-only demo does not meet the requirements. Work through implementation and verification; do not stop after scaffolding or planning. Use current official documentation for selected services. Choose simple maintainable infrastructure suitable for Vercel, record choices, and provide exact setup steps. Ask only for account credentials, paid-service decisions, or genuinely blocking ambiguity. Never invent deployment success, provisioned resources, or test results.

First write a short implementation plan and dependency checklist, then build in vertical slices. Start with a production-shaped end-to-end flow: phone joins, TV shows a round, server accepts an answer, scores persist, and clients reconnect correctly. Implement tribute upload early because its link needs to be shared before the party. Then deliver the complete game rotation and visual polish. Preserve approved requirements throughout. Keep local demo/test data separate from real party data. Provide a local demo mode, migrations, .env.example without secrets, tests, a deployment/runbook, and a truthful completion report listing anything still blocked.

Use the bundled background assets with real HTML UI layered above them. Do not use screenshots as the live interface or treat mockup QR codes as functional. Do not generate or edit guests' tribute photos. Do not send invitations, delete real data, or enable paid services without authorization. Finish the implementation and deployment preparation before requesting any final external action that requires approval.
```

Contents:

- BUILD-BRIEF.md — product, UX, architecture requirements and operating behavior.
- GAME-RULES.md — proposed implementable gameplay and exact scoring defaults.
- ACCEPTANCE-CHECKLIST.md — behavioral, visual and operational acceptance criteria.
- assets/ — three generated, text-free background images and asset manifest.
- design/approved-direction.png — approved reference mockup, containing fictional sample tribute and illustrative QR code.

The game rules and timing values are recommended implementation defaults, not claims that the host individually approved every detail. Make them adjustable in admin without making guest onboarding more complex.
