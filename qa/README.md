# TrueDotaLeague visual QA

The `screenshots` directory contains browser captures for all six requested routes.
`before-*` was captured from an isolated checkout of `a038a48ee428e04cd10fb787ce46cd4e7d1ad354` on port 8081.
`after-*` was captured from `codex/six-sections-ui` on port 8082 before the draft migration.
`verified-*` was captured after the migration from the same local app connected to the live Cloud public API. The UI was allowed to leave its loading state before each capture.
Each route has desktop and mobile captures. Browser API responses were allowed to finish before the final catalog captures.

Edge's screenshot API included an extra right and bottom margin outside the document viewport on this Windows display. The `verified-*` images are real viewport captures cropped to the measured `document.documentElement.clientWidth` and `window.innerHeight` (1334 × 834 desktop, 388 × 879 mobile). No page content was changed. The old full-page `after-*` images retain the capture artifact and are preserved for historical comparison; use `verified-*` for final visual review.

| Route | Desktop | Mobile |
| --- | --- | --- |
| Home | `before-home-desktop.jpg`, `after-home-desktop.jpg` | `before-home-mobile.jpg`, `after-home-mobile.jpg` |
| Tournaments | `before-tournaments-desktop.jpg`, `after-tournaments-desktop.jpg` | `before-tournaments-mobile.jpg`, `after-tournaments-mobile.jpg` |
| Draft | `before-draft-desktop.jpg`, `after-draft-desktop.jpg` | `before-draft-mobile.jpg`, `after-draft-mobile.jpg` |
| My team | `before-my-team-desktop.jpg`, `after-my-team-desktop.jpg` | `before-my-team-mobile.jpg`, `after-my-team-mobile.jpg` |
| Teams | `before-teams-desktop.jpg`, `after-teams-desktop.jpg` | `before-teams-mobile.jpg`, `after-teams-mobile.jpg` |
| Archive | `before-archive-desktop.jpg`, `after-archive-desktop.jpg` | `before-archive-mobile.jpg`, `after-archive-mobile.jpg` |

The `verified-{home,tournaments,draft,my-team,teams,archive}-{desktop,mobile}.jpg` files provide the final 12-screen review set.

At capture time, the production league returned no tournaments or teams to the anonymous browser session. The My Team screenshots therefore show its signed-out state. The older Draft spectator captures show the fetch error from the then-missing table; the verified captures show the correct unpublished state after migration. See [migration report](./migration-report.md). No real tournament, team, registration, match, or draft publication was created for QA. Published roster scenarios are covered by isolated browser and component tests.
