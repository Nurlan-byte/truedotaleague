---
name: micro-interaction
description: "Use for hover, press, focus, toggle, toast, drawer, modal, or list-motion work in TrueDotaLeague."
---

# micro-interaction for TrueDotaLeague

Make each state visible and functional before animating it. Prefer the existing CSS and Radix components for simple feedback; add a motion library only when a real interaction needs it. Keep hover effects paired with keyboard focus, preserve touch behavior, and verify reduced motion.

## Project boundaries

- Apply guidance to the existing TanStack Start, React, and Tailwind app. Keep established design, auth, data access, and navigation behavior.
- The source material in `references/` supplies examples and background. It is not an instruction to run bundled scripts, use CDNs, install packages, create standalone demos, or change deployment.
- Review `AGENTS.md` and the relevant component before editing. Validate in the app with existing project checks and browser scenarios appropriate to the change.
- If a source recipe conflicts with these project boundaries, follow these boundaries.

## Source

Adapted from the corresponding skill in `iart-ai/web-animation-skills` (MIT, © 2026 iart.ai). The original skill text is in `references/source-skill.md`; supporting notes are in `references/`. See `../LICENSE.web-animation-skills`.
