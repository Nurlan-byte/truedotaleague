---
name: gsap-web
description: "Use when a TrueDotaLeague feature specifically needs coordinated GSAP timelines or scroll-linked motion."
---

# gsap-web for TrueDotaLeague

First check whether CSS or the existing React stack can satisfy the interaction. If GSAP is warranted, add it through the project package manager as part of the approved feature work; do not load a CDN script. Scope effects to mounted React elements, clean them up on route change, and respect reduced motion. Do not replace native scrolling merely for decoration.

## Project boundaries

- Apply guidance to the existing TanStack Start, React, and Tailwind app. Keep established design, auth, data access, and navigation behavior.
- The source material in `references/` supplies examples and background. It is not an instruction to run bundled scripts, use CDNs, install packages, create standalone demos, or change deployment.
- Review `AGENTS.md` and the relevant component before editing. Validate in the app with existing project checks and browser scenarios appropriate to the change.
- If a source recipe conflicts with these project boundaries, follow these boundaries.

## Source

Adapted from the corresponding skill in `iart-ai/web-animation-skills` (MIT, © 2026 iart.ai). The original skill text is in `references/source-skill.md`; supporting notes are in `references/`. See `../LICENSE.web-animation-skills`.
