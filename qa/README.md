# TrueDotaLeague visual QA

The `screenshots` directory contains browser captures for all six requested routes.
`before-*` was captured from an isolated checkout of `a038a48ee428e04cd10fb787ce46cd4e7d1ad354` on port 8081.
`after-*` was captured from `codex/six-sections-ui` on port 8082.
Each route has desktop and mobile captures. Browser API responses were allowed to finish before the final catalog captures.

| Route | Desktop | Mobile |
| --- | --- | --- |
| Home | `before-home-desktop.jpg`, `after-home-desktop.jpg` | `before-home-mobile.jpg`, `after-home-mobile.jpg` |
| Tournaments | `before-tournaments-desktop.jpg`, `after-tournaments-desktop.jpg` | `before-tournaments-mobile.jpg`, `after-tournaments-mobile.jpg` |
| Draft | `before-draft-desktop.jpg`, `after-draft-desktop.jpg` | `before-draft-mobile.jpg`, `after-draft-mobile.jpg` |
| My team | `before-my-team-desktop.jpg`, `after-my-team-desktop.jpg` | `before-my-team-mobile.jpg`, `after-my-team-mobile.jpg` |
| Teams | `before-teams-desktop.jpg`, `after-teams-desktop.jpg` | `before-teams-mobile.jpg`, `after-teams-mobile.jpg` |
| Archive | `before-archive-desktop.jpg`, `after-archive-desktop.jpg` | `before-archive-mobile.jpg`, `after-archive-mobile.jpg` |

The production league currently returned no tournaments or teams to the anonymous browser session. The My Team screenshots therefore show its signed-out state. The new Draft spectator screen shows a fetch error because the draft publication migration has **not** been applied to production. No real tournament, team, registration, or match data was created for QA. The published roster and empty spectator states are covered by isolated component tests.
