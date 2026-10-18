# Draft publication migration: live database verification

On 2026-10-18, the authorized `drizzle/migrations/0002_draft_publication.sql` was run in the connected TrueDotaLeague Lovable Cloud SQL editor, wrapped in one explicit transaction. Lovable reported `Query succeeded`. This used the SQL editor directly; Lovable AI was not prompted and the site was not published.

Read-only checks after execution showed:

| Check | Result |
| --- | --- |
| `public.draft_publications` exists | Yes |
| `public.publish_draft_result(integer,jsonb)` exists | Yes |
| Published rows | 0 |
| Anonymous `SELECT` on `result` | Yes |
| Anonymous `SELECT` on `updated_by` | No |
| Authenticated direct `UPDATE` on the table | No |
| Authenticated `EXECUTE` on the RPC | Yes; RPC checks `is_admin(auth.uid())` |

The local UI, using its normal public connection to the live Cloud database, loaded `/draft` as a guest and displayed “Ведущий пока не опубликовал результат.” No production draft result was created for testing. The admin publication and guest/member display flows were exercised with the local in-memory fixture; SQL role, validation, version, and audit-rollback behavior was exercised separately using `npm run test:sql` in isolated PGlite.

The original `qa/screenshots/after-draft-*` captures predate this migration and show the expected fetch error from the then-missing table. The live guest check above confirms that error is gone. Lovable Stage3 remains paused for approval; `main` and the published site remain unchanged.
