# QA with isolated league fixtures

The in-memory API in `mock-backend.mjs` is local only. It supplies two tournaments, one team, two historical application states, and fixture accounts; no production records were changed. Start it with `node qa/mock-backend.mjs`, then run `qa/start-fixture.ps1`. Open `http://127.0.0.1:8091`.

| Scenario | Browser result |
| --- | --- |
| Guest, `/tournaments` | Open-registration Autumn Cup and completed Summer Finals render, including dates, capacity, winner and links. |
| Guest, `/draft` before publication | Shows explicit unpublished state. |
| Fixture admin | Can set up two captains and two picks, finish, publish. A simulated HTTP 503 shows an alert and permits retry. Retry shows publication success. |
| Guest, `/draft` after publication | Reads the published teams, captains, players and captain participation flag. Admin setup/history remains hidden. |
| Member, `/my-team` | Shows existing team, member ordering without position gaps, rejected application with resubmit link, withdrawn historical application. |
| Member, `/teams` | Directory shows team, search/sort controls, and normalized roster positions. |
| Member, `/archive` | Completed tournament shows date, participant count, winner, TDL points and results link. |

Fixture credentials (`admin@example.test`, `member@example.test`, password `fixture-password`) are fake and accepted only by the local mock server. The mock server does not emulate the production database's RLS; `node qa/draft-sql-check.mjs` separately executes the draft migration against isolated PGlite PostgreSQL (WASM PostgreSQL 18.6). That test supplies fixture `auth.uid`, `is_admin`, and `write_audit` functions plus guest/member roles, and checks validation, grants, roles, version conflicts and audit rollback. It is not proof of a production admin-to-guest publication cycle.

The production-backed before/after screenshots are in [screenshots](./screenshots), with their provenance in [README](./README.md). They reflect empty live league data and a signed-out account; the archive and team fixture states above were verified in the local browser, not presented as production data.

The draft migration was subsequently applied and checked against the live Cloud database; see [migration report](./migration-report.md). The original `after-draft-*` screenshots were taken before that migration; the final `verified-draft-*` captures show the post-migration guest state.
