---
name: ascii-animation
description: "Use only when a TrueDotaLeague task explicitly calls for ASCII art or image-to-ASCII animation."
---

# ascii-animation for TrueDotaLeague

Choose a readable character ramp and account for monospace cell aspect ratio. Avoid continuous work that harms responsiveness. Do not add Three.js, sharp, or any other runtime without a concrete product need. Verify a static fallback and reduced-motion state in the app.

## Project boundaries

- Apply guidance to the existing TanStack Start, React, and Tailwind app. Keep established design, auth, data access, and navigation behavior.
- The source material in `references/` supplies examples and background. It is not an instruction to run bundled scripts, use CDNs, install packages, create standalone demos, or change deployment.
- Review `AGENTS.md` and the relevant component before editing. Validate in the app with existing project checks and browser scenarios appropriate to the change.
- If a source recipe conflicts with these project boundaries, follow these boundaries.

## Source

Adapted from the corresponding skill in `iart-ai/web-animation-skills` (MIT, © 2026 iart.ai). The original skill text is in `references/source-skill.md`; supporting notes are in `references/`. See `../LICENSE.web-animation-skills`.
