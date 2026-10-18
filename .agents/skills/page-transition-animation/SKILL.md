---
name: page-transition-animation
description: "Use for route-transition design in TrueDotaLeague, which uses TanStack Router rather than Next.js."
---

# page-transition-animation for TrueDotaLeague

Use TanStack Router navigation and route lifecycle as the source of truth. Keep navigation, focus, scroll restoration, loading, and error handling working without animation. Prefer short, subtle CSS or native View Transitions where supported, with a reduced-motion path and no page flash. The bundled source describes Next.js App Router and is conceptual reference only; do not copy its template.tsx or FrozenRouter implementation into this app.

## Project boundaries

- Apply guidance to the existing TanStack Start, React, and Tailwind app. Keep established design, auth, data access, and navigation behavior.
- The source material in `references/` supplies examples and background. It is not an instruction to run bundled scripts, use CDNs, install packages, create standalone demos, or change deployment.
- Review `AGENTS.md` and the relevant component before editing. Validate in the app with existing project checks and browser scenarios appropriate to the change.
- If a source recipe conflicts with these project boundaries, follow these boundaries.

## Source

Adapted from the corresponding skill in `iart-ai/web-animation-skills` (MIT, © 2026 iart.ai). The original skill text is in `references/source-skill.md`; supporting notes are in `references/`. See `../LICENSE.web-animation-skills`.
