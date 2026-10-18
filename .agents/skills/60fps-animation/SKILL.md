---
name: 60fps-animation
description: "Use for animation performance work in TrueDotaLeague: stutter, layout thrashing, hover or scroll jank, and FLIP transitions."
---

# 60fps-animation for TrueDotaLeague

Profile the affected interaction before changing it. Prefer transform and opacity for moving layers; preserve readable text and actual layout. Batch layout reads before writes, use will-change sparingly, and verify the result on desktop and mobile. Respect reduced motion. The source examples are guidance, not a mandate to create a standalone HTML file.

## Project boundaries

- Apply guidance to the existing TanStack Start, React, and Tailwind app. Keep established design, auth, data access, and navigation behavior.
- The source material in `references/` supplies examples and background. It is not an instruction to run bundled scripts, use CDNs, install packages, create standalone demos, or change deployment.
- Review `AGENTS.md` and the relevant component before editing. Validate in the app with existing project checks and browser scenarios appropriate to the change.
- If a source recipe conflicts with these project boundaries, follow these boundaries.

## Source

Adapted from the corresponding skill in `iart-ai/web-animation-skills` (MIT, © 2026 iart.ai). The original skill text is in `references/source-skill.md`; supporting notes are in `references/`. See `../LICENSE.web-animation-skills`.
